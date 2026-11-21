import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { db, one, pool, sql } from '../src/lib/db'
import { decrypt, encrypt, safeReturn } from '../src/lib/core'
import {
  adminLogin,
  finishOtp,
  startOtp,
  totp,
  twilioRequest,
} from '../src/lib/identity'
import {
  beginGoogle,
  readGoogleIntent,
  verifyGoogleCode,
} from '../src/lib/google-oauth'
import { signInWithGoogle } from '../src/lib/google-account'
import {
  LoginTicket,
  OAuth2Client,
  type TokenPayload,
} from 'google-auth-library'
import { directory, publicTutor } from '../src/lib/directory'
import {
  openCheckout,
  razorWebhook,
  recordPayment,
  sandboxCheckout,
  setFee,
  verifyCheckout,
} from '../src/lib/payments'
import {
  addDocument,
  authorizedDocument,
  getApplication,
  issueDocumentLink,
  reviewApplication,
  saveDraft,
  submitApplication,
} from '../src/lib/onboarding'
import {
  changeMatch,
  changeRequirement,
  confirmContact,
  consentPreview,
  directRequest,
  expressInterest,
  getContact,
  opportunities,
  saveRequirement,
  saveStudent,
} from '../src/lib/marketplace'
import { disableParent, suspendTutor } from '../src/lib/admin'
import { admin, guardian, lookupCatalog, tutor } from './fixtures'

