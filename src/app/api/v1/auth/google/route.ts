import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { actor } from '@/lib/auth'
import { googleConfig } from '@/lib/google-config'
import {
  beginGoogle,
  googleCookie,
  googleCookieAge,
  memberRole,
} from '@/lib/google-oauth'

const secure = process.env.NODE_ENV === 'production'

export async function POST(request: Request) {
  const config = googleConfig()
  if (!config || request.headers.get('origin') !== config.origin)
    return new Response('Google sign-in is unavailable.', {
      status: config ? 403 : 503,
    })
  const data = await request.formData()
  const role = memberRole.safeParse(data.get('role'))
  if (!role.success)
    return new Response('Choose a valid account type.', { status: 400 })
  const next = data.get('next')
  const linking = data.get('link') === '1'
  const user = linking ? await actor() : undefined
  if (linking && user?.role !== role.data)
    return new Response('Sign in to link this account.', { status: 403 })
  const result = await beginGoogle({
    role: role.data,
    next: typeof next === 'string' ? next.slice(0, 1000) : '',
    linkId: user?.id,
  })
  const jar = await cookies()
  jar.set(googleCookie, result.cookie, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: googleCookieAge,
  })
  return NextResponse.redirect(result.target, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}
