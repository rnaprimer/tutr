import { z } from 'zod'
import { db, one, rows, sql, type Executor } from './db'
import { equal, invariant, keyed, uuid } from './core'
import { audit, notify } from './events'
import { validateCatalog } from './catalog'
import type { Actor } from './auth'
import { removeObject, uploadBytes, type DocumentKind } from './storage'

export const text = (min: number, max: number) =>
  z.string().trim().min(min).max(max)
export const noContactDetails = (value: string) =>
  !/\b\d[\d .()-]{8,}\d\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value)
const publicText = (min: number, max: number) =>
  text(min, max).refine(
    noContactDetails,
    'Remove phone numbers and email addresses.',
  )
const experience = z
  .union([z.number(), z.string().regex(/^\d{1,2}$/)])
  .transform(Number)
  .pipe(z.number().int().min(0).max(60))
export const selection = <T extends string | number>(
  schema: z.ZodType<T>,
  max: number,
) => z.array(schema).min(1).max(max)
export const place = z.enum(['student_home', 'tutor_home'])
export const feeUnit = z.enum(['hour', 'month'])
export const money = z.coerce.number().int().min(1).max(1000000)
export const grades = z.coerce.number().int().min(1).max(12)
export const weekdays = z.coerce.number().int().min(1).max(7)
const publicFields = {
  displayName: publicText(2, 70),
  intro: publicText(20, 1000),
  locality: uuid,
  subjects: selection(uuid, 20),
  classes: selection(grades, 12),
  boards: selection(uuid, 8),
  areas: selection(uuid, 25),
  days: selection(weekdays, 7),
  teachingPlace: place,
  fee: money,
  feeUnit,
}
export const teachingProfile = z.object(publicFields)
const applicationFields = z.object({
  ...publicFields,
  legalName: text(3, 120),
  qualification: publicText(2, 120),
  institution: publicText(2, 150),
  credentials: text(3, 1000),
  experience,
  additional: text(0, 500),
  declaration: z.literal(true),
})
const draftString = (maximum: number) => z.string().trim().max(maximum)
export const draftInput = z
  .object({
    displayName: draftString(70),
    intro: draftString(1000),
    locality: z.union([uuid, z.literal('')]),
    subjects: z.array(uuid).max(20),
    classes: z.array(grades).max(12),
    boards: z.array(uuid).max(8),
    areas: z.array(uuid).max(25),
    days: z.array(weekdays).max(7),
    teachingPlace: place,
    fee: z.union([money, z.literal('')]),
    feeUnit,
    legalName: draftString(120),
    qualification: draftString(120),
    institution: draftString(150),
    credentials: draftString(1000),
    experience: z.union([z.literal(''), experience]),
    additional: draftString(500),
    declaration: z.boolean(),
  })
  .partial()
export const decisionInput = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_required']),
  revision: z.number().int().positive(),
  notes: text(5, 1500),
  internalNotes: text(0, 1500).optional(),
  identityChecked: z.boolean(),
  academicChecked: z.boolean(),
})
type Application = {
  id: string
  tutor_id: string
  status: string
  revision: number
  draft: z.infer<typeof draftInput>
}
type StoredDocument = {
  id: string
  kind: DocumentKind
  object_key: string
  mime: string
}
type Snapshot = {
  fields: z.infer<typeof applicationFields>
  documents: Record<DocumentKind, string>
}
const editable = (status: string) =>
  status === 'draft' || status === 'changes_required'

