import { spawnSync } from 'node:child_process'
import { Pool } from 'pg'
import { testDatabase } from '../tests/environment'
const target = new URL(testDatabase())
if (!process.env.TEST_DATABASE_URL) {
  const control = new URL(target)
  control.pathname = '/postgres'
  const pg = new Pool({ connectionString: control.toString() })
  try {
    if (
      !(
        await pg.query('select 1 from pg_database where datname=$1', [
          'balasore_test',
        ])
      ).rowCount
    ) {
      await pg.query('create database balasore_test')
    }
  } finally {
    await pg.end()
  }
}
const migrated = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/migrate.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: target.toString() },
  },
)
if (migrated.status !== 0) process.exit(migrated.status ?? 1)
