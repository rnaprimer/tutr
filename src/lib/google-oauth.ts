import { randomBytes } from 'node:crypto'
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library'
import { z } from 'zod'
import { decrypt, encrypt, equal, invariant, safeReturn, uuid } from './core'
import { googleConfig } from './google-config'

export const googleCallbackPath = '/api/v1/auth/google/callback'
export const memberRole = z.enum(['parent', 'tutor'])
const token = () => randomBytes(32).toString('base64url')
const intentSchema = z.object({
  role: memberRole,
  next: z.string().max(1000),
  linkId: uuid.optional(),
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  expiresAt: z.number(),
})
type Intent = z.infer<typeof intentSchema>
export const googleCookie =
  process.env.NODE_ENV === 'production'
    ? '__Host-balasore-google'
    : 'balasore-google'
export const googleCookieAge = 600

export function googleClient() {
  const config = googleConfig()
  invariant(config, 'GOOGLE_UNAVAILABLE', 'Google sign-in is unavailable.', 503)
  return new OAuth2Client(
    config.id,
    config.secret,
    config.origin + googleCallbackPath,
  )
}

export async function beginGoogle(
  input: Pick<Intent, 'role' | 'next' | 'linkId'>,
) {
  const client = googleClient()
  const { codeVerifier, codeChallenge } =
    await client.generateCodeVerifierAsync()
  const intent: Intent = {
    ...input,
    next: safeReturn(input.next),
    state: token(),
    nonce: token(),
    verifier: codeVerifier,
    expiresAt: Date.now() + googleCookieAge * 1000,
  }
  const target = new URL(
    client.generateAuthUrl({
      scope: 'openid',
      state: intent.state,
      prompt: 'select_account',
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    }),
  )
  target.searchParams.set('nonce', intent.nonce)
  return { target, cookie: encrypt(JSON.stringify(intent), 'google-oauth') }
}

export function readGoogleIntent(
  cookie: string | undefined,
  state: string | null,
) {
  invariant(
    cookie && state,
    'GOOGLE_INVALID_STATE',
    'Start Google sign-in again.',
    400,
  )
  const intent = intentSchema.parse(JSON.parse(decrypt(cookie, 'google-oauth')))
  invariant(
    intent.expiresAt > Date.now() && equal(intent.state, state),
    'GOOGLE_INVALID_STATE',
    'Start Google sign-in again.',
    400,
  )
  return intent
}

export async function verifyGoogleCode(code: string, intent: Intent) {
  const client = googleClient()
  const result = await client.getToken({ code, codeVerifier: intent.verifier })
  invariant(
    result.tokens.id_token,
    'GOOGLE_INVALID_IDENTITY',
    'Google identity could not be verified.',
    401,
  )
  const ticket = await client.verifyIdToken({
    idToken: result.tokens.id_token,
    audience: googleConfig()!.id,
  })
  const identity = z
    .object({ sub: z.string().min(1).max(255), nonce: z.string() })
    .parse(ticket.getPayload())
  invariant(
    equal(identity.nonce, intent.nonce),
    'GOOGLE_INVALID_IDENTITY',
    'Google identity could not be verified.',
    401,
  )
  return identity.sub
}
