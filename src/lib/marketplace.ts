import { z } from 'zod'
import { scheduleOptions } from './scheduling'
import { db, one, rows, sql, type Executor } from './db'
import { decrypt, encrypt, equal, invariant, keyed, uuid } from './core'
import { audit, notify } from './events'
import { validateCatalog } from './catalog'
import { activeTutor } from './directory'
import {
  feeUnit,
  grades,
  money,
  noContactDetails,
  place,
  selection,
  text,
  weekdays,
} from './onboarding'
import type { Actor } from './auth'

const academicText = (min: number, max: number) =>
  text(min, max).refine(noContactDetails, 'Remove contact information.')
export const studentInput = z.object({
  label: academicText(1, 30),
  class: grades,
  board: uuid,
})
export const settingsInput = z.object({ displayName: text(2, 60) })
export const requirementInput = z
  .object({
    student: uuid,
    class: grades,
    board: uuid,
    locality: uuid,
    subjects: selection(uuid, 15),
    budget: money,
    unit: feeUnit,
    days: selection(weekdays, 7),
    schedule: z.enum(scheduleOptions),
    place,
    details: academicText(0, 1000),
    mode: z.enum(['direct', 'open']),
    target: uuid.optional(),
  })
  .refine((value) => value.mode === 'direct' || !value.target, {
    message: 'Open requirements cannot have a target tutor.',
  })
export const requirementAction = z.enum(['publish', 'pause', 'close', 'fill'])
export const matchAction = z.enum([
  'accept',
  'decline',
  'choose',
  'cancel',
  'block',
])
export const consentVersion = 'guardian-phone-v1'
export const consentText =
  'I agree to share my verified phone number with this tutor so they can contact me about this requirement.'
export const consentInput = z.object({
  agreed: z.literal(true),
  version: z.literal(consentVersion),
  proof: z.string().regex(/^[a-f0-9]{64}$/),
})
type MatchState =
  | 'pending_tutor'
  | 'pending_parent'
  | 'awaiting_parent_consent'
  | 'connected'
  | 'declined'
  | 'cancelled'
  | 'expired'
type RequirementState = 'draft' | 'published' | 'paused' | 'closed' | 'filled'
type Requirement = {
  id: string
  parent_id: string
  student_id: string
  class: number
  board_id: string
  locality_id: string
  target_tutor_id: string | null
  mode: 'open' | 'direct'
  status: RequirementState
  budget: number
  unit: 'month' | 'hour'
  days: number[]
  schedule: string
  teaching_place: 'student_home' | 'tutor_home'
  details: string
  created_at: Date
}
export type RequirementView = Requirement & {
  board: string
  locality: string
  subjects: { id: string; name: string }[]
  disclosures: number
  applicant_count: number
}
type Match = {
  id: string
  requirement_id: string
  tutor_id: string
  kind: 'direct' | 'open'
  state: MatchState
}
export type MatchView = Match & {
  class: number
  board: string
  locality: string
  tutor_name: string
  slug: string
  verified: boolean
  disclosures: number
  requirement_status: RequirementState
  active: boolean
  revoked: boolean
  subjects: string[]
  schedule: string
  budget: number
  unit: 'month' | 'hour'
  teaching_place: 'student_home' | 'tutor_home'
  days: number[]
}
const selectionArray = (ids: (string | number)[]) =>
  '{' + [...new Set(ids)].join(',') + '}'
const requirementSelect = sql`select r.*,b.name board,l.name locality,
  coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from requirement_subjects rs
    join subjects s on s.id=rs.subject_id where rs.requirement_id=r.id),'[]') subjects,
  (select count(*)::int from contact_disclosures d where d.requirement_id=r.id) disclosures,
  (select count(*)::int from match_requests m where m.requirement_id=r.id and m.state in ('pending_parent','awaiting_parent_consent')) applicant_count
  from tuition_requirements r join boards b on b.id=r.board_id join localities l on l.id=r.locality_id`
export const listStudents = (parent: string) =>
  rows<{
    id: string
    label: string
    class: number
    board_id: string
    board: string
  }>(sql`
  select s.id,s.label,s.class,s.board_id,b.name board from student_profiles s join boards b on b.id=s.board_id
  where parent_id=${parent} and not archived order by s.created_at`)
