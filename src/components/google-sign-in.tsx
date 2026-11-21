import type { Actor, MemberRole } from '@/lib/identity'
import { googleConfig } from '@/lib/google-config'
import { one, sql } from '@/lib/db'
import { Button } from './ui'

export function GoogleSignIn({
  role,
  next = '',
  link = false,
}: {
  role: MemberRole
  next?: string
  link?: boolean
}) {
  return (
    <form action="/api/v1/auth/google" method="post">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="next" value={next} />
      {link && <input type="hidden" name="link" value="1" />}
      <Button type="submit" variant="secondary" className="w-full">
        {link ? 'Link Google account' : 'Continue with Google'}
      </Button>
    </form>
  )
}

export async function GoogleAccountSettings({
  user,
  error,
}: {
  user: Actor
  error?: unknown
}) {
  if (user.role === 'admin' || !googleConfig()) return null
  const account = await one<{ linked: boolean }>(
    sql`select google_subject is not null linked from users where id=${user.id}`,
  )
  return (
    <section className="stack" aria-label="Google account">
      {error === 'linked_elsewhere' && (
        <p className="alert alert-error" role="alert">
          This Google account is already linked to another profile.
        </p>
      )}
      {error === 'failed' && (
        <p className="alert alert-error" role="alert">
          Google linking did not complete. Try again.
        </p>
      )}
      {account?.linked ? (
        <p>Google account linked</p>
      ) : (
        <>
          <p className="muted">
            Link Google to sign in to this profile and keep your existing
            records.
          </p>
          <GoogleSignIn role={user.role} link />
        </>
      )}
    </section>
  )
}