describe('Google sign-in', () => {
  it('binds the callback to state and nonce and sends a PKCE challenge', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret')
    const exchange = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockImplementation(async () => ({
        tokens: { id_token: 'test-token' },
        res: null,
      }))
    const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken')
    try {
      const result = await beginGoogle({
        role: 'tutor',
        next: '/tutor/settings',
      })
      const state = result.target.searchParams.get('state')
      expect(result.target.origin).toBe('https://accounts.google.com')
      expect(result.target.searchParams.get('code_challenge_method')).toBe(
        'S256',
      )
      expect(result.target.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3107/api/v1/auth/google/callback',
      )
      expect(() => readGoogleIntent(result.cookie, 'different-state')).toThrow()
      expect(() => readGoogleIntent(undefined, state)).toThrow()
      const intent = readGoogleIntent(result.cookie, state)
      expect(intent.next).toBe('/tutor/settings')
      verify.mockImplementation(
        async () =>
          new LoginTicket(undefined, {
            sub: 'subject',
            nonce: 'incorrect',
          } as TokenPayload),
      )
      await expect(
        verifyGoogleCode('oauth-code', intent),
      ).rejects.toMatchObject({ code: 'GOOGLE_INVALID_IDENTITY' })
      verify.mockImplementation(
        async () =>
          new LoginTicket(undefined, {
            sub: 'subject',
            nonce: intent.nonce,
          } as TokenPayload),
      )
      await expect(verifyGoogleCode('oauth-code', intent)).resolves.toBe(
        'subject',
      )
      expect(exchange).toHaveBeenCalledWith({
        code: 'oauth-code',
        codeVerifier: intent.verifier,
      })
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    }
  })

  it('uses one user across roles, leaves new numbers unverified and links existing records explicitly', async () => {
    const subject = randomUUID()
    const parent = await signInWithGoogle(subject, 'parent')
    const tutor = await signInWithGoogle(subject, 'tutor')
    expect(tutor.id).toBe(parent.id)
    expect((await getApplication(tutor.id)).status).toBe('draft')
    await expect(consentPreview(parent.id, randomUUID())).rejects.toMatchObject(
      { code: 'PHONE_VERIFICATION_REQUIRED' },
    )
    const existing = await guardian()
    const linked = randomUUID()
    expect(await signInWithGoogle(linked, 'parent', existing.id)).toEqual({
      id: existing.id,
      role: 'parent',
    })
    expect(await signInWithGoogle(linked, 'parent')).toEqual({
      id: existing.id,
      role: 'parent',
    })
    await expect(
      consentPreview(existing.id, randomUUID()),
    ).resolves.toHaveProperty('masked')
    await expect(
      signInWithGoogle(subject, 'parent', existing.id),
    ).rejects.toMatchObject({ code: 'GOOGLE_ALREADY_LINKED' })
  })

  it('refuses Twilio requests when disabled even when credentials exist', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'configured')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'configured')
    try {
      await expect(
        twilioRequest('https://verify.twilio.com', {}),
      ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
const path = 'scripts/fixtures/tutor-1.jpg'
type Guardian = Awaited<ReturnType<typeof guardian>>
let reviewer: Awaited<ReturnType<typeof admin>>

beforeAll(async () => {
  reviewer = await admin()
  await setFee(reviewer.id, 12345)
})
afterAll(async () => {
  await pool.end()
})
async function requirement(parent: Guardian, mode: 'open' | 'direct' = 'open') {
  const { board, subject, locality } = await lookupCatalog()
  const student = (await saveStudent(parent.id, {
    label: 'Learner A',
    class: 8,
    board,
  })) as { id: string }
  const input = {
    student: student.id,
    class: 8,
    board,
    locality,
    subjects: [subject],
    budget: 2300,
    unit: 'month' as const,
    days: [1],
    schedule: 'After 5 pm' as const,
    place: 'student_home' as const,
    details: 'Practice with fractions.',
    mode,
  }
  const saved = await saveRequirement(parent.id, input)
  await changeRequirement(parent, saved.id, 'publish')
  return { id: saved.id, input }
}
async function ready(parent: Guardian, req: string) {
  const t = await tutor()
  const match = await expressInterest(t.id, req)
  await changeMatch(parent, match.id, 'choose')
  return {
    match,
    t,
    consent: {
      agreed: true as const,
      ...(await consentPreview(parent.id, match.id)),
    },
  }
}
describe('Authentication and private data', () => {
  it('verifies the development OTP, consumes it once and persists the selected role', async () => {
    const logger = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const id = await startOtp(
        { phone: '+916543210000', role: 'tutor' },
        'fixture-' + reviewer.id,
      )
      const code = String(logger.mock.calls.at(-1)?.[0]).match(
        /code (\d{6})/,
      )![1]
      await expect(
        finishOtp(id, code === '111111' ? '222222' : '111111', 'fixture'),
      ).rejects.toMatchObject({ code: 'OTP_INVALID' })
      const actor = await finishOtp(id, code, 'fixture')
      expect(actor.role).toBe('tutor')
      expect((await getApplication(actor.id)).status).toBe('draft')
      await expect(finishOtp(id, code, 'fixture')).rejects.toMatchObject({
        code: 'OTP_INVALID',
      })
    } finally {
      logger.mockRestore()
    }
  })
  it('requires valid admin MFA and rejects reuse of the same time step', async () => {
    const code = totp(reviewer.key, Math.floor(Date.now() / 30000))
    await expect(
      adminLogin(
        { email: reviewer.email, password: 'wrong', code },
        'test-admin-' + reviewer.id,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' })
    await expect(
      adminLogin(
        { email: reviewer.email, password: reviewer.password, code },
        'test-admin-' + reviewer.id,
      ),
    ).resolves.toEqual({ id: reviewer.id, role: 'admin' })
    await expect(
      adminLogin(
        { email: reviewer.email, password: reviewer.password, code },
        'test-admin-' + reviewer.id,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID' })
  })
  it('binds encrypted data to its purpose and validates login return paths', () => {
    const encrypted = encrypt('example', 'disclosure:one')
    expect(decrypt(encrypted, 'disclosure:one')).toBe('example')
    expect(() => decrypt(encrypted, 'disclosure:two')).toThrow()
    expect(safeReturn('//example.invalid')).toBe('')
    expect(safeReturn('/tutors/ananya?request=1')).toBe(
      '/tutors/ananya?request=1',
    )
  })
})
describe('Lifecycle and payment', () => {
  it('blocks rejected tutors and hides approved unpaid tutors', async () => {
    const rejected = await tutor('rejected', false)
    await expect(openCheckout(rejected.id)).rejects.toMatchObject({
      code: 'INVALID_APPLICATION_STATE',
    })
    const eligible = await tutor('approved', false)
    expect(await publicTutor(eligible.slug)).toBeUndefined()
    const opened = await openCheckout(eligible.id)
    expect((await openCheckout(eligible.id)).id).toBe(opened.id)
    await sandboxCheckout(eligible.id, opened.id, 'failed')
    expect(await publicTutor(eligible.slug)).toBeUndefined()
    const verified = await sandboxCheckout(eligible.id, opened.id, 'captured')
    expect(verified.state).toBe('captured')
    await sandboxCheckout(eligible.id, opened.id, 'captured')
    expect((await publicTutor(eligible.slug))?.id).toBe(eligible.id)
    const summary = await one<{
      activations: number
      events: number
    }>(sql`select
      (select count(*)::int from audit_events where entity_id=${eligible.id} and action='tutor.activate') activations,
      (select count(*)::int from payment_events where order_id=${opened.id}) events`)
    expect(summary).toMatchObject({ activations: 1, events: 2 })
  })
  it('deduplicates a gateway event, records refunds, and keeps a suspended tutor hidden', async () => {
    const t = await tutor('approved', false)
    const order = await openCheckout(t.id)
    await suspendTutor(reviewer.id, t.id, true, 'Verification follow-up')
    const payment = {
      id: 'pay_test_' + order.id,
      order_id: order.orderId!,
      amount: order.amount,
      currency: 'INR',
      status: 'captured',
      amount_refunded: 0,
    }
    await Promise.all([
      recordPayment(
        order.id,
        'evt:' + order.id,
        'payment.captured',
        payment,
        'sandbox',
      ),
      recordPayment(
        order.id,
        'evt:' + order.id,
        'payment.captured',
        payment,
        'sandbox',
      ),
    ])
    const count = await one<{ count: number }>(
      sql`select count(*)::int count from payment_events where order_id=${order.id}`,
    )
    expect(count?.count).toBe(1)
    expect(await publicTutor(t.slug)).toBeUndefined()
    await recordPayment(
      order.id,
      'refund:' + order.id,
      'refund.processed',
      { ...payment, status: 'refunded', amount_refunded: order.amount },
      'sandbox',
    )
    expect(
      await one(
        sql`select state,refunded_amount from payment_orders where id=${order.id}`,
      ),
    ).toMatchObject({ state: 'refunded', refunded_amount: order.amount })
  })
  it('verifies Razorpay signatures, payment status and amount, and deduplicates a signed webhook', async () => {
    const t = await tutor('approved', false)
    const marker = t.id.replaceAll('-', '')
    const gatewayOrder = 'order_' + marker
    const gatewayPayment = 'pay_' + marker
    const gatewayKey = 'fake-razorpay-gateway-key'
    const webhookKey = 'fake-razorpay-webhook-key'
    const hmac = (key: string, raw: string) =>
      createHmac('sha256', key).update(raw).digest('hex')
    let amount = 1
    let status = 'authorized'
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_fixture')
    vi.stubEnv('RAZORPAY_KEY_SECRET', gatewayKey)
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', webhookKey)
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://api.razorpay.com/v1/orders') {
        const details = JSON.parse(String(init?.body))
        amount = details.amount
        return Response.json({ id: gatewayOrder })
      }
      if (url === 'https://api.razorpay.com/v1/payments/' + gatewayPayment) {
        return Response.json({
          id: gatewayPayment,
          order_id: gatewayOrder,
          amount,
          currency: 'INR',
          status,
          amount_refunded: 0,
        })
      }
      throw new Error('Unexpected provider endpoint')
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const order = await openCheckout(t.id)
      const payload = {
        razorpay_order_id: gatewayOrder,
        razorpay_payment_id: gatewayPayment,
        razorpay_signature: hmac(
          gatewayKey,
          gatewayOrder + '|' + gatewayPayment,
        ),
      }
      await expect(
        verifyCheckout(t.id, {
          ...payload,
          razorpay_signature: '0'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_VERIFIED' })
      await expect(verifyCheckout(t.id, payload)).rejects.toMatchObject({
        code: 'PAYMENT_NOT_VERIFIED',
      })
      const raw = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: gatewayPayment } } },
      })
      const signed = hmac(webhookKey, raw)
      const eventId = 'test-' + marker
      await expect(
        razorWebhook(raw + ' ', signed, eventId),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      status = 'captured'
      amount = order.amount + 1
      await expect(razorWebhook(raw, signed, eventId)).rejects.toMatchObject({
        code: 'PAYMENT_NOT_VERIFIED',
      })
      expect(await publicTutor(t.slug)).toBeUndefined()
      amount = order.amount
      await Promise.all([
        razorWebhook(raw, signed, eventId),
        razorWebhook(raw, signed, eventId),
      ])
      expect((await publicTutor(t.slug))?.id).toBe(t.id)
      expect(
        await one(
          sql`select count(*)::int count from payment_events where order_id=${order.id}`,
        ),
      ).toMatchObject({ count: 1 })
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  })
  it('locks submitted revisions, gates documents and audits an approval', async () => {
    const t = await tutor('unverified', false)
    await db.execute(
      sql`update users set phone_verified_at=now() where id=${t.id}`,
    )
    await db.execute(
      sql`insert into tutor_applications(tutor_id) values(${t.id})`,
    )
    const { locality, subject, board } = await lookupCatalog()
    const values = {
      legalName: 'Synthetic Tutor',
      displayName: 'Example Tutor',
      locality,
      intro: 'I teach mathematics with many worked examples.',
      subjects: [subject],
      classes: [8],
      boards: [board],
      areas: [locality],
      days: [1],
      teachingPlace: 'student_home' as const,
      fee: 2200,
      feeUnit: 'month' as const,
      qualification: 'B.Ed.',
      institution: 'Example College',
      credentials: 'Sample credential',
      experience: 2,
      additional: '',
      declaration: true,
    }
    await saveDraft(t.id, values)
    const bytes = new Uint8Array(await readFile(path))
    const file = new File([bytes], 'fixture.jpg', { type: 'image/jpeg' })
    const doc = await addDocument(t.id, 'identity', file)
    await addDocument(t.id, 'academic', file)
    await addDocument(t.id, 'photo', file)
    await submitApplication(t.id, {})
    const app = await getApplication(t.id)
    expect(app.status).toBe('pending_review')
    await expect(
      saveDraft(t.id, { displayName: 'Late edit' }),
    ).rejects.toMatchObject({ code: 'INVALID_APPLICATION_STATE' })
    await expect(issueDocumentLink(t, doc!.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const issued = new URL(
      await issueDocumentLink(reviewer, doc!.id),
      'http://localhost',
    )
    const expiry = Number(issued.searchParams.get('expiry'))
    const sig = issued.searchParams.get('signature')!
    await expect(
      authorizedDocument(t, doc!.id, expiry, sig),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      authorizedDocument(reviewer, doc!.id, expiry, sig),
    ).resolves.toMatchObject({ kind: 'identity' })
    const decision = {
      decision: 'approved' as const,
      revision: app.revision,
      notes: 'Qualification checked',
      identityChecked: true,
      academicChecked: true,
    }
    await expect(
      reviewApplication(reviewer.id, app.id, {
        ...decision,
        identityChecked: false,
      }),
    ).rejects.toMatchObject({ code: 'CHECKLIST_REQUIRED' })
    await reviewApplication(reviewer.id, app.id, {
      ...decision,
      decision: 'changes_required',
    })
    await saveDraft(t.id, { displayName: 'Revised tutor' })
    await submitApplication(t.id, {})
    await expect(
      reviewApplication(reviewer.id, app.id, decision),
    ).rejects.toMatchObject({ code: 'INVALID_APPLICATION_STATE' })
    await reviewApplication(reviewer.id, app.id, {
      ...decision,
      revision: app.revision + 1,
    })
    expect(await publicTutor(t.slug)).toBeUndefined()
    expect(
      await one(
        sql`select actor_id from audit_events where entity_id=${app.id} and action='application.approved'`,
      ),
    ).toMatchObject({ actor_id: reviewer.id })
  })
  it('filters paginated profiles by offering, locality, cost and day', async () => {
    const t = await tutor()
    const { board, subject, locality } = await lookupCatalog()
    const { tutors } = await directory(
      {
        board,
        subject,
        locality,
        class: 8,
        day: 1,
        unit: 'month',
        min: 3000,
        max: 3000,
        sort: 'newest',
        page: 1,
      },
      30,
    )
    expect(tutors.some((item) => item.id === t.id)).toBe(true)
    const result = await directory(
      {
        board,
        subject,
        locality,
        class: 8,
        day: 2,
        unit: 'month',
        sort: 'newest',
        page: 1,
      },
      30,
    )
    expect(result.tutors.some((item) => item.id === t.id)).toBe(false)
  })
})
describe('Direct and open matching', () => {
  it('requires both parties, shares only the verified guardian number, and revokes access', async () => {
    const parent = await guardian()
    const other = await guardian()
    const t = await tutor()
    const another = await tutor()
    const req = await requirement(parent, 'direct')
    const match = await directRequest(parent.id, req.id, t.id)
    await expect(directRequest(parent.id, req.id, t.id)).rejects.toMatchObject({
      code: 'MATCH_EXISTS',
    })
    await expect(getContact(t.id, match.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      confirmContact(parent.id, match.id, {
        agreed: true,
        ...(await consentPreview(parent.id, match.id)),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MATCH_STATE' })
    await expect(
      saveRequirement(other.id, req.input, req.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await changeMatch(t, match.id, 'accept')
    await expect(getContact(t.id, match.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      confirmContact(parent.id, match.id, {
        agreed: true,
        ...(await consentPreview(parent.id, match.id)),
        proof: '0'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    await confirmContact(parent.id, match.id, {
      agreed: true,
      ...(await consentPreview(parent.id, match.id)),
    })
    await expect(getContact(t.id, match.id)).resolves.toEqual({
      phone: parent.phone,
    })
    await expect(getContact(another.id, match.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await changeMatch(parent, match.id, 'cancel')
    await expect(getContact(t.id, match.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      await one(
        sql`select slot from contact_disclosures where match_id=${match.id}`,
      ),
    ).toMatchObject({ slot: 1 })
  })
  it('serializes competing confirmations, preserves three unique slots, and stops new applications', async () => {
    const parent = await guardian()
    const req = await requirement(parent)
    const entries = await Promise.all(
      Array.from({ length: 4 }, () => ready(parent, req.id)),
    )
    await confirmContact(parent.id, entries[0].match.id, entries[0].consent)
    await changeMatch(parent, entries[0].match.id, 'cancel')
    await confirmContact(parent.id, entries[1].match.id, entries[1].consent)
    await confirmContact(parent.id, entries[1].match.id, entries[1].consent)
    const result = await Promise.allSettled(
      entries
        .slice(2)
        .map((entry) =>
          confirmContact(parent.id, entry.match.id, entry.consent),
        ),
    )
    expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(
      1,
    )
    expect(result.find((entry) => entry.status === 'rejected')).toMatchObject({
      reason: { code: 'CONNECTION_LIMIT_REACHED' },
    })
    const counts = await one(
      sql`select count(*)::int disclosed,count(distinct tutor_id)::int tutors from contact_disclosures where requirement_id=${req.id}`,
    )
    expect(counts).toEqual({ disclosed: 3, tutors: 3 })
    const fifth = await tutor()
    await expect(expressInterest(fifth.id, req.id)).rejects.toMatchObject({
      code: 'CONNECTION_LIMIT_REACHED',
    })
    expect(
      (await opportunities(fifth.id)).items.some((item) => item.id === req.id),
    ).toBe(false)
  })
  it('blocks suspended tutors and disabled guardian contacts', async () => {
    const parent = await guardian()
    const req = await requirement(parent)
    const t = await tutor()
    await suspendTutor(reviewer.id, t.id, true, 'Account review pending')
    await expect(expressInterest(t.id, req.id)).rejects.toMatchObject({
      code: 'TUTOR_NOT_ACTIVE',
    })
    const readyMatch = await ready(parent, req.id)
    await confirmContact(parent.id, readyMatch.match.id, readyMatch.consent)
    await disableParent(reviewer.id, parent.id, true, 'Account review pending')
    await expect(
      getContact(readyMatch.t.id, readyMatch.match.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