export async function saveStudent(
  parent: string,
  input: z.infer<typeof studentInput>,
  id?: string,
) {
  return db.transaction(async (tx) => {
    await validateCatalog(tx, 'boards', [input.board])
    const student = id
      ? await one(
          sql`update student_profiles set label=${input.label},class=${input.class},board_id=${input.board},updated_at=now()
        where id=${id} and parent_id=${parent} and not archived returning id`,
          tx,
        )
      : await one(
          sql`insert into student_profiles(parent_id,label,class,board_id) values(${parent},${input.label},${input.class},${input.board}) returning id`,
          tx,
        )
    invariant(student, 'NOT_FOUND', 'Student profile could not be found.', 404)
    return student
  })
}
export async function archiveStudent(parent: string, id: string) {
  const student = await one(
    sql`update student_profiles set archived=true,updated_at=now() where id=${id} and parent_id=${parent} returning id`,
  )
  invariant(student, 'NOT_FOUND', 'Student profile could not be found.', 404)
}
export const parentSettings = (parent: string) =>
  one<{ display_name: string }>(
    sql`select display_name from parent_profiles where id=${parent}`,
  )
export async function updateSettings(parent: string, displayName: string) {
  await db.execute(
    sql`update parent_profiles set display_name=${displayName},updated_at=now() where id=${parent}`,
  )
}
export async function setSaved(parent: string, tutor: string, save: boolean) {
  if (!save) {
    await db.execute(
      sql`delete from saved_tutors where parent_id=${parent} and tutor_id=${tutor}`,
    )
    return
  }
  const result = await one(sql`insert into saved_tutors(parent_id,tutor_id)
    select ${parent},t.id from tutor_profiles t where t.id=${tutor} and ${activeTutor} on conflict(parent_id,tutor_id)
    do update set tutor_id=excluded.tutor_id returning tutor_id`)
  invariant(result, 'TUTOR_NOT_ACTIVE', 'This tutor is unavailable.', 409)
}
export const listRequirements = (parent: string) =>
  rows<RequirementView>(
    sql`${requirementSelect} where r.parent_id=${parent} order by r.created_at desc`,
  )
export const parentRequirement = (parent: string, id: string) =>
  one<RequirementView>(
    sql`${requirementSelect} where r.parent_id=${parent} and r.id=${id}`,
  )
