import Link from 'next/link'
import { redirect } from 'next/navigation'
import { actor } from '@/lib/auth'
import { GoogleSignIn } from '@/components/google-sign-in'
import { googleConfig } from '@/lib/google-config'
import { localOtpEnabled, twilioOtpEnabled } from '@/lib/identity'
import { safeReturn } from '@/lib/core'
import { Card, PageHeading } from '@/components/ui'
import { LoginForm } from '@/components/login-form'
export const metadata = { title: 'Log in' }
export default async function Login({ searchParams }: PageProps<'/login'>) {
  const query = await searchParams
  const role =
    query.role === 'tutor' || query.role === 'admin' ? query.role : 'parent'
  const next = safeReturn(
    typeof query.next === 'string' ? query.next : undefined,
  )
  const user = await actor()
  const google = !!googleConfig()
  const local = localOtpEnabled()
  const sms = twilioOtpEnabled()
  if (user?.role === role) redirect(next || `/${role}/dashboard`)
  const activeRoles =
    role === 'admin'
      ? (['parent', 'tutor', 'admin'] as const)
      : (['parent', 'tutor'] as const)
  return (
    <div className="page container">
      <div className="auth-wrap">
        <PageHeading
          title={role === 'admin' ? 'Administrator sign-in' : 'Welcome back'}
        >
          {role === 'admin'
            ? 'Sign in with your password and authenticator code.'
            : google
              ? 'Use your Google account to sign in or create a profile.'
              : 'Sign in to your account.'}
        </PageHeading>
        <Card>
          <nav className="auth-tabs" aria-label="Account type">
            {activeRoles.map((entry) => (
              <Link
                aria-current={role === entry ? 'page' : undefined}
                key={entry}
                href={`/login?role=${entry}${next && entry === role ? '&next=' + encodeURIComponent(next) : ''}`}
              >
                {entry === 'parent'
                  ? 'Parent / Guardian'
                  : entry === 'admin'
                    ? 'Admin'
                    : 'Tutor'}
              </Link>
            ))}
          </nav>
          <div className="stack">
            {query.google === 'failed' && (
              <p className="alert alert-error" role="alert">
                Google sign-in did not complete. Try again.
              </p>
            )}
            {role !== 'admin' &&
              (google ? (
                <GoogleSignIn role={role} next={next} />
              ) : (
                <p className="muted">
                  Google sign-in is pending configuration.
                </p>
              ))}
            {(role === 'admin' || local || sms) && (
              <LoginForm
                key={role}
                role={role}
                returnTo={next}
                preview={local}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