export async function getApplication(tutor: string) {
  const application = await one<Application>(
    sql`select * from tutor_applications where tutor_id=${tutor}`,
  )
  invariant(application, 'NOT_FOUND', 'Application could not be found.', 404)
  return application
}
export async function draftDocuments(app: string, executor: Executor = db) {
  return rows<StoredDocument>(
    sql`select distinct on (kind) id,kind,object_key,mime from verification_documents
    where application_id=${app} order by kind,created_at desc,id desc`,
    executor,
  )
}
export async function saveDraft(
  tutor: string,
  patch: z.infer<typeof draftInput>,
) {
  const application =
    await one(sql`update tutor_applications set draft=draft||${JSON.stringify(patch)}::jsonb,updated_at=now()
    where tutor_id=${tutor} and status in ('draft','changes_required') returning id`)
  invariant(
    application,
    'INVALID_APPLICATION_STATE',
    'This application is locked.',
    409,
  )
}
async function lockApplication(tx: Executor, tutor: string) {
  const application = await one<Application>(
    sql`select * from tutor_applications where tutor_id=${tutor} for update`,
    tx,
  )
  invariant(
    application && editable(application.status),
    'INVALID_APPLICATION_STATE',
    'This application is locked.',
    409,
  )
  return application
}
export async function addDocument(
  tutor: string,
  kind: DocumentKind,
  file: File,
) {
  const application = await getApplication(tutor)
  invariant(
    editable(application.status),
    'INVALID_APPLICATION_STATE',
    'This application is locked.',
    409,
  )
  const uploaded = await uploadBytes(file, kind)
  try {
    return await db.transaction(async (tx) => {
      await lockApplication(tx, tutor)
      return one<{ id: string }>(
        sql`insert into verification_documents(application_id,kind,object_key,mime,size)
        values(${application.id},${kind},${uploaded.key},${uploaded.mime},${uploaded.size}) returning id`,
        tx,
      )
    })
  } catch (error) {
    await removeObject(uploaded.key).catch(() =>
      console.error('Private object cleanup failed'),
    )
    throw error
  }
}
async function validateProfile(
  tx: Executor,
  fields: z.infer<typeof teachingProfile>,
) {
  await validateCatalog(tx, 'localities', [fields.locality, ...fields.areas])
  await validateCatalog(tx, 'subjects', fields.subjects)
  await validateCatalog(tx, 'boards', fields.boards)
}
export async function submitApplication(
  tutor: string,
  patch: z.infer<typeof draftInput>,
) {
  await db.transaction(async (tx) => {
    const app = await lockApplication(tx, tutor)
    const fields = applicationFields.parse({ ...app.draft, ...patch })
    await validateProfile(tx, fields)
    const phone = await one(
      sql`select id from users where id=${tutor} and phone_verified_at is not null and not disabled`,
      tx,
    )
    invariant(
      phone,
      'PHONE_VERIFICATION_REQUIRED',
      'Verify your phone before submitting.',
      403,
    )
    const docs = await draftDocuments(app.id, tx)
    invariant(
      docs.length === 3,
      'MISSING_DOCUMENTS',
      'Upload a profile photo, identity document and academic certificate.',
    )
    const snapshot = {
      fields,
      documents: Object.fromEntries(docs.map((doc) => [doc.kind, doc.id])),
    }
    await tx.execute(sql`insert into application_revisions(application_id,revision,snapshot)
      values(${app.id},${app.revision + 1},${JSON.stringify(snapshot)}::jsonb)`)
    await tx.execute(
      sql`update tutor_applications set revision=revision+1,status='pending_review',draft=${JSON.stringify(fields)}::jsonb,updated_at=now() where id=${app.id}`,
    )
    await notify(tx, tutor, 'application_submitted')
    await audit(tx, tutor, 'application.submit', app.id, {
      revision: app.revision + 1,
    })
  })
}

async function writeTeachingProfile(
  tx: Executor,
  id: string,
  fields: z.infer<typeof teachingProfile>,
) {
  await tx.execute(sql`update tutor_profiles set display_name=${fields.displayName},intro=${fields.intro},locality_id=${fields.locality},
    fee=${fields.fee},fee_unit=${fields.feeUnit},teaching_place=${fields.teachingPlace},updated_at=now() where id=${id}`)
  await tx.execute(sql`delete from tutor_offerings where tutor_id=${id}`)
  await tx.execute(sql`insert into tutor_offerings
    select distinct ${id}::uuid, subject,board,class from
    unnest(${'{' + fields.subjects.join(',') + '}'}::uuid[]) subject cross join
    unnest(${'{' + fields.boards.join(',') + '}'}::uuid[]) board cross join
    unnest(${'{' + fields.classes.join(',') + '}'}::smallint[]) class`)
  await tx.execute(sql`delete from tutor_service_areas where tutor_id=${id}`)
  await tx.execute(
    sql`insert into tutor_service_areas select distinct ${id}::uuid,value from unnest(${'{' + fields.areas.join(',') + '}'}::uuid[]) value`,
  )
  await tx.execute(sql`delete from tutor_availability where tutor_id=${id}`)
  await tx.execute(
    sql`insert into tutor_availability select distinct ${id}::uuid,value from unnest(${'{' + fields.days.join(',') + '}'}::smallint[]) value`,
  )
}

