import { z, ZodError } from 'zod'
import { NextResponse } from 'next/server'
import { establish, requireActor, signOut } from '@/lib/auth'
import {
  adminInput,
  adminLogin,
  finishOtp,
  limit,
  otpInput,
  startOtp,
} from '@/lib/identity'
import { Fault, invariant, uuid } from '@/lib/core'
import { catalog } from '@/lib/catalog'
import {
  directory,
  directoryInput,
  publicTutor,
  publicPhoto,
} from '@/lib/directory'
import { readObject } from '@/lib/storage'
import {
  addDocument,
  authorizedDocument,
  decisionInput,
  draftDocuments,
  draftInput,
  getApplication,
  issueDocumentLink,
  requestCredentialReview,
  reviewApplication,
  saveDraft,
  submitApplication,
  teachingProfile,
  text,
  updateTeachingProfile,
} from '@/lib/onboarding'
import {
  checkoutInput,
  currentFee,
  openCheckout,
  paymentHistory,
  razorWebhook,
  reconcilePayment,
  sandboxCheckout,
  setFee,
  verifyCheckout,
} from '@/lib/payments'
import * as market from '@/lib/marketplace'
import * as operations from '@/lib/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: noStore })
const successful = (data?: unknown) => json({ ok: true, data: data ?? null })
const uid = (value: unknown) => uuid.parse(value)
const listSections = z.enum([
  'applications',
  'tutors',
  'parents',
  'requirements',
  'matches',
  'payments',
  'reports',
  'audit',
])
const otpFinish = z.object({ id: uuid, code: z.string().regex(/^\d{6}$/) })
const consentError = {
  error: { code: 'CONSENT_REQUIRED', message: 'Explicit consent is required.' },
  ok: false,
}
function clientIp(req: Request) {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER
  return header
    ? (req.headers.get(header)?.split(',')[0]?.trim() || 'unknown').slice(
        0,
        100,
      )
    : 'untrusted'
}
function validateOrigin(req: Request) {
  const origin =
    process.env.APP_ORIGIN ??
    (process.env.NODE_ENV === 'production' ? '' : new URL(req.url).origin)
  invariant(
    origin && req.headers.get('origin') === origin,
    'FORBIDDEN',
    'This request origin is not allowed.',
    403,
  )
}
async function requestText(req: Request, maximum: number) {
  invariant(
    Number(req.headers.get('content-length')) <= maximum,
    'BODY_TOO_LARGE',
    'Request is too large.',
    413,
  )
  const reader = req.body?.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  if (!reader) return ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > maximum) {
        await reader.cancel()
        throw new Fault('BODY_TOO_LARGE', 'Request is too large.', 413)
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}
async function body(req: Request) {
  invariant(
    req.headers.get('content-type')?.startsWith('application/json'),
    'INVALID_INPUT',
    'Expected a JSON request.',
  )
  const raw = await requestText(req, 20000)
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Fault('INVALID_INPUT', 'The request could not be read.')
  }
}
function fileResponse(bytes: Uint8Array<ArrayBuffer>, mime: string) {
  const attachment =
    mime === 'application/pdf'
      ? 'attachment; filename="verification.pdf"'
      : 'inline'
  return new Response(bytes, {
    headers: {
      ...noStore,
      'Content-Type': mime,
      'Content-Disposition': attachment,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
async function get(req: Request, path: string[]) {
  const [group, name, id, action] = path
  const query = new URL(req.url).searchParams
  if (group === 'catalog' && !name) return successful(await catalog())
  if (group === 'tutors') {
    if (name && id === 'photo') {
      const photo = await publicPhoto(name)
      invariant(photo, 'NOT_FOUND', 'Profile photo is unavailable.', 404)
      return fileResponse(await readObject(photo.photo_key), 'image/jpeg')
    }
    if (name) {
      const tutor = await publicTutor(name)
      invariant(tutor, 'NOT_FOUND', 'Tutor could not be found.', 404)
      return successful(tutor)
    }
    return successful(
      await directory(directoryInput.parse(Object.fromEntries(query))),
    )
  }
  if (group === 'parent') {
    const user = await requireActor('parent')
    if (name === 'students')
      return successful(await market.listStudents(user.id))
    if (name === 'requirements')
      return successful(await market.listRequirements(user.id))
    if (name === 'settings')
      return successful(await market.parentSettings(user.id))
  }
  if (group === 'requirements' && name && !id) {
    const user = await requireActor('parent')
    const requirement = await market.parentRequirement(user.id, uid(name))
    invariant(requirement, 'NOT_FOUND', 'Requirement could not be found.', 404)
    return successful(requirement)
  }
  if (group === 'tutor') {
    const user = await requireActor('tutor')
    if (name === 'application') {
      const app = await getApplication(user.id)
      const documents = await draftDocuments(app.id)
      return successful({
        ...app,
        documents: documents.map(({ id, kind }) => ({ id, kind })),
      })
    }
    if (name === 'opportunities') {
      const result = await market.opportunities(
        user.id,
        operations.pagination.parse(query.get('page') ?? 1),
      )
      return successful({
        ...result,
        items: result.items.map(
          ({
            id,
            class: grade,
            board,
            locality,
            subjects,
            budget,
            unit,
            days,
            schedule,
            teaching_place,
          }) => ({
            id,
            class: grade,
            board,
            locality,
            subjects,
            budget,
            unit,
            days,
            schedule,
            teaching_place,
          }),
        ),
      })
    }
  }
  if (group === 'matches') {
    if (name && id === 'contact') {
      const user = await requireActor('tutor')
      await limit('contact:' + user.id, 60, 3600)
      return successful(await market.getContact(user.id, uid(name)))
    }
    if (!name)
      return successful(
        await market.listMatches(await requireActor('parent', 'tutor')),
      )
  }
  if (group === 'payments' && name === 'history') {
    const user = await requireActor('tutor')
    return successful(await paymentHistory(user.id))
  }
  if (group === 'admin') {
    const user = await requireActor('admin')
    if (name === 'documents' && id) {
      await limit('documents:' + user.id, 100, 3600)
      if (action === 'content') {
        const doc = await authorizedDocument(
          user,
          uid(id),
          Number(query.get('expiry')),
          query.get('signature') ?? '',
        )
        return fileResponse(await readObject(doc.object_key), doc.mime)
      }
      const link = await issueDocumentLink(user, uid(id))
      return NextResponse.redirect(
        new URL(link, process.env.APP_ORIGIN ?? req.url),
        { headers: noStore },
      )
    }
    if (name === 'applications' && id)
      return successful(await operations.reviewDetails(uid(id)))
    if (name === 'fees') return successful(await currentFee())
    if (name === 'dashboard')
      return successful(await operations.adminDashboard())
    if (name === 'catalog') return successful(await operations.adminCatalog())
    const section = listSections.safeParse(name)
    if (section.success)
      return successful(
        await operations.adminList(
          section.data,
          operations.pagination.parse(query.get('page') ?? 1),
        ),
      )
  }
  throw new Fault('NOT_FOUND', 'Endpoint not found.', 404)
}

async function post(req: Request, path: string[]) {
  const [group, name, id, action] = path
  if (group === 'webhooks' && name === 'razorpay' && !id) {
    return successful(
      await razorWebhook(
        await requestText(req, 262144),
        req.headers.get('x-razorpay-signature') ?? '',
        req.headers.get('x-razorpay-event-id') ?? '',
      ),
    )
  }
  validateOrigin(req)
  if (group === 'auth') {
    if (name === 'logout') {
      await signOut()
      return successful()
    }
    if (name === 'otp-start')
      return successful({
        id: await startOtp(otpInput.parse(await body(req)), clientIp(req)),
      })
    if (name === 'otp-finish') {
      const input = otpFinish.parse(await body(req))
      const user = await finishOtp(input.id, input.code, clientIp(req))
      await establish(user)
      return successful({ role: user.role })
    }
    if (name === 'admin-login') {
      const user = await adminLogin(
        adminInput.parse(await body(req)),
        clientIp(req),
      )
      await establish(user)
      return successful({ role: user.role })
    }
  }
  if (group === 'tutor') {
    const user = await requireActor('tutor')
    if (name === 'application') {
      if (id === 'document') {
        await limit('upload:' + user.id, 18, 3600)
        const maximum = 8 * 1024 * 1024 + 8192
        invariant(
          Number(req.headers.get('content-length')) <= maximum,
          'BODY_TOO_LARGE',
          'Files must be 8 MB or smaller.',
          413,
        )
        invariant(
          req.headers.get('content-type')?.startsWith('multipart/form-data;'),
          'INVALID_INPUT',
          'Expected a file upload.',
        )
        let count = 0
        const stream = req.body?.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              count += chunk.byteLength
              if (count > maximum)
                throw new Fault(
                  'BODY_TOO_LARGE',
                  'Files must be 8 MB or smaller.',
                  413,
                )
              controller.enqueue(chunk)
            },
          }),
        )
        const data = await new Response(stream, {
          headers: { 'Content-Type': req.headers.get('content-type')! },
        }).formData()
        const kind = z
          .enum(['identity', 'academic', 'photo'])
          .parse(data.get('kind'))
        const file = data.get('file')
        invariant(
          file instanceof File,
          'INVALID_FILE',
          'Choose a file to upload.',
        )
        return successful(await addDocument(user.id, kind, file))
      }
      if (id === 'reverify') {
        await requestCredentialReview(user.id)
        return successful()
      }
      const input = draftInput.parse(await body(req))
      if (id === 'submit') await submitApplication(user.id, input)
      else if (id === 'draft') await saveDraft(user.id, input)
      else throw new Fault('NOT_FOUND', 'Endpoint not found.', 404)
      return successful()
    }
    if (name === 'profile') {
      await updateTeachingProfile(
        user.id,
        teachingProfile.parse(await body(req)),
      )
      return successful()
    }
  }
  if (group === 'parent') {
    const user = await requireActor('parent')
    if (name === 'students') {
      if (id && action === 'archive')
        await market.archiveStudent(user.id, uid(id))
      else
        return successful(
          await market.saveStudent(
            user.id,
            market.studentInput.parse(await body(req)),
            id ? uid(id) : undefined,
          ),
        )
      return successful()
    }
    if (name === 'saved' && id) {
      const input = z.object({ save: z.boolean() }).parse(await body(req))
      await market.setSaved(user.id, uid(id), input.save)
      return successful()
    }
    if (name === 'settings') {
      const input = market.settingsInput.parse(await body(req))
      await market.updateSettings(user.id, input.displayName)
      return successful()
    }
  }
  if (group === 'requirements') {
    if (id === 'interest') {
      const user = await requireActor('tutor')
      await limit('tutor-interest:' + user.id, 30, 3600)
      return successful(await market.expressInterest(user.id, uid(name)))
    }
    if (id === 'state') {
      const user = await requireActor('parent', 'admin')
      const input = z
        .object({ action: market.requirementAction })
        .parse(await body(req))
      await market.changeRequirement(user, uid(name), input.action)
      return successful()
    }
    if (id === 'direct') {
      const user = await requireActor('parent')
      await limit('direct:' + user.id, 30, 3600)
      const input = z.object({ tutor: uuid }).parse(await body(req))
      return successful(
        await market.directRequest(user.id, uid(name), input.tutor),
      )
    }
    const user = await requireActor('parent')
    if (!name) await limit('requirements:' + user.id, 20, 3600)
    return successful(
      await market.saveRequirement(
        user.id,
        market.requirementInput.parse(await body(req)),
        name ? uid(name) : undefined,
      ),
    )
  }
  if (group === 'matches' && name) {
    const user = await requireActor('parent', 'tutor')
    if (id === 'consent') {
      invariant(
        user.role === 'parent',
        'FORBIDDEN',
        'Only the guardian can share their contact.',
        403,
      )
      await limit('consent:' + user.id, 50, 3600)
      const parsed = market.consentInput.safeParse(await body(req))
      if (!parsed.success) return json(consentError, 400)
      return successful(
        await market.confirmContact(user.id, uid(name), parsed.data),
      )
    }
    if (id === 'report') {
      await limit('report:' + user.id, 10, 3600)
      const input = z.object({ reason: text(8, 1200) }).parse(await body(req))
      await market.reportMatch(user, uid(name), input.reason)
      return successful()
    }
    if (id === 'state') {
      const input = z
        .object({ action: market.matchAction })
        .parse(await body(req))
      await market.changeMatch(user, uid(name), input.action)
      return successful()
    }
  }
  if (group === 'payments') {
    const user = await requireActor('tutor')
    await limit('payment:' + user.id, 30, 3600)
    if (name === 'order') return successful(await openCheckout(user.id))
    if (name === 'verify')
      return successful(
        await verifyCheckout(user.id, checkoutInput.parse(await body(req))),
      )
    if (name === 'sandbox') {
      const input = z
        .object({ id: uuid, outcome: z.enum(['captured', 'failed']) })
        .parse(await body(req))
      return successful(await sandboxCheckout(user.id, input.id, input.outcome))
    }
  }
  if (group === 'admin') {
    const user = await requireActor('admin')
    if (name === 'applications' && id && action === 'review') {
      await reviewApplication(
        user.id,
        uid(id),
        decisionInput.parse(await body(req)),
      )
      return successful()
    }
    if (name === 'fees') {
      const input = z
        .object({ amount: z.number().int().min(100).max(100000000) })
        .parse(await body(req))
      await setFee(user.id, input.amount)
      return successful()
    }
    if ((name === 'tutors' || name === 'parents') && id) {
      const input = operations.adminAccountInput.parse(await body(req))
      if (name === 'tutors')
        await operations.suspendTutor(
          user.id,
          uid(id),
          !input.enabled,
          input.reason,
        )
      else
        await operations.disableParent(
          user.id,
          uid(id),
          !input.enabled,
          input.reason,
        )
      return successful()
    }
    if (name === 'reports' && id) {
      const input = z
        .object({ resolution: operations.reportResolution })
        .parse(await body(req))
      await operations.resolveReport(user.id, uid(id), input.resolution)
      return successful()
    }
    if (name === 'catalog' && id) {
      await operations.saveCatalog(
        user.id,
        operations.adminCatalogKeys.parse(id),
        operations.catalogInput.parse(await body(req)),
        action ? uid(action) : undefined,
      )
      return successful()
    }
    if (name === 'payments' && id && action === 'reconcile') {
      await limit('reconcile:' + user.id, 60, 3600)
      await reconcilePayment(user.id, uid(id))
      return successful()
    }
  }
  if (group === 'notifications' && name === 'read') {
    const user = await requireActor()
    const input = operations.noticeInput.parse(await body(req))
    await operations.readNotice(user.id, input.id)
    return successful()
  }
  throw new Fault('NOT_FOUND', 'Endpoint not found.', 404)
}
async function handle(
  req: Request,
  context: RouteContext<'/api/v1/[...path]'>,
  handler: typeof get,
) {
  try {
    const { path } = await context.params
    return await handler(req, path)
  } catch (error) {
    if (error instanceof Fault)
      return json(
        { ok: false, error: { code: error.code, message: error.message } },
        error.status,
      )
    if (error instanceof ZodError)
      return json(
        {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Review the form and try again.',
            fields: error.issues.map((issue) => ({
              name: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
        400,
      )
    const kind = (error as { code?: string }).code
    if (kind === '23505')
      return json(
        {
          ok: false,
          error: {
            code: 'ALREADY_EXISTS',
            message: 'That record already exists.',
          },
        },
        409,
      )
    console.error(
      'API request failed',
      req.method,
      new URL(req.url).pathname,
      error instanceof Error ? error.name : 'Unknown',
      kind ?? '',
    )
    return json(
      {
        ok: false,
        error: {
          code: 'REQUEST_FAILED',
          message: 'The request could not be completed.',
        },
      },
      500,
    )
  }
}
export async function GET(
  req: Request,
  ctx: RouteContext<'/api/v1/[...path]'>,
) {
  return handle(req, ctx, get)
}
export async function POST(
  req: Request,
  ctx: RouteContext<'/api/v1/[...path]'>,
) {
  return handle(req, ctx, post)
}
