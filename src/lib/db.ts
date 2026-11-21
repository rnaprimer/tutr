import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { SQL } from 'drizzle-orm'
export { sql } from 'drizzle-orm'
export type { SQL } from 'drizzle-orm'

const state = globalThis as typeof globalThis & { balasorePool?: Pool }
export const pool =
  state.balasorePool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
if (process.env.NODE_ENV !== 'production') state.balasorePool = pool
export const db = drizzle(pool)
export type Executor = Pick<typeof db, 'execute'>
export async function rows<T extends Record<string, unknown>>(
  query: SQL,
  executor: Executor = db,
): Promise<T[]> {
  return (await executor.execute<T>(query)).rows as T[]
}
export async function one<T extends Record<string, unknown>>(
  query: SQL,
  executor: Executor = db,
): Promise<T | undefined> {
  return (await rows<T>(query, executor))[0]
}
