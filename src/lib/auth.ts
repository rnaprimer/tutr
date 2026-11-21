import { randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { db, one, sql } from './db'
import { digest, invariant } from './core'
import type { Actor, Role } from './identity'
export type { Actor, Role } from './identity'

const sessionCookie =
  process.env.NODE_ENV === 'production' ? '__Host-balasore' : 'balasore'
export async function establish(actor: Actor) {
  const token = randomBytes(32).toString('base64url')
  const jar = await cookies()
  const old = jar.get(sessionCookie)?.value
  const maxAge = actor.role === 'admin' ? 28800 : 604800
  await db.transaction(async (tx) => {
    if (old)
      await tx.execute(
        sql`delete from sessions where token_hash=${digest(old)}`,
      )
    await tx.execute(sql`insert into sessions(token_hash,user_id,role,expires_at)
      values(${digest(token)},${actor.id},${actor.role},now()+${maxAge}*interval '1 second')`)
  })
  jar.set(sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })
}
export async function signOut() {
  const jar = await cookies()
  const token = jar.get(sessionCookie)?.value
  if (token)
    await db.execute(
      sql`delete from sessions where token_hash=${digest(token)}`,
    )
  jar.delete(sessionCookie)
}
export const actor = cache(async (): Promise<Actor | undefined> => {
  const token = (await cookies()).get(sessionCookie)?.value
  if (!token) return undefined
  return one<Actor>(sql`select s.user_id id,s.role from sessions s join users u on u.id=s.user_id
    where s.token_hash=${digest(token)} and s.expires_at>now() and not u.disabled`)
})
export async function requireActor(...roles: Role[]) {
  const user = await actor()
  invariant(user, 'AUTH_REQUIRED', 'Sign in to continue.', 401)
  invariant(
    !roles.length || roles.includes(user.role),
    'FORBIDDEN',
    'Your account cannot perform this action.',
    403,
  )
  return user
}
