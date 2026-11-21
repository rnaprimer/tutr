import { redirect } from 'next/navigation'
import { actor, type Role } from './auth'

export async function pageActor(role: Role, next: string) {
  const user = await actor()
  if (user?.role !== role)
    redirect(`/login?role=${role}&next=${encodeURIComponent(next)}`)
  return user
}
