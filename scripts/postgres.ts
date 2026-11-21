import 'dotenv/config'
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync, mkdirSync } from 'node:fs'

const directory = '.local/postgres'
mkdirSync('.local', { recursive: true })
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'balasore',
  password: 'local_development_only',
  port: 55432,
  persistent: true,
  onLog: () => {},
  onError: console.error,
  postgresFlags: ['-h', '127.0.0.1'],
})
if (!existsSync(`${directory}/PG_VERSION`)) await pg.initialise()
await pg.start()
console.log('Local PostgreSQL is listening on 127.0.0.1:55432')
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void pg.stop().then(() => process.exit())
  })
}
