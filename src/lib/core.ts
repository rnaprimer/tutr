import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { z } from 'zod'

export class Fault extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
export function invariant(
  value: unknown,
  code: string,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new Fault(code, message, status)
}
export const uuid = z.uuid()
export const devServices = () =>
  process.env.NODE_ENV !== 'production' && process.env.DEV_SERVICES === '1'
export function secret() {
  const value = process.env.APP_SECRET
  invariant(
    value && /^[0-9a-f]{64}$/i.test(value),
    'CONFIG_REQUIRED',
    'The application secret must be configured.',
    503,
  )
  return Buffer.from(value, 'hex')
}
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
export const keyed = (value: string) =>
  createHmac('sha256', secret()).update(value).digest('hex')
export function equal(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
export function encrypt(value: string, purpose: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret(), iv)
  cipher.setAAD(Buffer.from(purpose))
  const result = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), result]
    .map((part) => part.toString('base64url'))
    .join('.')
}
export function decrypt(value: string, purpose: string) {
  const [iv, tag, body] = value
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'))
  const cipher = createDecipheriv('aes-256-gcm', secret(), iv)
  cipher.setAAD(Buffer.from(purpose))
  cipher.setAuthTag(tag)
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8')
}
export function safeReturn(value?: string) {
  return value && /^\/(?!\/)[a-zA-Z0-9/_?=&%.+-]*$/.test(value) ? value : ''
}
export const days = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]
export const places = {
  student_home: 'Student’s home',
  tutor_home: 'Tutor’s home',
}
