'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field } from './ui'
import { Message, request } from './actions'

export function LoginForm({
  role,
  returnTo,
  preview,
}: {
  role: 'parent' | 'tutor' | 'admin'
  returnTo: string
  preview: boolean
}) {
  const router = useRouter()
  const [challenge, setChallenge] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget))
    setError('')
    setPending(true)
    try {
      if (role === 'admin') await request('/auth/admin-login', data)
      else if (challenge)
        await request('/auth/otp-finish', { id: challenge, code: data.code })
      else {
        const result = await request<{ id: string }>('/auth/otp-start', {
          phone: data.phone,
          role,
        })
        setChallenge(result.id)
        return
      }
      router.replace(returnTo || `/${role}/dashboard`)
      router.refresh()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Sign-in is unavailable.',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      {role === 'admin' ? (
        <>
          <Field label="Administrator email">
            <input type="email" name="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </Field>
        </>
      ) : (
        !challenge && (
          <Field label="Mobile number" hint="Use your Indian mobile number.">
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              placeholder="+91"
              required
            />
          </Field>
        )
      )}
      {(challenge || role === 'admin') && (
        <Field
          label={role === 'admin' ? 'Authenticator code' : 'Verification code'}
        >
          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
          />
        </Field>
      )}
      {preview && role !== 'admin' && (
        <p className="alert" role="status">
          Development mode. The verification code appears in the local server
          terminal.
        </p>
      )}
      <Message message={error} />
      <Button type="submit" disabled={pending}>
        {pending
          ? 'Checking…'
          : role === 'admin' || challenge
            ? 'Sign in'
            : 'Send verification code'}
      </Button>
      {challenge && (
        <Button
          type="button"
          variant="quiet"
          disabled={pending}
          onClick={() => {
            setChallenge('')
            setError('')
          }}
        >
          Change number or request a new code
        </Button>
      )}
    </form>
  )
}
