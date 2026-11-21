import { createHmac, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db, one, rows, sql } from './db'
import { devServices, equal, invariant } from './core'
import { audit, notify } from './events'

type Mode = 'sandbox' | 'test' | 'live'
type Order = {
  id: string
  tutor_id: string
  amount: number
  currency: string
  state: string
  mode: Mode
  gateway_order: string | null
  gateway_payment: string | null
  refunded_amount: number
  created_at: Date
}
type TutorPayment = {
  verification: string
  payment_status: string
  suspended: boolean
}
const paymentModel = z.object({
  id: z.string(),
  order_id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  amount_refunded: z.number().int().nonnegative().default(0),
})
export const checkoutInput = z.object({
  razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
})

function gatewayMode(): Mode {
  const key = process.env.RAZORPAY_KEY_ID
  if (process.env.NODE_ENV === 'production') {
    invariant(
      key?.startsWith('rzp_live_') && process.env.RAZORPAY_KEY_SECRET,
      'PAYMENTS_UNAVAILABLE',
      'Onboarding checkout is unavailable.',
      503,
    )
    return 'live'
  }
  if (key) {
    invariant(
      key.startsWith('rzp_test_') && process.env.RAZORPAY_KEY_SECRET,
      'PAYMENTS_UNAVAILABLE',
      'Configure a Razorpay test key for this environment.',
      503,
    )
    return 'test'
  }
  invariant(
    devServices(),
    'PAYMENTS_UNAVAILABLE',
    'Onboarding checkout is unavailable.',
    503,
  )
  return 'sandbox'
}
function verifySignature(
  key: string | undefined,
  message: string,
  signature: string,
) {
  return (
    !!key &&
    equal(createHmac('sha256', key).update(message).digest('hex'), signature)
  )
}
async function razor(path: string, body?: object) {
  const key = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET
  invariant(
    key && secret,
    'PAYMENTS_UNAVAILABLE',
    'Onboarding checkout is unavailable.',
    503,
  )
  const res = await fetch('https://api.razorpay.com/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization:
        'Basic ' + Buffer.from(key + ':' + secret).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  invariant(
    res.ok,
    'GATEWAY_UNAVAILABLE',
    'Razorpay could not complete this request. Try again shortly.',
    503,
  )
  return res.json()
}
export const currentFee = () =>
  one<{ id: string; amount: number; currency: string }>(
    sql`select id,amount,currency from onboarding_fee_plans where active`,
  )
export const paymentHistory = (tutor: string) =>
  rows<Order>(
    sql`select * from payment_orders where tutor_id=${tutor} order by created_at desc`,
  )
export async function setFee(admin: string, amount: number) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(316771)`)
    await tx.execute(
      sql`update onboarding_fee_plans set active=false where active`,
    )
    const plan = await one<{ id: string }>(
      sql`insert into onboarding_fee_plans(amount,created_by) values(${amount},${admin}) returning id`,
      tx,
    )
    await audit(tx, admin, 'fee.configure', plan!.id, {
      amount,
      currency: 'INR',
    })
  })
}
export async function openCheckout(tutor: string) {
  const mode = gatewayMode()
  return db.transaction(async (tx) => {
    const profile = await one<TutorPayment>(
      sql`select verification,payment_status,suspended from tutor_profiles where id=${tutor} for update`,
      tx,
    )
    invariant(
      profile?.verification === 'approved' &&
        !profile.suspended &&
        profile.payment_status !== 'paid',
      'INVALID_APPLICATION_STATE',
      'Only approved tutors with an unpaid onboarding fee can check out.',
      409,
    )
    const existing = await one<Order>(
      sql`select * from payment_orders where tutor_id=${tutor} and state='created' and mode=${mode}`,
      tx,
    )
    if (existing) return checkoutView(existing)
    const plan = await one<{ id: string; amount: number; currency: string }>(
      sql`select id,amount,currency from onboarding_fee_plans where active`,
      tx,
    )
    invariant(
      plan,
      'FEE_NOT_CONFIGURED',
      'An administrator has yet to set the onboarding fee.',
      409,
    )
    const id = randomUUID()
    const gateway =
      mode === 'sandbox'
        ? { id: 'sandbox_' + id }
        : z
            .object({ id: z.string().regex(/^order_[a-zA-Z0-9]+$/) })
            .parse(
              await razor('orders', {
                amount: plan.amount,
                currency: plan.currency,
                receipt: id,
              }),
            )
    const order = await one<Order>(
      sql`insert into payment_orders(id,tutor_id,plan_id,amount,currency,gateway_order,mode)
      values(${id},${tutor},${plan.id},${plan.amount},${plan.currency},${gateway.id},${mode}) returning *`,
      tx,
    )
    return checkoutView(order!)
  })
}
function checkoutView(order: Order) {
  return {
    id: order.id,
    orderId: order.gateway_order,
    amount: order.amount,
    currency: order.currency,
    mode: order.mode,
    key: order.mode === 'sandbox' ? undefined : process.env.RAZORPAY_KEY_ID,
  }
}
export async function recordPayment(
  orderId: string,
  eventKey: string,
  kind: string,
  payment: z.infer<typeof paymentModel>,
  mode: Mode,
) {
  return db.transaction(async (tx) => {
    const order = await one<Order>(
      sql`select * from payment_orders where id=${orderId} for update`,
      tx,
    )
    invariant(
      order &&
        order.mode === mode &&
        payment.order_id === order.gateway_order &&
        payment.amount === order.amount &&
        payment.currency === order.currency &&
        payment.amount_refunded <= order.amount,
      'PAYMENT_NOT_VERIFIED',
      'Payment details could not be verified.',
      409,
    )
    const event = await one(
      sql`insert into payment_events(order_id,event_key,kind,payment_reference)
      values(${order.id},${eventKey},${kind},${payment.id}) on conflict(event_key) do nothing returning id`,
      tx,
    )
    if (!event) return { state: order.state }
    if (payment.status !== 'captured' && payment.status !== 'refunded')
      return { state: order.state }
    if (order.gateway_payment && order.gateway_payment !== payment.id) {
      await audit(tx, null, 'payment.reconciliation_required', order.id)
      return { state: order.state }
    }
    const profile = await one<TutorPayment>(
      sql`select verification,payment_status,suspended from tutor_profiles where id=${order.tutor_id} for update`,
      tx,
    )
    const refund =
      payment.status === 'refunded'
        ? order.amount
        : Math.max(order.refunded_amount, payment.amount_refunded)
    const state = refund === order.amount ? 'refunded' : 'captured'
    await tx.execute(
      sql`update payment_orders set state=${state},gateway_payment=${payment.id},refunded_amount=${refund},updated_at=now() where id=${order.id}`,
    )
    if (state === 'refunded') {
      const other = await one(
        sql`select id from payment_orders where tutor_id=${order.tutor_id} and mode=${mode} and state='captured'`,
        tx,
      )
      if (!other)
        await tx.execute(
          sql`update tutor_profiles set payment_status='refunded',listing_status='hidden' where id=${order.tutor_id}`,
        )
      await audit(tx, null, 'payment.refund', order.id, { amount: refund })
    } else if (order.state === 'created') {
      await notify(tx, order.tutor_id, 'payment_completed')
      await tx.execute(
        sql`update tutor_profiles set payment_status='paid' where id=${order.tutor_id}`,
      )
      if (profile?.verification === 'approved' && !profile.suspended) {
        await tx.execute(
          sql`update tutor_profiles set listing_status='listed' where id=${order.tutor_id}`,
        )
        if (profile.payment_status !== 'paid')
          await notify(tx, order.tutor_id, 'tutor_activated')
        await audit(tx, null, 'tutor.activate', order.tutor_id, {
          orderId: order.id,
          mode,
        })
      }
    } else if (refund > order.refunded_amount) {
      await audit(tx, null, 'payment.partial_refund', order.id, {
        amount: refund,
      })
    }
    return { state }
  })
}
export async function sandboxCheckout(
  tutor: string,
  id: string,
  outcome: 'captured' | 'failed',
) {
  invariant(
    gatewayMode() === 'sandbox',
    'FORBIDDEN',
    'Local simulation is disabled.',
    403,
  )
  const order = await one<Order>(
    sql`select * from payment_orders where id=${id} and tutor_id=${tutor} and mode='sandbox'`,
  )
  invariant(
    order?.gateway_order,
    'NOT_FOUND',
    'Payment order could not be found.',
    404,
  )
  return recordPayment(
    id,
    `sandbox:${id}:${outcome}`,
    'sandbox.' + outcome,
    {
      id: 'sandbox_payment_' + id,
      order_id: order.gateway_order,
      amount: order.amount,
      currency: order.currency,
      status: outcome,
      amount_refunded: 0,
    },
    'sandbox',
  )
}
export async function verifyCheckout(
  tutor: string,
  input: z.infer<typeof checkoutInput>,
) {
  const mode = gatewayMode()
  invariant(
    mode !== 'sandbox',
    'FORBIDDEN',
    'Gateway verification is unavailable.',
    403,
  )
  const order = await one<Order>(
    sql`select * from payment_orders where gateway_order=${input.razorpay_order_id} and tutor_id=${tutor}`,
  )
  invariant(
    order?.gateway_order &&
      order.mode === mode &&
      verifySignature(
        process.env.RAZORPAY_KEY_SECRET,
        order.gateway_order + '|' + input.razorpay_payment_id,
        input.razorpay_signature,
      ),
    'PAYMENT_NOT_VERIFIED',
    'Payment signature could not be verified.',
    409,
  )
  const payment = paymentModel.parse(
    await razor('payments/' + input.razorpay_payment_id),
  )
  invariant(
    payment.status === 'captured',
    'PAYMENT_NOT_VERIFIED',
    'Razorpay has not yet confirmed capture.',
    409,
  )
  return recordPayment(
    order.id,
    'checkout:' + payment.id,
    'checkout.verified',
    payment,
    mode,
  )
}
const webhook = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({ entity: z.object({ id: z.string() }) }).optional(),
    refund: z
      .object({ entity: z.object({ payment_id: z.string() }) })
      .optional(),
  }),
})
export async function razorWebhook(
  raw: string,
  signature: string,
  eventId: string,
) {
  invariant(
    verifySignature(process.env.RAZORPAY_WEBHOOK_SECRET, raw, signature),
    'FORBIDDEN',
    'Invalid webhook signature.',
    403,
  )
  invariant(
    eventId.length > 0 && eventId.length <= 160,
    'INVALID_WEBHOOK',
    'Missing gateway event identifier.',
  )
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    invariant(false, 'INVALID_WEBHOOK', 'Invalid webhook body.')
  }
  const event = webhook.parse(input)
  if (
    !['payment.captured', 'payment.failed', 'refund.processed'].includes(
      event.event,
    )
  )
    return { ignored: true }
  const paymentId =
    event.payload.payment?.entity.id ?? event.payload.refund?.entity.payment_id
  invariant(
    paymentId && /^pay_[a-zA-Z0-9]+$/.test(paymentId),
    'INVALID_WEBHOOK',
    'Missing payment identifier.',
  )
  const mode = gatewayMode()
  invariant(
    mode !== 'sandbox',
    'FORBIDDEN',
    'Gateway verification is unavailable.',
    403,
  )
  const payment = paymentModel.parse(await razor('payments/' + paymentId))
  const order = await one<Order>(
    sql`select * from payment_orders where gateway_order=${payment.order_id} and mode=${mode}`,
  )
  if (!order) return { ignored: true }
  return recordPayment(
    order.id,
    'razorpay:' + eventId,
    event.event,
    payment,
    mode,
  )
}
export async function reconcilePayment(admin: string, id: string) {
  const mode = gatewayMode()
  const order = await one<Order>(
    sql`select * from payment_orders where id=${id} and mode=${mode}`,
  )
  invariant(
    order?.gateway_order && mode !== 'sandbox',
    'NOT_FOUND',
    'This gateway order cannot be reconciled.',
    404,
  )
  const listing = z
    .object({ items: z.array(paymentModel) })
    .parse(await razor('orders/' + order.gateway_order + '/payments'))
  for (const payment of listing.items) {
    await recordPayment(
      order.id,
      `reconcile:${payment.id}:${payment.status}:${payment.amount_refunded}`,
      'payment.reconciled',
      payment,
      mode,
    )
  }
  await audit(db, admin, 'payment.reconcile', id, {
    checked: listing.items.length,
  })
}
