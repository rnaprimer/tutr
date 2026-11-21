import { cache } from 'react'
import { and, asc, eq } from 'drizzle-orm'
import {
  boards as boardRows,
  subjects as subjectRows,
  cities as cityRows,
  localities as localityRows,
} from './schema'
import { db, rows, sql, type Executor } from './db'
import { invariant } from './core'

export type Option = { id: string; name: string }
const identifiers = {
  subjects: sql`subjects`,
  boards: sql`boards`,
  localities: sql`localities`,
  cities: sql`cities`,
} as const
export type Catalog = keyof typeof identifiers
export const catalog = cache(async () => {
  const [subjects, boards, localities, cities] = await Promise.all([
    db
      .select({ id: subjectRows.id, name: subjectRows.name })
      .from(subjectRows)
      .where(eq(subjectRows.enabled, true))
      .orderBy(asc(subjectRows.name)),
    db
      .select({ id: boardRows.id, name: boardRows.name })
      .from(boardRows)
      .where(eq(boardRows.enabled, true))
      .orderBy(asc(boardRows.name)),
    db
      .select({
        id: localityRows.id,
        name: localityRows.name,
        city_id: localityRows.cityId,
      })
      .from(localityRows)
      .innerJoin(cityRows, eq(localityRows.cityId, cityRows.id))
      .where(and(eq(localityRows.enabled, true), eq(cityRows.enabled, true)))
      .orderBy(asc(localityRows.name)),
    db
      .select({ id: cityRows.id, name: cityRows.name })
      .from(cityRows)
      .where(eq(cityRows.enabled, true))
      .orderBy(asc(cityRows.name)),
  ])
  return { subjects, boards, localities, cities }
})
export async function validateCatalog(
  tx: Executor,
  name: Catalog,
  ids: string[],
) {
  const unique = [...new Set(ids)]
  const source =
    name === 'localities'
      ? sql`(select l.id,l.enabled and c.enabled as enabled from localities l join cities c on c.id=l.city_id) as available`
      : identifiers[name]
  const result = await rows(
    sql`select id from ${source} where enabled and id=any(${'{' + unique.join(',') + '}'}::uuid[])`,
    tx,
  )
  invariant(
    result.length === unique.length,
    'INVALID_CATALOG',
    'One of the selected catalog entries is unavailable.',
  )
}
export { identifiers }
