'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Message, request } from './actions'
import { Button, rupees } from './ui'
type Order = {
  id: string
  orderId: string
  amount: number
  currency: string
  mode: 'sandbox' | 'test' | 'live'
  key?: string
}
type GatewayPayload = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}
type GatewayOptions = {
  key: string
  amount: number
  currency: string
  name: string
  order_id: string
  handler: (result: GatewayPayload) => void
  modal: { ondismiss: () => void }
}
type CheckoutWidget = {
  open: () => void
  on: (event: string, callback: () => void) => void
}
let load: Promise<void> | undefined
function gateway() {
  const browser = window as Window & {
    Razorpay?: new (options: GatewayOptions) => CheckoutWidget
  }
  if (browser.Razorpay) return Promise.resolve(browser.Razorpay)
  load ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => {
      load = undefined
      script.remove()
      reject(new Error('Razorpay could not load. Try again.'))
    }
    document.head.appendChild(script)
  })
  return load.then(() => {
    if (!browser.Razorpay)
      throw new Error('Razorpay could not load. Try again.')
    return browser.Razorpay
  })
}
export function Checkout({
  brand,
  sandbox,
}: {
  brand: string
  sandbox: boolean
}) {
  const [order, setOrder] = useState<Order>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  async function begin() {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const checkout = await request<Order>('/payments/order')
      setOrder(checkout)
      if (checkout.mode === 'sandbox') {
        setBusy(false)
        return
      }
      const Razorpay = await gateway()
      const widget = new Razorpay({
        key: checkout.key!,
        amount: checkout.amount,
        currency: checkout.currency,
        name: brand,
        order_id: checkout.orderId,
        modal: { ondismiss: () => setBusy(false) },
        handler: async (payload) => {
          try {
            const result = await request<{ state: string }>(
              '/payments/verify',
              payload,
            )
            if (result.state === 'captured') {
              setStatus('Payment confirmed.')
              router.refresh()
            } else setStatus('Waiting for the gateway to confirm payment.')
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'Payment confirmation is pending.',
            )
          } finally {
            setBusy(false)
          }
        },
      })
      widget.on('payment.failed', () => {
        setError('Payment failed. You can retry this order.')
        setBusy(false)
      })
      widget.open()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Checkout is unavailable.',
      )
      setBusy(false)
    }
  }
  async function simulate(outcome: 'captured' | 'failed') {
    if (!order) return
    setBusy(true)
    setStatus('')
    setError('')
    try {
      await request('/payments/sandbox', { id: order.id, outcome })
      if (outcome === 'captured') {
        setStatus('Local test payment confirmed.')
        router.refresh()
      } else setError('Test payment failed. Your profile is still inactive.')
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Local checkout failed.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      {sandbox && (
        <p className="alert">Development sandbox. No money will move.</p>
      )}
      {order?.mode === 'sandbox' ? (
        <>
          <p>
            Local test order for <strong>{rupees(order.amount / 100)}</strong>
          </p>
          <div className="row">
            <Button disabled={busy} onClick={() => simulate('captured')}>
              Simulate successful payment
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => simulate('failed')}
            >
              Simulate failed payment
            </Button>
          </div>
        </>
      ) : (
        <Button className="w-fit" disabled={busy} onClick={begin}>
          {busy
            ? 'Opening checkout…'
            : order
              ? 'Retry secure checkout'
              : 'Open secure checkout'}
        </Button>
      )}
      <Message message={status} success />
      <Message message={error} />
    </div>
  )
}
