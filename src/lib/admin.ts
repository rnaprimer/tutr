import { z } from 'zod'
import { db, one, rows, sql } from './db'
import { identifiers } from './catalog'
import { invariant, uuid } from './core'
import { audit, notify } from './events'
import { text } from './onboarding'

export const catalogInput = z.object({
  name: text(2, 80),
  city: uuid.optional(),
  enabled: z.boolean().default(true),
})
export const reportResolution = text(5, 1500)
export const adminSections = [
  'dashboard',
  'applications',
  'tutors',
  'parents',
  'requirements',
  'matches',
  'payments',
  'reports',
  'catalog',
  'fees',
  'audit',
] as const
export type AdminSection = (typeof adminSections)[number]
const reports = sql`select r.id,r.reason,r.match_id,r.resolution,r.created_at from moderation_reports r`
const queryBySection = {
  applications: sql`select a.id,coalesce(r.snapshot->'fields'->>'displayName',t.display_name,'Tutor') tutor,a.status,a.revision,a.updated_at from tutor_applications a
    join tutor_profiles t on t.id=a.tutor_id join application_revisions r on r.application_id=a.id and r.revision=a.revision`,
  tutors: sql`select t.id,t.display_name,t.verification,t.payment_status,t.listing_status,t.suspended,t.created_at from tutor_profiles t`,
  parents: sql`select p.id,p.display_name,u.disabled,u.created_at,(select count(*)::int from student_profiles s where s.parent_id=p.id and not s.archived) students
    from parent_profiles p join users u on u.id=p.id`,
  requirements: sql`select r.id,r.class,l.name locality,r.status,r.mode,r.details,r.created_at from tuition_requirements r join localities l on l.id=r.locality_id`,
  matches: sql`select m.id,m.requirement_id,m.tutor_id,m.state,m.kind,m.created_at from match_requests m`,
  payments: sql`select id,tutor_id,amount,currency,state,mode,gateway_order,gateway_payment,refunded_amount,created_at from payment_orders`,
  reports,
  audit: sql`select id,actor_id,action,entity_id,detail,created_at from audit_events`,
} as const
export type ListSection = keyof typeof queryBySection
export const sectionOrders = {
  applications: sql`case when status='pending_review' then 0 else 1 end,updated_at desc,id`,
  tutors: sql`created_at desc,id`,
  parents: sql`created_at desc,id`,
  requirements: sql`created_at desc,id`,
  matches: sql`created_at desc,id`,
  payments: sql`created_at desc,id`,
  reports: sql`resolution nulls first,created_at desc,id`,
  audit: sql`created_at desc,id`,
}
export async function adminList(section: ListSection, page = 1) {
  const result = await rows(
    sql`${queryBySection[section]} order by ${sectionOrders[section]} limit 26 offset ${(page - 1) * 25}`,
  )
  return { items: result.slice(0, 25), page, hasNext: result.length > 25 }
}
export async function adminDashboard() {
  return one<{
    pending: number
    listed: number
    published: number
    reports: number
  }>(sql`select
    (select count(*)::int from tutor_applications where status='pending_review') pending,
    (select count(*)::int from tutor_profiles where verification='approved' and payment_status='paid' and listing_status='listed' and not suspended) listed,
    (select count(*)::int from tuition_requirements where status='published') published,
    (select count(*)::int from moderation_reports where resolution is null) reports`)
}
export const adminCatalog = () =>
  Promise.all(
    Object.entries(identifiers).map(async ([key, source]) => ({
      key: key as keyof typeof identifiers,
      items: await rows<{
        id: string
        name: string
        enabled: boolean
        city_id?: string
      }>(sql`select * from ${source} order by name`),
    })),
  )
