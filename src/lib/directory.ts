import { z } from 'zod'
import { one, rows, sql, type SQL } from './db'
import { devServices, uuid } from './core'
import { grades, weekdays, place, feeUnit, money } from './onboarding'
import type { Option } from './catalog'

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())
export const directoryInput = z
  .object({
    class: optional(grades),
    subject: optional(uuid),
    board: optional(uuid),
    locality: optional(uuid),
    city: optional(uuid),
    place: optional(place),
    day: optional(weekdays),
    unit: optional(feeUnit),
    min: optional(money),
    max: optional(money),
    sort: z.enum(['newest', 'experience', 'fee']).default('newest'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .refine((value) => !value.min || !value.max || value.min <= value.max, {
    message: 'Maximum fee must be at least the minimum.',
  })
export const activeTutor = sql`t.verification='approved' and t.payment_status='paid' and t.listing_status='listed'
  and not t.suspended and (not t.synthetic or ${devServices()})
  and (${process.env.NODE_ENV !== 'production'} or exists
    (select 1 from payment_orders po where po.tutor_id=t.id and po.mode='live' and po.state='captured')) and exists (select 1 from users u where u.id=t.id and not u.disabled)`
export type PublicTutor = {
  id: string
  slug: string
  display_name: string
  intro: string
  qualification: string
  institution: string
  experience: number
  locality: string
  city: string
  fee: number
  fee_unit: 'month' | 'hour'
  teaching_place: 'student_home' | 'tutor_home'
  photo: boolean
  synthetic: boolean
  subjects: Option[]
  boards: Option[]
  classes: number[]
  areas: Option[]
  days: number[]
}
const base = sql`select t.id,t.slug,t.display_name,t.intro,t.qualification,t.institution,t.experience,
  l.name locality,c.name city,t.fee,t.fee_unit,t.teaching_place,t.photo_key is not null photo,t.synthetic,
  coalesce((select jsonb_agg(distinct jsonb_build_object('id',s.id,'name',s.name)) from tutor_offerings o join subjects s on s.id=o.subject_id
    where o.tutor_id=t.id and s.enabled),'[]') subjects,
  coalesce((select jsonb_agg(distinct jsonb_build_object('id',b.id,'name',b.name)) from tutor_offerings o join boards b on b.id=o.board_id
    where o.tutor_id=t.id and b.enabled),'[]') boards,
  coalesce((select jsonb_agg(distinct o.class order by o.class) from tutor_offerings o where o.tutor_id=t.id),'[]') classes,
  coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.name) from tutor_service_areas s join localities a on a.id=s.locality_id
    join cities ac on ac.id=a.city_id where s.tutor_id=t.id and a.enabled and ac.enabled),'[]') areas,
  coalesce((select jsonb_agg(day order by day) from tutor_availability av where av.tutor_id=t.id),'[]') days
  from tutor_profiles t join localities l on l.id=t.locality_id and l.enabled join cities c on c.id=l.city_id and c.enabled`
export async function directory(
  filters: z.infer<typeof directoryInput>,
  size = 9,
) {
  const conditions: SQL[] = [activeTutor]
  if (filters.class || filters.subject || filters.board) {
    const offering: SQL[] = [sql`o.tutor_id=t.id`, sql`s.enabled and b.enabled`]
    if (filters.class) offering.push(sql`o.class=${filters.class}`)
    if (filters.subject) offering.push(sql`o.subject_id=${filters.subject}`)
    if (filters.board) offering.push(sql`o.board_id=${filters.board}`)
    conditions.push(sql`exists(select 1 from tutor_offerings o join subjects s on s.id=o.subject_id join boards b on b.id=o.board_id
      where ${sql.join(offering, sql` and `)})`)
  }
  if (filters.locality)
    conditions.push(sql`exists(select 1 from tutor_service_areas a join localities loc on loc.id=a.locality_id
    join cities ac on ac.id=loc.city_id where a.tutor_id=t.id and a.locality_id=${filters.locality} and loc.enabled and ac.enabled)`)
  if (filters.city) conditions.push(sql`c.id=${filters.city}`)
  if (filters.place) conditions.push(sql`t.teaching_place=${filters.place}`)
  if (filters.day)
    conditions.push(
      sql`exists(select 1 from tutor_availability av where av.tutor_id=t.id and av.day=${filters.day})`,
    )
  if (filters.unit || filters.min || filters.max || filters.sort === 'fee')
    conditions.push(sql`t.fee_unit=${filters.unit ?? 'month'}`)
  if (filters.min) conditions.push(sql`t.fee>=${filters.min}`)
  if (filters.max) conditions.push(sql`t.fee<=${filters.max}`)
  const ordering = {
    newest: sql`t.created_at desc`,
    fee: sql`t.fee asc`,
    experience: sql`t.experience desc`,
  }[filters.sort]
  const tutors =
    await rows<PublicTutor>(sql`${base} where ${sql.join(conditions, sql` and `)}
    order by ${ordering},t.id limit ${size + 1} offset ${(filters.page - 1) * size}`)
  return {
    tutors: tutors.slice(0, size),
    hasNext: tutors.length > size,
    page: filters.page,
  }
}
export const publicTutor = (slug: string) =>
  one<PublicTutor>(sql`${base} where ${activeTutor} and t.slug=${slug}`)
export const publicPhoto = (slug: string) =>
  one<{ photo_key: string }>(sql`
  select t.photo_key from tutor_profiles t join localities l on l.id=t.locality_id and l.enabled
    join cities c on c.id=l.city_id and c.enabled where ${activeTutor} and t.slug=${slug} and t.photo_key is not null`)
export async function savedTutors(parent: string) {
  return rows<PublicTutor>(
    sql`${base} join saved_tutors sv on sv.tutor_id=t.id where ${activeTutor} and sv.parent_id=${parent} order by sv.created_at desc`,
  )
}
export async function profileEditor(tutor: string) {
  return one<{
    verification: string
    suspended: boolean
    payment_status: string
    listing_status: string
    slug: string
    displayName: string
    intro: string
    locality: string
    fee: number
    feeUnit: string
    teachingPlace: string
    subjects: string[]
    boards: string[]
    classes: number[]
    areas: string[]
    days: number[]
  }>(sql`
    select verification,suspended,payment_status,listing_status,slug,display_name "displayName",intro,locality_id locality,fee,
    fee_unit "feeUnit",teaching_place "teachingPlace",
    array(select distinct subject_id from tutor_offerings where tutor_id=t.id) subjects,
    array(select distinct board_id from tutor_offerings where tutor_id=t.id) boards,
    array(select distinct class from tutor_offerings where tutor_id=t.id order by class) classes,
    array(select locality_id from tutor_service_areas where tutor_id=t.id) areas,
    array(select day from tutor_availability where tutor_id=t.id order by day) days
    from tutor_profiles t where id=${tutor}`)
}