export async function reviewApplication(
  reviewer: string,
  id: string,
  input: z.infer<typeof decisionInput>,
) {
  await db.transaction(async (tx) => {
    const app = await one<Application>(
      sql`select * from tutor_applications where id=${id} for update`,
      tx,
    )
    invariant(
      app?.status === 'pending_review' && app.revision === input.revision,
      'INVALID_APPLICATION_STATE',
      'This revision is no longer awaiting review.',
      409,
    )
    if (input.decision === 'approved') {
      invariant(
        input.identityChecked && input.academicChecked,
        'CHECKLIST_REQUIRED',
        'Complete both verification checks before approval.',
      )
      const revision = await one<{ snapshot: Snapshot }>(
        sql`select snapshot from application_revisions where application_id=${id} and revision=${app.revision}`,
        tx,
      )
      invariant(
        revision,
        'INVALID_APPLICATION_STATE',
        'Application revision could not be found.',
        409,
      )
      const { fields, documents } = revision.snapshot
      const photo = await one<StoredDocument>(
        sql`select * from verification_documents where id=${documents.photo} and application_id=${id} and kind='photo'`,
        tx,
      )
      invariant(photo, 'MISSING_DOCUMENTS', 'The profile photo is unavailable.')
      await validateProfile(tx, fields)
      await writeTeachingProfile(tx, app.tutor_id, fields)
      await tx.execute(sql`update tutor_profiles set qualification=${fields.qualification},institution=${fields.institution},
        experience=${fields.experience},photo_key=${photo.object_key},verification='approved',listing_status=case when payment_status='paid' and not suspended then 'listed' else 'hidden' end where id=${app.tutor_id}`)
    } else if (input.decision === 'rejected') {
      await tx.execute(
        sql`update tutor_profiles set verification='rejected',listing_status='hidden' where id=${app.tutor_id}`,
      )
    }
    await tx.execute(
      sql`update tutor_applications set status=${input.decision},updated_at=now() where id=${id}`,
    )
    await tx.execute(sql`insert into application_decisions(application_id,revision,reviewer_id,decision,notes,identity_checked,academic_checked,internal_notes)
      values(${id},${app.revision},${reviewer},${input.decision},${input.notes},${input.identityChecked},${input.academicChecked},${input.internalNotes ?? ''})`)
    await audit(tx, reviewer, 'application.' + input.decision, id, {
      revision: app.revision,
      notes: input.notes,
    })
    await notify(
      tx,
      app.tutor_id,
      {
        approved: 'application_approved',
        rejected: 'application_rejected',
        changes_required: 'corrections_requested',
      }[input.decision] as
        | 'application_approved'
        | 'application_rejected'
        | 'corrections_requested',
    )
  })
}
export async function updateTeachingProfile(
  tutor: string,
  fields: z.infer<typeof teachingProfile>,
) {
  await db.transaction(async (tx) => {
    const profile = await one(
      sql`select id from tutor_profiles where id=${tutor} and verification='approved' and not suspended for update`,
      tx,
    )
    invariant(
      profile,
      'INVALID_APPLICATION_STATE',
      'An approved, unsuspended profile is required.',
      409,
    )
    await validateProfile(tx, fields)
    await writeTeachingProfile(tx, tutor, fields)
    await audit(tx, tutor, 'tutor.profile.update', tutor)
  })
}
export async function requestCredentialReview(tutor: string) {
  await db.transaction(async (tx) => {
    const app = await one<Application>(
      sql`select * from tutor_applications where tutor_id=${tutor} and status='approved' for update`,
      tx,
    )
    invariant(
      app,
      'INVALID_APPLICATION_STATE',
      'An approved application is required.',
      409,
    )
    const profile = await one(
      sql`update tutor_profiles set verification='unverified',listing_status='hidden' where id=${tutor} and not suspended returning id`,
      tx,
    )
    invariant(
      profile,
      'FORBIDDEN',
      'Your account cannot perform this action.',
      403,
    )
    await tx.execute(
      sql`update tutor_applications set status='changes_required',updated_at=now() where id=${app.id}`,
    )
    await audit(tx, tutor, 'application.reverification', app.id)
  })
}
function submittedDocument(id: string) {
  return one<StoredDocument>(sql`select d.* from verification_documents d where d.id=${id}
    and exists(select 1 from application_revisions r where r.application_id=d.application_id and r.snapshot->'documents'->>d.kind=d.id::text)`)
}
export async function issueDocumentLink(user: Actor, id: string) {
  invariant(
    user.role === 'admin',
    'FORBIDDEN',
    'Document access is restricted.',
    403,
  )
  const doc = await submittedDocument(id)
  invariant(doc, 'NOT_FOUND', 'The document is unavailable.', 404)
  const expiry = Math.floor(Date.now() / 1000) + 90
  return `/api/v1/admin/documents/${id}/content?expiry=${expiry}&signature=${keyed(`doc:${id}:${user.id}:${expiry}`)}`
}
export async function authorizedDocument(
  user: Actor,
  id: string,
  expiry: number,
  signature: string,
) {
  invariant(
    user.role === 'admin' &&
      Number.isSafeInteger(expiry) &&
      expiry >= Math.floor(Date.now() / 1000) &&
      equal(signature, keyed(`doc:${id}:${user.id}:${expiry}`)),
    'FORBIDDEN',
    'This document link is unavailable or expired.',
    403,
  )
  const doc = await submittedDocument(id)
  invariant(doc, 'NOT_FOUND', 'The document is unavailable.', 404)
  await audit(db, user.id, 'document.read', id)
  return doc
}
