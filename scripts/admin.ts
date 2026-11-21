import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { db, one, pool, sql } from '../src/lib/db'
import { base32, hashPassword } from '../src/lib/identity'
import { encrypt } from '../src/lib/core'

const email = z.email().toLowerCase().parse(process.argv[2])
try {
  console.log(
    'A new random administrator password and authenticator key will be shown once in this terminal.',
  )
  const password = randomBytes(24).toString('base64url')
  const key = randomBytes(20)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(189901)`)
    if (await one(sql`select 1 from user_roles where role='admin'`, tx))
      throw new Error('The first administrator already exists.')
    const user = await one<{ id: string }>(
      sql`insert into users(admin_email,password_hash,mfa_cipher)
      values(${email},${hashPassword(password)},${encrypt(key.toString('hex'), 'mfa')}) returning id`,
      tx,
    )
    if (!user) throw new Error('Administrator could not be created.')
    await tx.execute(
      sql`insert into user_roles values (${user.id},'admin',now())`,
    )
    await tx.execute(
      sql`insert into audit_events(actor_id,action,entity_id) values(${user.id},'admin.bootstrap',${user.id})`,
    )
  })
  console.log('Administrator password:', password)
  console.log(
    'Authenticator setup key (time based, 6 digits, 30 seconds):',
    base32(key),
  )
} finally {
  await pool.end()
}