export async function saveCatalog(
  admin: string,
  key: keyof typeof identifiers,
  input: z.infer<typeof catalogInput>,
  id?: string,
) {
  return db.transaction(async (tx) => {
    const source = identifiers[key]
    if (key === 'localities') {
      const city = await one(
        sql`select id from cities where id=${input.city ?? null}`,
        tx,
      )
      invariant(city, 'INVALID_CATALOG', 'Choose a city for the locality.')
    }
    const entry = id
      ? await one<{ id: string }>(
          sql`update ${source} set name=${input.name},enabled=${input.enabled}
        ${key === 'localities' ? sql`,city_id=${input.city}` : sql``} where id=${id} returning id`,
          tx,
        )
      : key === 'localities'
        ? await one<{ id: string }>(
            sql`insert into localities(name,enabled,city_id) values(${input.name},${input.enabled},${input.city}) returning id`,
            tx,
          )
        : await one<{ id: string }>(
            sql`insert into ${source}(name,enabled) values(${input.name},${input.enabled}) returning id`,
            tx,
          )
    invariant(entry, 'NOT_FOUND', 'Catalog entry could not be found.', 404)
    await audit(tx, admin, 'catalog.update', entry.id, {
      catalog: key,
      enabled: input.enabled,
      name: input.name,
    })
  })
}
export async function suspendTutor(
  admin: string,
  id: string,
  suspended: boolean,
  reason: string,
) {
  await db.transaction(async (tx) => {
    const profile = await one(
      sql`update tutor_profiles set suspended=${suspended},
      listing_status=case when ${suspended} then 'hidden'
        when verification='approved' and payment_status='paid' then 'listed' else 'hidden' end,updated_at=now()
      where id=${id} and suspended<>${suspended} returning id`,
      tx,
    )
    invariant(
      profile,
      'INVALID_APPLICATION_STATE',
      'The tutor status is already set or unavailable.',
      409,
    )
    if (suspended) await notify(tx, id, 'account_suspended')
    await audit(
      tx,
      admin,
      suspended ? 'tutor.suspend' : 'tutor.reinstate',
      id,
      { reason },
    )
  })
}
export async function disableParent(
  admin: string,
  id: string,
  disabled: boolean,
  reason: string,
) {
  await db.transaction(async (tx) => {
    const parent = await one(
      sql`update users set disabled=${disabled} where id=${id}
      and not exists(select 1 from user_roles ar where ar.user_id=users.id and ar.role='admin')
      and exists(select 1 from parent_profiles p where p.id=users.id) returning id`,
      tx,
    )
    invariant(parent, 'NOT_FOUND', 'Guardian account could not be found.', 404)
    if (disabled) {
      await notify(tx, id, 'account_suspended')
      await tx.execute(sql`delete from sessions where user_id=${id}`)
    }
    await audit(tx, admin, disabled ? 'parent.disable' : 'parent.restore', id, {
      reason,
    })
  })
}
export async function resolveReport(
  admin: string,
  id: string,
  resolution: string,
) {
  await db.transaction(async (tx) => {
    const report = await one(
      sql`update moderation_reports set resolution=${resolution},resolved_by=${admin},updated_at=now()
      where id=${id} and resolution is null returning id`,
      tx,
    )
    invariant(
      report,
      'NOT_FOUND',
      'This report is unavailable or already resolved.',
      404,
    )
    await audit(tx, admin, 'report.resolve', id)
  })
}
export async function reviewDetails(id: string) {
  const app = await one<{
    id: string
    revision: number
    status: string
    tutor_id: string
    snapshot: {
      fields: Record<string, unknown>
      documents: Record<string, string>
    } | null
  }>(sql`
    select a.id,a.revision,a.status,a.tutor_id,r.snapshot from tutor_applications a join application_revisions r on r.application_id=a.id and r.revision=a.revision where a.id=${id}`)
  if (!app) return undefined
  const history = await rows<{
    id: string
    reviewer_id: string
    decision: string
    notes: string
    internal_notes: string
    revision: number
    created_at: Date
  }>(sql`
    select * from application_decisions where application_id=${id} order by created_at desc`)
  return { app, history }
}
export const recentNotices = (user: string) =>
  rows<{
    id: string
    kind: import('./events').EventKind
    created_at: Date
    read_at: Date | null
  }>(sql`
  select id,kind,created_at,read_at from notifications where user_id=${user} order by created_at desc limit 12`)
export async function readNotice(user: string, notice: string) {
  await db.execute(
    sql`update notifications set read_at=coalesce(read_at,now()) where id=${notice} and user_id=${user}`,
  )
}
export async function maskedAccountPhone(id: string) {
  const { decrypt } = await import('./core')
  const { maskPhone } = await import('./marketplace')
  const user = await one<{ phone_cipher: string | null }>(
    sql`select phone_cipher from users where id=${id} and phone_verified_at is not null`,
  )
  return user?.phone_cipher
    ? maskPhone(decrypt(user.phone_cipher, 'phone'))
    : undefined
}
export const adminAccountInput = z.object({
  enabled: z.boolean(),
  reason: text(5, 400),
})
export const pagination = z.coerce.number().int().min(1).max(10000).catch(1)
export const adminCatalogKeys = z.enum([
  'subjects',
  'boards',
  'localities',
  'cities',
])
export const noticeInput = z.object({ id: uuid })
