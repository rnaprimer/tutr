import { db, one, sql } from './db'
import { invariant } from './core'
import { assignMemberRole, type MemberRole } from './identity'

export async function signInWithGoogle(
  subject: string,
  role: MemberRole,
  linkId?: string,
) {
  return db.transaction(async (tx) => {
    // Serialize parallel callbacks that would otherwise race to create the same identity.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'google:' + subject}, 0))`,
    )
    const existing = await one<{ id: string; disabled: boolean }>(
      sql`select id,disabled from users where google_subject=${subject} for update`,
      tx,
    )
    if (linkId) {
      invariant(
        !existing || existing.id === linkId,
        'GOOGLE_ALREADY_LINKED',
        'This Google account is already linked.',
        409,
      )
      const current = await one<{ id: string }>(
        sql`
        update users set google_subject=${subject}
        where id=${linkId} and not disabled
          and (google_subject is null or google_subject=${subject})
          and exists(select 1 from user_roles where user_id=users.id and role=${role})
          and not exists(select 1 from user_roles where user_id=users.id and role='admin')
        returning id`,
        tx,
      )
      invariant(
        current,
        'GOOGLE_LINK_UNAVAILABLE',
        'Your account could not be linked.',
        409,
      )
      return { id: current.id, role }
    }
    const account =
      existing ??
      (await one<{ id: string; disabled: boolean }>(
        sql`insert into users(google_subject) values(${subject}) returning id,disabled`,
        tx,
      ))
    invariant(
      account && !account.disabled,
      'FORBIDDEN',
      'This account is unavailable.',
      403,
    )
    return assignMemberRole(tx, account.id, role)
  })
}
