import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pool } from '../src/lib/db'
const client = await pool.connect()
try {
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock(1742026)')
  await client.query(
    'create table if not exists schema_migrations(name text primary key, checksum text not null)',
  )
  for (const name of (await readdir('drizzle'))
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    const source = await readFile(`drizzle/${name}`, 'utf8')
    const checksum = createHash('sha256').update(source).digest('hex')
    const {
      rows: [existing],
    } = await client.query(
      'select checksum from schema_migrations where name=$1',
      [name],
    )
    if (existing) {
      if (existing.checksum !== checksum)
        throw new Error(`Applied migration changed: ${name}`)
      continue
    }
    await client.query(source)
    await client.query('insert into schema_migrations values ($1,$2)', [
      name,
      checksum,
    ])
    console.log(`Applied ${name}`)
  }
  await client.query('commit')
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  client.release()
  await pool.end()
}
