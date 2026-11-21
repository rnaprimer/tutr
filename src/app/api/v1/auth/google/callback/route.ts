import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { actor, establish } from '@/lib/auth'
import { googleConfig } from '@/lib/google-config'
import {
  googleCookie,
  readGoogleIntent,
  verifyGoogleCode,
} from '@/lib/google-oauth'
import { signInWithGoogle } from '@/lib/google-account'
import { Fault, invariant, safeReturn } from '@/lib/core'

export async function GET(request: Request) {
  const config = googleConfig()
  if (!config)
    return new Response('Google sign-in is unavailable.', { status: 503 })
  const send = (path: string) =>
    NextResponse.redirect(new URL(path, config.origin), {
      status: 303,
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  const params = new URL(request.url).searchParams
  const jar = await cookies()
  let failure = '/login?google=failed'
  try {
    const intent = readGoogleIntent(
      jar.get(googleCookie)?.value,
      params.get('state'),
    )
    jar.delete(googleCookie)
    failure = intent.linkId
      ? `/${intent.role}/settings?google=failed`
      : '/login?' +
        new URLSearchParams({
          role: intent.role,
          next: intent.next,
          google: 'failed',
        })
    if (intent.linkId) {
      const current = await actor()
      invariant(
        current?.id === intent.linkId && current.role === intent.role,
        'GOOGLE_LINK_UNAVAILABLE',
        'Sign in to link this account.',
        403,
      )
    }
    const code = params.get('code')
    invariant(
      !params.has('error') && code && code.length <= 2048,
      'GOOGLE_CANCELLED',
      'Google sign-in did not complete.',
    )
    const subject = await verifyGoogleCode(code, intent)
    await establish(await signInWithGoogle(subject, intent.role, intent.linkId))
    return send(
      intent.linkId
        ? `/${intent.role}/settings`
        : safeReturn(intent.next) || `/${intent.role}/dashboard`,
    )
  } catch (error) {
    if (error instanceof Fault && error.code === 'GOOGLE_ALREADY_LINKED')
      return send(
        `/${(await actor())?.role === 'tutor' ? 'tutor' : 'parent'}/settings?google=linked_elsewhere`,
      )
    return send(failure)
  }
}
