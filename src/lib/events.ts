import { randomUUID } from 'node:crypto'
import { db, one, rows, sql, type Executor } from './db'
import { decrypt, devServices } from './core'
import { twilioEnabled, twilioRequest } from './identity'

export const messages = {
  application_submitted: 'Your tutor application was submitted.',
  corrections_requested:
    'Your application needs corrections. Open your application for details.',
  application_approved:
    'Your application is approved. Open activation to see the onboarding fee.',
  application_rejected: 'A decision is available on your tutor application.',
  payment_completed: 'Your onboarding payment was recorded.',
  tutor_activated: 'Your tutor profile is active.',
  direct_request: 'You received a new tutoring request.',
  tutor_accepted:
    'A tutor accepted your request. You can review the next step in your workspace.',
  tutor_applied: 'A tutor expressed interest in your requirement.',
  connection_confirmed: 'A connection was confirmed. Sign in to view it.',
  requirement_closed: 'A tuition requirement was closed.',
  account_suspended: 'Your account was suspended. Please contact support.',
} as const
export type EventKind = keyof typeof messages
export async function notify(tx: Executor, user: string, kind: EventKind) {
  await tx.execute(
    sql`insert into notifications(user_id,kind) values (${user},${kind})`,
  )
}
export async function audit(
  tx: Executor,
  actor: string | null,
  action: string,
  entity: string | null,
  detail = {},
) {
  await tx.execute(
    sql`insert into audit_events(actor_id,action,entity_id,detail) values (${actor},${action},${entity},${JSON.stringify(detail)}::jsonb)`,
  )
}
type DeliveryResult = {
  status: 'sent' | 'preview' | 'skipped'
  providerId?: string
}
type NotificationProvider = {
  send(recipient: string, message: string): Promise<DeliveryResult>
}
function twilioProvider(): NotificationProvider | undefined {
  const sms = process.env.TWILIO_SMS_FROM
  const whatsapp = process.env.TWILIO_WHATSAPP_FROM
  const template = process.env.TWILIO_WHATSAPP_CONTENT_SID
  if (
    !twilioEnabled() ||
    (!sms && !(whatsapp && template)) ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN
  )
    return undefined
  return {
    async send(recipient, message) {
      const data: Record<string, string> = sms
        ? { To: recipient, From: sms, Body: message }
        : {
            To: 'whatsapp:' + recipient,
            From: whatsapp!,
            ContentSid: template!,
            ContentVariables: JSON.stringify({ '1': message }),
          }
      const response = await twilioRequest(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
        data,
      )
      if (!response.ok) throw new Error('Provider request failed')
      const result = (await response.json()) as { sid?: string }
      if (!result.sid) throw new Error('Provider reference missing')
      return { status: 'sent', providerId: result.sid }
    },
  }
}
export async function deliverNotifications() {
  const provider = twilioProvider()
  if (!provider && !devServices()) return 0
  const lease = randomUUID()
  const backlog = await rows<{
    id: string
    kind: EventKind
    user_id: string
  }>(sql`
    with due as (select id from notifications where delivery_status='pending' and delivery_after<=now()
      order by delivery_after,created_at limit 15 for update skip locked)
    update notifications n set delivery_after=now()+interval '4 minutes',delivery_attempts=delivery_attempts+1,
      delivery_lease=${lease} from due where due.id=n.id returning n.id,n.kind,n.user_id`)
  for (const entry of backlog) {
    try {
      const user = await one<{
        phone_cipher: string
      }>(sql`select phone_cipher from users where id=${entry.user_id}
        and phone_verified_at is not null and phone_cipher is not null and not disabled`)
      let result: DeliveryResult = { status: 'skipped' }
      if (provider && user)
        result = await provider.send(
          decrypt(user.phone_cipher, 'phone'),
          messages[entry.kind],
        )
      else if (devServices()) {
        console.info('[Development notification]', messages[entry.kind])
        result = { status: 'preview' }
      }
      await db.execute(sql`update notifications set delivery_status=${result.status},provider_id=${result.providerId ?? null},delivery_lease=null
        where id=${entry.id} and delivery_lease=${lease}`)
    } catch {
      await db.execute(sql`update notifications set delivery_after=now()+least(3600, 15*power(2,least(delivery_attempts,8)))*interval '1 second',
        delivery_lease=null where id=${entry.id} and delivery_lease=${lease}`)
      console.warn('Notification delivery will be retried', entry.id)
    }
  }
  return backlog.length
}
