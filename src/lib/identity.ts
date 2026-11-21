import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
} from 'node:crypto'
import { z } from 'zod'
import { googleConfig } from './google-config'
import { db, one, sql, type Executor } from './db'
import { decrypt, devServices, encrypt, equal, invariant, keyed } from './core'

export type Role = 'parent' | 'tutor' | 'admin'
export type Actor = { id: string; role: Role }
export const phoneField = z
  .string()
  .trim()
  .regex(/^(?:\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number.')
  .transform((phone) => (phone.startsWith('+') ? phone : '+91' + phone))
export const otpInput = z.object({
  phone: phoneField,
  role: z.enum(['parent', 'tutor']),
})
export type MemberRole = Exclude<Role, 'admin'>
export const twilioEnabled = () => process.env.TWILIO_ENABLED === '1'
export const localOtpEnabled = () =>
  devServices() && !twilioEnabled() && !googleConfig()
export const twilioOtpEnabled = () =>
  twilioEnabled() &&
  !!process.env.TWILIO_VERIFY_SERVICE &&
  !!process.env.TWILIO_ACCOUNT_SID &&
  !!process.env.TWILIO_AUTH_TOKEN

export async function assignMemberRole(
  tx: Executor,
  id: string,
  role: MemberRole,
): Promise<Actor> {
  await tx.execute(
    sql`insert into user_roles(user_id,role) values (${id},${role}) on conflict do nothing`,
  )
  if (role === 'parent') {
    await tx.execute(
      sql`insert into parent_profiles(id) values (${id}) on conflict do nothing`,
    )
  } else {
    await tx.execute(
      sql`insert into tutor_profiles(id,slug) values (${id},${'tutor-' + randomBytes(8).toString('hex')}) on conflict(id) do nothing`,
    )
    await tx.execute(
      sql`insert into tutor_applications(tutor_id) values (${id}) on conflict(tutor_id) do nothing`,
    )
  }
  return { id, role }
}
export const adminInput = z.object({
  email: z.email().toLowerCase().max(254),
  password: z.string().min(1).max(256),
  code: z.string().regex(/^\d{6}$/),
})

export async function limit(bucket: string, ceiling: number, seconds: number) {
  const entry = await one<{ hits: number }>(sql`
    insert into rate_limits(bucket,hits,reset_at) values (${keyed(bucket)},1,now()+${seconds}*interval '1 second')
    on conflict(bucket) do update set
      hits=case when rate_limits.reset_at <= now() then 1 else rate_limits.hits+1 end,
      reset_at=case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
    returning hits`)
  invariant(
    entry && entry.hits <= ceiling,
    'RATE_LIMITED',
    'Too many attempts. Try again later.',
    429,
  )
}

export async function twilioRequest(url: string, data: Record<string, string>) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env
  invariant(
    twilioEnabled() && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN,
    'PROVIDER_UNAVAILABLE',
    'Messaging provider is unavailable.',
    503,
  )
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString(
          'base64',
        ),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(data),
    signal: AbortSignal.timeout(8000),
  })
}
function verifyUrl(resource: string) {
  const service = process.env.TWILIO_VERIFY_SERVICE
  invariant(
    service && /^VA[a-f0-9]{32}$/i.test(service),
    'PROVIDER_UNAVAILABLE',
    'SMS verification is unavailable.',
    503,
  )
  return `https://verify.twilio.com/v2/Services/${service}/${resource}`
}
export async function startOtp(
  input: z.infer<typeof otpInput>,
  client: string,
) {
  invariant(
    localOtpEnabled() || twilioOtpEnabled(),
    'PROVIDER_UNAVAILABLE',
    'SMS sign-in is unavailable.',
    503,
  )
  const { phone, role } = input
  const phoneHash = keyed('phone:' + phone)
  await limit('otp-start-client:' + client, 12, 600)
  await limit('otp-start-phone:' + phoneHash, 3, 600)
  const id = randomUUID()
  let hash: string | null = null
  let sid: string | null = null
  let previewCode: string | undefined
  if (localOtpEnabled()) {
    previewCode = String(randomInt(1000000)).padStart(6, '0')
    hash = keyed(`otp:${id}:${previewCode}`)
  } else {
    const response = await twilioRequest(verifyUrl('Verifications'), {
      To: phone,
      Channel: 'sms',
    })
    invariant(
      response.ok,
      'PROVIDER_UNAVAILABLE',
      'The verification code could not be sent.',
      503,
    )
    const result = z
      .object({ sid: z.string().regex(/^VE[a-f0-9]{32}$/i) })
      .parse(await response.json())
    sid = result.sid
  }
  await db.execute(sql`insert into otp_challenges(id,phone_hash,phone_cipher,otp_hash,provider_sid,role,expires_at)
    values (${id},${phoneHash},${encrypt(phone, 'phone')},${hash},${sid},${role},now()+interval '5 minutes')`)
  if (previewCode) console.info(`[Development OTP] ${id} code ${previewCode}`)
  return id
}