async function lockRequirement(tx: Executor, id: string) {
  const req = await one<Requirement>(
    sql`select * from tuition_requirements where id=${id} for update`,
    tx,
  )
  invariant(req, 'NOT_FOUND', 'Requirement could not be found.', 404)
  return req
}
export async function saveRequirement(
  parent: string,
  input: z.infer<typeof requirementInput>,
  id?: string,
) {
  return db.transaction(async (tx) => {
    if (id) {
      const req = await lockRequirement(tx, id)
      invariant(
        req.parent_id === parent,
        'NOT_FOUND',
        'Requirement could not be found.',
        404,
      )
      invariant(
        req.status === 'draft',
        'INVALID_REQUIREMENT_STATE',
        'Only draft requirements can be edited.',
        409,
      )
    }
    const student = await one(
      sql`select id from student_profiles where id=${input.student} and parent_id=${parent} and not archived for share`,
      tx,
    )
    invariant(
      student,
      'NOT_FOUND',
      'Choose a student profile from your account.',
      404,
    )
    await validateCatalog(tx, 'boards', [input.board])
    await validateCatalog(tx, 'localities', [input.locality])
    await validateCatalog(tx, 'subjects', input.subjects)
    if (input.target) await lockTutor(tx, input.target, parent)
    const result = id
      ? await one<{ id: string }>(
          sql`update tuition_requirements set student_id=${input.student},class=${input.class},board_id=${input.board},
          locality_id=${input.locality},target_tutor_id=${input.target ?? null},mode=${input.mode},budget=${input.budget},unit=${input.unit},
          days=${selectionArray(input.days)}::smallint[],schedule=${input.schedule},teaching_place=${input.place},details=${input.details},updated_at=now()
          where id=${id} returning id`,
          tx,
        )
      : await one<{ id: string }>(
          sql`insert into tuition_requirements(parent_id,student_id,class,board_id,locality_id,target_tutor_id,mode,budget,unit,days,schedule,teaching_place,details)
          values(${parent},${input.student},${input.class},${input.board},${input.locality},${input.target ?? null},${input.mode},${input.budget},${input.unit},
          ${selectionArray(input.days)}::smallint[],${input.schedule},${input.place},${input.details}) returning id`,
          tx,
        )
    invariant(
      result,
      'INVALID_REQUIREMENT_STATE',
      'The requirement could not be saved.',
      409,
    )
    await tx.execute(
      sql`delete from requirement_subjects where requirement_id=${result.id}`,
    )
    await tx.execute(
      sql`insert into requirement_subjects select ${result.id}::uuid,subject from unnest(${selectionArray(input.subjects)}::uuid[]) subject`,
    )
    return result
  })
}
async function closePending(tx: Executor, requirement: string) {
  const affected = await rows<{ tutor_id: string }>(
    sql`update match_requests set state='expired',updated_at=now()
    where requirement_id=${requirement} and state in ('pending_tutor','pending_parent','awaiting_parent_consent') returning tutor_id`,
    tx,
  )
  for (const match of affected)
    await notify(tx, match.tutor_id, 'requirement_closed')
}
async function slots(tx: Executor, id: string) {
  const used = await rows<{ slot: number }>(
    sql`select slot from contact_disclosures where requirement_id=${id} order by slot`,
    tx,
  )
  invariant(
    used.length < 3,
    'CONNECTION_LIMIT_REACHED',
    'Three tutor contacts have already been shared for this requirement.',
    409,
  )
  return ([1, 2, 3] as const).find(
    (slot) => !used.some((entry) => entry.slot === slot),
  )!
}
async function lockTutor(tx: Executor, tutor: string, parent?: string) {
  if (parent)
    invariant(
      parent !== tutor,
      'FORBIDDEN',
      'You cannot match with your own account.',
      403,
    )
  const record = await one(
    sql`select t.id from tutor_profiles t join users u on u.id=t.id
    join localities l on l.id=t.locality_id join cities c on c.id=l.city_id
    where t.id=${tutor} and ${activeTutor} and l.enabled and c.enabled for update of t for share of u`,
    tx,
  )
  invariant(
    record,
    'TUTOR_NOT_ACTIVE',
    'This tutor is unavailable for new connections.',
    409,
  )
  if (parent) {
    const blocked = await one(
      sql`select 1 from account_blocks where parent_id=${parent} and tutor_id=${tutor}`,
      tx,
    )
    invariant(!blocked, 'BLOCKED', 'These accounts cannot connect.', 403)
  }
}
async function createMatch(
  tx: Executor,
  req: Requirement,
  tutor: string,
  kind: 'direct' | 'open',
) {
  await slots(tx, req.id)
  await lockTutor(tx, tutor, req.parent_id)
  const match = await one<{ id: string }>(
    sql`insert into match_requests(requirement_id,tutor_id,kind,state)
    values(${req.id},${tutor},${kind},${kind === 'direct' ? 'pending_tutor' : 'pending_parent'}) on conflict(requirement_id,tutor_id) do nothing returning id`,
    tx,
  )
  invariant(
    match,
    'MATCH_EXISTS',
    'A match already exists for this tutor and requirement.',
    409,
  )
  await notify(
    tx,
    kind === 'direct' ? tutor : req.parent_id,
    kind === 'direct' ? 'direct_request' : 'tutor_applied',
  )
  return match
}
export async function changeRequirement(
  actor: Actor,
  id: string,
  action: z.infer<typeof requirementAction>,
) {
  return db.transaction(async (tx) => {
    const req = await lockRequirement(tx, id)
    invariant(
      (actor.role === 'parent' && req.parent_id === actor.id) ||
        (actor.role === 'admin' && action === 'close'),
      'NOT_FOUND',
      'Requirement could not be found.',
      404,
    )
    const next = {
      publish: 'published',
      pause: 'paused',
      close: 'closed',
      fill: 'filled',
    }[action]
    const allowed = {
      publish: ['draft', 'paused'],
      pause: ['published'],
      close: ['draft', 'published', 'paused'],
      fill: ['published', 'paused'],
    }[action]
    invariant(
      allowed.includes(req.status),
      'INVALID_REQUIREMENT_STATE',
      'This change is unavailable for the current requirement state.',
      409,
    )
    if (action === 'publish') {
      await slots(tx, req.id)
      if (
        req.mode === 'direct' &&
        req.target_tutor_id &&
        req.status === 'draft'
      )
        await createMatch(tx, req, req.target_tutor_id, 'direct')
    }
    await tx.execute(
      sql`update tuition_requirements set status=${next},updated_at=now() where id=${id}`,
    )
    if (action === 'close' || action === 'fill') {
      await closePending(tx, id)
      await notify(tx, req.parent_id, 'requirement_closed')
    }
    if (actor.role === 'admin')
      await audit(tx, actor.id, 'requirement.moderate', id, { status: next })
  })
}
export async function directRequest(
  parent: string,
  requirement: string,
  tutor: string,
) {
  return db.transaction(async (tx) => {
    const req = await lockRequirement(tx, requirement)
    invariant(
      req.parent_id === parent,
      'NOT_FOUND',
      'Requirement could not be found.',
      404,
    )
    invariant(
      req.status === 'published',
      'INVALID_REQUIREMENT_STATE',
      'Publish the requirement before sending requests.',
      409,
    )
    invariant(
      !req.target_tutor_id || req.target_tutor_id === tutor,
      'INVALID_REQUIREMENT_STATE',
      'This requirement is for a different tutor.',
      409,
    )
    return createMatch(tx, req, tutor, 'direct')
  })
}
const relevant = (
  tutor: string,
) => sql`r.parent_id<>${tutor} and not exists(select 1 from account_blocks ab where ab.parent_id=r.parent_id and ab.tutor_id=${tutor})
  and exists(select 1 from tutor_profiles t join localities tl on tl.id=t.locality_id join cities tc on tc.id=tl.city_id
    where t.id=${tutor} and ${activeTutor} and tl.enabled and tc.enabled and t.teaching_place=r.teaching_place)
  and exists(select 1 from tutor_service_areas a where a.tutor_id=${tutor} and a.locality_id=r.locality_id)
  and exists(select 1 from localities l join cities c on c.id=l.city_id where l.id=r.locality_id and l.enabled and c.enabled)
  and exists(select 1 from tutor_offerings o join requirement_subjects s on s.subject_id=o.subject_id
    join subjects sub on sub.id=s.subject_id join boards b on b.id=o.board_id
    where o.tutor_id=${tutor} and s.requirement_id=r.id and o.class=r.class and o.board_id=r.board_id and sub.enabled and b.enabled)`
