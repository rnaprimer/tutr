import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { db, one, pool, sql } from '../src/lib/db'
import { devServices } from '../src/lib/core'
import { uploadBytes } from '../src/lib/storage'

const profiles = [
  {
    id: 'd1000000-0000-4000-8000-000000000001',
    name: 'Ananya Mishra',
    slug: 'ananya-mishra',
    qualification: 'M.Sc. Mathematics',
    years: 7,
    locality: 'Sahadevkhunta',
    subjects: ['Mathematics', 'Science'],
    classes: [6, 7, 8, 9, 10],
    place: 'student_home',
    fee: 2800,
    photo: 1,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000002',
    name: 'Siddharth Das',
    slug: 'siddharth-das',
    qualification: 'M.Sc. Physics',
    years: 5,
    locality: 'Motiganj',
    subjects: ['Physics', 'Chemistry'],
    classes: [9, 10, 11, 12],
    place: 'student_home',
    fee: 3200,
    photo: 2,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000003',
    name: 'Priya Sahoo',
    slug: 'priya-sahoo',
    qualification: 'B.Ed.',
    years: 4,
    locality: 'Remuna',
    subjects: ['English', 'Social Science', 'Odia'],
    classes: [3, 4, 5, 6, 7, 8],
    place: 'tutor_home',
    fee: 2200,
    photo: 3,
  },
] as const
const guardian = 'd1000000-0000-4000-8000-000000000004'
const student = 'd1000000-0000-4000-8000-000000000005'
const requirement = 'd1000000-0000-4000-8000-000000000006'
try {
  if (!devServices() || process.env.S3_BUCKET)
    throw new Error(
      'Seed only into an isolated development database using local storage.',
    )
  await db.transaction(async (tx) => {
    // Keep the default order stable on reseed.
    for (const tutor of [...profiles].reverse()) {
      const id = tutor.id
      if (await one(sql`select id from tutor_profiles where id=${id}`, tx))
        continue
      const photo = await readFile(`scripts/fixtures/tutor-${tutor.photo}.jpg`)
      const upload = await uploadBytes(
        new File([new Uint8Array(photo)], 'portrait.jpg', {
          type: 'image/jpeg',
        }),
        'photo',
      )
      await tx.execute(sql`insert into users(id) values(${id});`)
      await tx.execute(
        sql`insert into user_roles(user_id,role) values(${id},'tutor')`,
      )
      await tx.execute(sql`insert into tutor_profiles(id,slug,display_name,qualification,intro,institution,experience,locality_id,fee,fee_unit,teaching_place,verification,payment_status,listing_status,synthetic,photo_key,created_at)
        values(${id},${tutor.slug},${tutor.name},${tutor.qualification},'This fictional profile illustrates how local families can compare teaching styles, learning goals and experience. No real services are offered by this profile.',
        'Example institution',${tutor.years},(select id from localities where name=${tutor.locality}),${tutor.fee},'month',${tutor.place},'approved','paid','listed',true,${upload.key},
        now()-${tutor.photo}*interval '1 minute')`)
      await tx.execute(
        sql`insert into tutor_applications(tutor_id,status) values(${id},'approved')`,
      )
      await tx.execute(
        sql`insert into tutor_service_areas select ${id}::uuid,id from localities where name=${tutor.locality}`,
      )
      await tx.execute(
        sql`insert into tutor_availability(tutor_id,day) values(${id},1),(${id},3),(${id},5)`,
      )
      await tx.execute(sql`insert into tutor_offerings select ${id}::uuid,s.id,b.id,grade from subjects s cross join boards b cross join
        unnest(${'{' + tutor.classes.join(',') + '}'}::smallint[]) grade
        where s.name=any(${'{' + tutor.subjects.join(',') + '}'}::text[]) and b.name='CBSE'`)
    }
    await tx.execute(
      sql`insert into users(id) values(${guardian}) on conflict do nothing`,
    )
    await tx.execute(
      sql`insert into user_roles(user_id,role) values(${guardian},'parent') on conflict do nothing`,
    )
    await tx.execute(
      sql`insert into parent_profiles(id,display_name) values(${guardian},'Demo guardian') on conflict do nothing`,
    )
    await tx.execute(sql`insert into student_profiles(id,parent_id,label,class,board_id)
      values(${student},${guardian},'Example student',8,(select id from boards where name='CBSE')) on conflict do nothing`)
    await tx.execute(sql`insert into tuition_requirements(id,parent_id,student_id,class,board_id,locality_id,mode,status,budget,unit,days,schedule,teaching_place,details)
      values(${requirement},${guardian},${student},8,(select id from boards where name='CBSE'),(select id from localities where name='Sahadevkhunta'),
        'open','published',2800,'month','{1,3}','After 5 pm','student_home','Fictional example requirement for mathematics practice.') on conflict do nothing`)
    await tx.execute(
      sql`insert into requirement_subjects select ${requirement}::uuid,id from subjects where name='Mathematics' on conflict do nothing`,
    )
  })
  console.log(
    'Seeded fictional profiles and an example requirement. Seed accounts do not have sign-in credentials.',
  )
} finally {
  await pool.end()
}
