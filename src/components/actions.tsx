'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Field } from './ui'

type ApiError = {
  code: string
  message: string
  fields?: { name: string; message: string }[]
}
export class ActionError extends Error {
  constructor(public details: ApiError) {
    super(
      details.fields?.length
        ? details.fields
            .map(({ name, message }) => `${name ? name + ': ' : ''}${message}`)
            .join(' · ')
        : details.message,
    )
  }
}
export async function request<T = unknown>(
  endpoint: string,
  body?: unknown,
  method = 'POST',
): Promise<T> {
  const data = body instanceof FormData ? body : JSON.stringify(body ?? {})
  const response = await fetch('/api/v1' + endpoint, {
    method,
    cache: 'no-store',
    headers:
      method === 'GET' || data instanceof FormData
        ? undefined
        : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : data,
  })
  const result = await response.json().catch(() => null)
  if (!result?.ok)
    throw new ActionError(
      result?.error ?? {
        code: 'REQUEST_FAILED',
        message: 'The request could not be completed. Try again.',
      },
    )
  return result.data
}
export function Message({
  message,
  success = false,
}: {
  message?: string
  success?: boolean
}) {
  if (!message) return null
  return (
    <p
      className={`alert${success ? '' : ' alert-error'}`}
      role={success ? 'status' : 'alert'}
    >
      {message}
    </p>
  )
}
export function ActionButton({
  endpoint,
  payload,
  label,
  variant = 'secondary',
  confirm,
  go,
}: {
  endpoint: string
  payload?: Record<string, unknown>
  label: string
  variant?: 'quiet' | 'primary' | 'secondary' | 'danger'
  confirm?: string
  go?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setError('')
    setPending(true)
    try {
      await request(endpoint, payload)
      setOpen(false)
      if (go) router.replace(go)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Try again.')
    } finally {
      setPending(false)
    }
  }
  if (confirm)
    return (
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value)
            setError('')
          }
        }}
      >
        <Dialog.Trigger asChild>
          <Button variant={variant}>{label}</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay" />
          <Dialog.Content className="dialog">
            <Dialog.Title>{label}</Dialog.Title>
            <Dialog.Description>{confirm}</Dialog.Description>
            <div className="stack">
              <Message message={error} />
              <div className="row">
                <Button
                  variant={variant}
                  type="button"
                  onClick={submit}
                  disabled={pending}
                >
                  {pending ? 'Saving…' : 'Confirm'}
                </Button>
                <Dialog.Close asChild>
                  <Button variant="secondary" disabled={pending}>
                    Go back
                  </Button>
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  return (
    <div className="stack">
      <Button
        variant={variant}
        type="button"
        onClick={submit}
        disabled={pending}
      >
        {pending ? 'Saving…' : label}
      </Button>
      <Message message={error} />
    </div>
  )
}
export function SimpleForm({
  endpoint,
  children,
  button,
  constants,
  numberFields = [],
  checkboxFields = [],
  arrayFields = [],
  redirectPrefix,
  reset = false,
}: {
  endpoint: string
  children: ReactNode
  button: string
  constants?: Record<string, unknown>
  numberFields?: string[]
  checkboxFields?: string[]
  arrayFields?: string[]
  redirectPrefix?: string
  reset?: boolean
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const values: Record<string, unknown> = Object.fromEntries(data)
    for (const key of numberFields) values[key] = Number(data.get(key))
    for (const key of checkboxFields) values[key] = data.has(key)
    for (const key of arrayFields) values[key] = data.getAll(key)
    for (const key of Object.keys(values))
      if (values[key] === '' && ['target', 'city'].includes(key))
        delete values[key]
    setPending(true)
    setOk(false)
    setMessage('')
    try {
      const result = await request<{ id?: string } | null>(endpoint, {
        ...values,
        ...constants,
      })
      if (redirectPrefix && result?.id) router.push(redirectPrefix + result.id)
      if (reset) form.reset()
      router.refresh()
      setOk(true)
      setMessage('Saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Try again.')
    } finally {
      setPending(false)
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <fieldset disabled={pending} className="stack">
        {children}
        <Button type="submit" className="w-fit">
          {pending ? 'Saving…' : button}
        </Button>
      </fieldset>
      <Message message={message} success={ok} />
    </form>
  )
}
export function ReasonForm({
  endpoint,
  field = 'reason',
  constants,
  button,
  minimum = 8,
}: {
  endpoint: string
  field?: string
  constants?: Record<string, unknown>
  button: string
  minimum?: number
}) {
  return (
    <details>
      <summary className="cursor-pointer font-semibold">{button}</summary>
      <div className="mt-2">
        <SimpleForm
          endpoint={endpoint}
          constants={constants}
          button={button}
          reset
        >
          <Field label={field === 'resolution' ? 'Resolution' : 'Reason'}>
            <textarea
              name={field}
              minLength={minimum}
              maxLength={1200}
              required
            />
          </Field>
        </SimpleForm>
      </div>
    </details>
  )
}
export function RevealContact({ id }: { id: string }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function reveal() {
    setPending(true)
    setError('')
    try {
      setPhone(
        (
          await request<{ phone: string }>(
            `/matches/${id}/contact`,
            undefined,
            'GET',
          )
        ).phone,
      )
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Contact is unavailable.',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="stack">
      {phone ? (
        <div className="row">
          <a className="font-semibold underline" href={`tel:${phone}`}>
            {phone}
          </a>
          <Button variant="quiet" onClick={() => setPhone('')}>
            Hide number
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={reveal} disabled={pending}>
          {pending ? 'Checking access…' : 'Reveal guardian number'}
        </Button>
      )}
      <Message message={error} />
    </div>
  )
}
