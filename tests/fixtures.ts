import { randomBytes, randomInt } from 'node:crypto'
import { one, rows, sql, db } from '../src/lib/db'
import { encrypt, keyed } from '../src/lib/core'
import { hashPassword } from '../src/lib/identity'

export async function lookupCatalog() {
  const result = await one<{
    board: string
    subject: string
    locality: string
  }>(sql`select
    (select id from boards where name='CBSE') board,
    (select id from subjects where name='Mathematics') subject,
    (select id from localities where name='Sahadevkhunta') locality`)
  if (!result) throw new Error('Catalog fixtures are unavailable.')
  return result
}
export async function guardian() {
  const phone = '+916' + String(randomInt(100000000, 999999999))
  const user = await one<{
    id: string
  }>(sql`insert into users(phone_cipher,phone_hash,phone_verified_at)
    values(${encrypt(phone, 'phone')},${keyed('phone:' + phone)},now()) returning id`)
  await db.execute(
    sql`insert into user_roles(user_id,role) values(${user!.id},'parent')`,
  )
  await db.execute(sql`insert into parent_profiles(id) values(${user!.id})`)
  return { id: user!.id, phone, role: 'parent' as const }
}
export async function tutor(
  status: 'approved' | 'rejected' | 'unverified' = 'approved',
  active = true,
) {
  const { locality, board, subject } = await lookupCatalog()
  const user = await one<{ id: string }>(
    sql`insert into users default values returning id`,
  )
  const id = user!.id
  const slug = 'example-' + id
  await db.execute(
    sql`insert into user_roles(user_id,role) values(${id},'tutor')`,
  )
  await db.execute(sql`insert into tutor_profiles(id,slug,display_name,qualification,intro,institution,experience,locality_id,fee,fee_unit,teaching_place,verification,payment_status,listing_status)
    values (${id},${slug},'Example Tutor','B.Ed.','Fictional profile for automated tests.','Example College',3,${locality},3000,'month','student_home',
    ${status},${active ? 'paid' : 'unpaid'},${active ? 'listed' : 'hidden'})`)
  await db.execute(
    sql`insert into tutor_offerings(tutor_id,subject_id,board_id,class) values(${id},${subject},${board},8)`,
  )
  await db.execute(
    sql`insert into tutor_service_areas(tutor_id,locality_id) values(${id},${locality})`,
  )
  await db.execute(
    sql`insert into tutor_availability(tutor_id,day) values(${id},1)`,
  )
  return { id, slug, role: 'tutor' as const }
}
export async function admin() {
  const email = `admin-${randomBytes(5).toString('hex')}@example.invalid`
  const password = randomBytes(24).toString('base64url')
  const key = randomBytes(20)
  const user = await one<{
    id: string
  }>(sql`insert into users(admin_email,password_hash,mfa_cipher) values (
    ${email},${hashPassword(password)},${encrypt(key.toString('hex'), 'mfa')}) returning id`)
  await db.execute(
    sql`insert into user_roles(user_id,role) values(${user!.id},'admin')`,
  )
  return { id: user!.id, role: 'admin' as const, email, password, key }
}
export async function queryById(
  table: 'tutor_profiles' | 'tuition_requirements' | 'match_requests',
  id: string,
) {
  const identifier = {
    tutor_profiles: sql`tutor_profiles`,
    tuition_requirements: sql`tuition_requirements`,
    match_requests: sql`match_requests`,
  }[table]
  return rows(sql`select * from ${identifier} where id=${id}`)
}