export async function opportunities(tutor: string, page = 1) {
  const entries =
    await rows<RequirementView>(sql`${requirementSelect} where r.status='published' and r.mode='open' and ${relevant(tutor)}
    and (select count(*) from contact_disclosures d where d.requirement_id=r.id)<3
    and not exists(select 1 from match_requests m where m.requirement_id=r.id and m.tutor_id=${tutor})
    order by r.created_at desc,r.id limit 16 offset ${(page - 1) * 15}`)
  return { items: entries.slice(0, 15), page, hasNext: entries.length > 15 }
}
export async function expressInterest(tutor: string, id: string) {
  return db.transaction(async (tx) => {
    const req = await lockRequirement(tx, id)
    invariant(
      req.status === 'published' && req.mode === 'open',
      'INVALID_REQUIREMENT_STATE',
      'This opportunity is unavailable.',
      409,
    )
    await lockTutor(tx, tutor, req.parent_id)
    const matches = await one(
      sql`select r.id from tuition_requirements r where r.id=${id} and ${relevant(tutor)}`,
      tx,
    )
    invariant(
      matches,
      'FORBIDDEN',
      'This opportunity is outside your teaching preferences.',
      403,
    )
    return createMatch(tx, req, tutor, 'open')
  })
}
async function lockMatch(tx: Executor, id: string) {
  const match = await one<Match>(
    sql`select * from match_requests where id=${id}`,
    tx,
  )
  invariant(match, 'NOT_FOUND', 'Match could not be found.', 404)
  const req = await lockRequirement(tx, match.requirement_id)
  const current = await one<Match>(
    sql`select * from match_requests where id=${id} for update`,
    tx,
  )
  invariant(current, 'NOT_FOUND', 'Match could not be found.', 404)
  return { match: current, req }
}
function owned(actor: Actor, match: Match, req: Requirement) {
  invariant(
    (actor.role === 'parent' && actor.id === req.parent_id) ||
      (actor.role === 'tutor' && actor.id === match.tutor_id),
    'NOT_FOUND',
    'Match could not be found.',
    404,
  )
}
export async function changeMatch(
  actor: Actor,
  id: string,
  action: z.infer<typeof matchAction>,
) {
  return db.transaction(async (tx) => {
    const { match, req } = await lockMatch(tx, id)
    owned(actor, match, req)
    const pending = [
      'pending_tutor',
      'pending_parent',
      'awaiting_parent_consent',
    ]
    let next: MatchState
    if (action === 'accept' || action === 'choose') {
      const accepting =
        action === 'accept' &&
        actor.role === 'tutor' &&
        match.state === 'pending_tutor'
      const choosing =
        action === 'choose' &&
        actor.role === 'parent' &&
        match.state === 'pending_parent'
      invariant(
        (accepting || choosing) && req.status === 'published',
        'INVALID_MATCH_STATE',
        'This match cannot be accepted in its current state.',
        409,
      )
      await slots(tx, req.id)
      await lockTutor(tx, match.tutor_id, req.parent_id)
      if (accepting) await notify(tx, req.parent_id, 'tutor_accepted')
      next = 'awaiting_parent_consent'
    } else if (action === 'decline') {
      const allowed =
        actor.role === 'tutor'
          ? match.state === 'pending_tutor'
          : ['pending_parent', 'awaiting_parent_consent'].includes(match.state)
      invariant(
        allowed,
        'INVALID_MATCH_STATE',
        'This match cannot be declined.',
        409,
      )
      next = 'declined'
    } else if (action === 'block') {
      invariant(
        actor.role === 'parent',
        'FORBIDDEN',
        'Blocking is available to the guardian.',
        403,
      )
      await lockBlock(tx, req.parent_id, match.tutor_id)
      return
    } else {
      invariant(
        pending.includes(match.state) || match.state === 'connected',
        'INVALID_MATCH_STATE',
        'This match has already ended.',
        409,
      )
      next = 'cancelled'
    }
    await tx.execute(
      sql`update match_requests set state=${next},updated_at=now() where id=${id}`,
    )
    if (match.state === 'connected')
      await tx.execute(
        sql`update contact_disclosures set revoked_at=now() where match_id=${id} and revoked_at is null`,
      )
    await audit(tx, actor.id, 'match.' + action, id)
  })
}
async function lockBlock(tx: Executor, parent: string, tutor: string) {
  await tx.execute(
    sql`select id from tutor_profiles where id=${tutor} for update`,
  )
  await tx.execute(
    sql`insert into account_blocks(parent_id,tutor_id) values(${parent},${tutor}) on conflict do nothing`,
  )
  await audit(tx, parent, 'account.block', tutor)
}
async function verifiedPhone(parent: string, tx: Executor = db) {
  const number = await one<{ phone_cipher: string; phone_hash: string }>(
    sql`select phone_cipher,phone_hash from users
    where id=${parent} and phone_verified_at is not null and phone_cipher is not null and not disabled for share`,
    tx,
  )
  invariant(
    number,
    'PHONE_VERIFICATION_REQUIRED',
    'Verify your phone before sharing it.',
    403,
  )
  return number
}
export function maskPhone(phone: string) {
  return '+91 ••••••' + phone.slice(-4)
}
export async function consentPreview(
  parent: string,
  id: string,
): Promise<{ masked: string; version: typeof consentVersion; proof: string }> {
  const contact = await verifiedPhone(parent)
  return {
    masked: maskPhone(decrypt(contact.phone_cipher, 'phone')),
    version: consentVersion,
    proof: keyed(`consent:${id}:${parent}:${contact.phone_hash}`),
  }
}
export async function confirmContact(
  parent: string,
  id: string,
  input: z.infer<typeof consentInput>,
) {
  invariant(
    input.agreed === true && input.version === consentVersion,
    'CONSENT_REQUIRED',
    'Explicit consent is required.',
    400,
  )
  return db.transaction(async (tx) => {
    const { match, req } = await lockMatch(tx, id)
    invariant(
      req.parent_id === parent,
      'NOT_FOUND',
      'Match could not be found.',
      404,
    )
    if (match.state === 'connected') return { connected: true }
    invariant(
      match.state === 'awaiting_parent_consent' && req.status === 'published',
      'INVALID_MATCH_STATE',
      'This match is not ready for contact sharing.',
      409,
    )
    const slot = await slots(tx, req.id)
    await lockTutor(tx, match.tutor_id, parent)
    const number = await verifiedPhone(parent, tx)
    invariant(
      equal(input.proof, keyed(`consent:${id}:${parent}:${number.phone_hash}`)),
      'CONSENT_REQUIRED',
      'Your contact confirmation has changed. Review it again.',
      409,
    )
    const ciphertext = encrypt(
      decrypt(number.phone_cipher, 'phone'),
      'disclosure:' + id,
    )
    await tx.execute(
      sql`insert into contact_consents(match_id,parent_id,tutor_id,consent_version) values(${id},${parent},${match.tutor_id},${input.version})`,
    )
    await tx.execute(sql`insert into contact_disclosures(match_id,requirement_id,tutor_id,slot,phone_cipher)
      values(${id},${req.id},${match.tutor_id},${slot},${ciphertext})`)
    await tx.execute(
      sql`update match_requests set state='connected',updated_at=now() where id=${id}`,
    )
    await audit(tx, parent, 'contact.disclosed', id, {
      slot,
      version: input.version,
    })
    await notify(tx, match.tutor_id, 'connection_confirmed')
    return { connected: true }
  })
}
export async function getContact(tutor: string, id: string) {
  return db.transaction(async (tx) => {
    const { match, req } = await lockMatch(tx, id)
    invariant(
      match.tutor_id === tutor && match.state === 'connected',
      'NOT_FOUND',
      'Contact is unavailable.',
      404,
    )
    await lockTutor(tx, tutor, req.parent_id)
    const disclosure = await one<{ phone_cipher: string }>(
      sql`select d.phone_cipher from contact_disclosures d join users p on p.id=${req.parent_id}
      where d.match_id=${id} and d.tutor_id=${tutor} and d.revoked_at is null and not p.disabled`,
      tx,
    )
    invariant(disclosure, 'NOT_FOUND', 'Contact is unavailable.', 404)
    await audit(tx, tutor, 'contact.read', id)
    return { phone: decrypt(disclosure.phone_cipher, 'disclosure:' + id) }
  })
}
export async function reportMatch(actor: Actor, id: string, reason: string) {
  await db.transaction(async (tx) => {
    const { match, req } = await lockMatch(tx, id)
    owned(actor, match, req)
    const target = actor.role === 'tutor' ? req.parent_id : match.tutor_id
    const report = await one<{ id: string }>(
      sql`insert into moderation_reports(reporter_id,target_id,match_id,reason)
      values(${actor.id},${target},${id},${reason}) returning id`,
      tx,
    )
    await audit(tx, actor.id, 'report.create', report!.id)
  })
}
export async function listMatches(actor: Actor, requirement?: string) {
  const appropriate =
    actor.role === 'parent'
      ? sql`r.parent_id=${actor.id}`
      : sql`m.tutor_id=${actor.id}`
  return rows<MatchView>(sql`select m.*,r.class,b.name board,l.name locality,t.display_name tutor_name,t.slug,t.verification='approved' verified,
    (${activeTutor}) active,r.status requirement_status,r.schedule,r.budget,r.unit,r.teaching_place,r.days,
    array(select s.name from requirement_subjects rs join subjects s on s.id=rs.subject_id where rs.requirement_id=r.id order by s.name) subjects,
    (d.revoked_at is not null or exists(select 1 from account_blocks ab where ab.parent_id=r.parent_id and ab.tutor_id=m.tutor_id)) revoked,
    (select count(*)::int from contact_disclosures cd where cd.requirement_id=r.id) disclosures
    from match_requests m join tuition_requirements r on r.id=m.requirement_id join boards b on b.id=r.board_id join localities l on l.id=r.locality_id
    join tutor_profiles t on t.id=m.tutor_id left join contact_disclosures d on d.match_id=m.id
    where ${appropriate} ${requirement ? sql`and r.id=${requirement}` : sql``} order by m.created_at desc`)
}