export async function finishOtp(id: string, code: string, client: string) {
  invariant(
    localOtpEnabled() || twilioOtpEnabled(),
    'PROVIDER_UNAVAILABLE',
    'SMS sign-in is unavailable.',
    503,
  )
  await limit('otp-check-client:' + client, 30, 600)
  const challenge = await one<{
    phone_hash: string
    phone_cipher: string
    otp_hash: string | null
    provider_sid: string | null
    role: 'parent' | 'tutor'
  }>(sql`
    update otp_challenges set attempts=attempts+1 where id=${id} and expires_at>now() and attempts<5 returning *`)
  invariant(
    challenge,
    'OTP_INVALID',
    'The code is invalid or has expired.',
    401,
  )
  const verified = challenge.otp_hash
    ? localOtpEnabled() && equal(challenge.otp_hash, keyed(`otp:${id}:${code}`))
    : twilioOtpEnabled() && (await verifyProvider(challenge.provider_sid, code))
  invariant(verified, 'OTP_INVALID', 'The code is invalid or has expired.', 401)
  return db.transaction(async (tx) => {
    const consumed = await one(
      sql`delete from otp_challenges where id=${id} and expires_at>now() returning id`,
      tx,
    )
    invariant(
      consumed,
      'OTP_INVALID',
      'The code is invalid or has expired.',
      401,
    )
    const user = await one<{ id: string; disabled: boolean }>(
      sql`insert into users(phone_hash,phone_cipher,phone_verified_at)
      values (${challenge.phone_hash},${challenge.phone_cipher},now()) on conflict(phone_hash) do update set phone_verified_at=now()
      where ${!challenge.otp_hash} or users.google_subject is null
      returning id,disabled`,
      tx,
    )
    invariant(
      user && !user.disabled,
      'FORBIDDEN',
      'This account is unavailable.',
      403,
    )
    return assignMemberRole(tx, user.id, challenge.role)
  })
}
async function verifyProvider(sid: string | null, code: string) {
  invariant(sid, 'OTP_INVALID', 'The code is invalid or has expired.', 401)
  const response = await twilioRequest(verifyUrl('VerificationCheck'), {
    VerificationSid: sid,
    Code: code,
  })
  return response.ok && (await response.json()).status === 'approved'
}
export function hashPassword(
  password: string,
  salt = randomBytes(16).toString('hex'),
) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex')
}
export function totp(key: Buffer, counter: number) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', key).update(message).digest()
  const offset = mac[mac.length - 1] & 15
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  )
}
export function base32(bytes: Buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = Array.from(bytes, (byte) =>
    byte.toString(2).padStart(8, '0'),
  ).join('')
  return (bits.match(/.{1,5}/g) ?? [])
    .map((group) => alphabet[parseInt(group.padEnd(5, '0'), 2)])
    .join('')
}
export async function adminLogin(
  input: z.infer<typeof adminInput>,
  client: string,
): Promise<Actor> {
  await limit('admin-client:' + client, 20, 900)
  await limit('admin-email:' + input.email, 8, 900)
  const user = await one<{
    id: string
    password_hash: string
    mfa_cipher: string
  }>(sql`select u.id,password_hash,mfa_cipher
    from users u join user_roles r on r.user_id=u.id and r.role='admin' where admin_email=${input.email} and not disabled`)
  const stored =
    user?.password_hash ?? '00000000000000000000000000000000:' + '0'.repeat(128)
  const valid = equal(
    stored,
    hashPassword(input.password, stored.split(':')[0]),
  )
  invariant(user && valid, 'AUTH_INVALID', 'Invalid sign-in details.', 401)
  const key = Buffer.from(decrypt(user.mfa_cipher, 'mfa'), 'hex')
  const current = Math.floor(Date.now() / 30000)
  const counter = [current, current - 1, current + 1].find((step) =>
    equal(totp(key, step), input.code),
  )
  invariant(
    counter !== undefined,
    'AUTH_INVALID',
    'Invalid sign-in details.',
    401,
  )
  const updated = await one(
    sql`update users set mfa_counter=${counter} where id=${user.id} and mfa_counter<${counter} returning id`,
  )
  invariant(updated, 'AUTH_INVALID', 'Invalid sign-in details.', 401)
  return { id: user.id, role: 'admin' }
}
