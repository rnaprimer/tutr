import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageActor } from '@/lib/page-auth'
import { reviewDetails } from '@/lib/admin'
import { catalog } from '@/lib/catalog'
import { days, uuid } from '@/lib/core'
import { SimpleForm } from '@/components/actions'
import { Workspace } from '@/components/workspace'
import {
  Button,
  Card,
  Field,
  PageHeading,
  Select,
  Status,
  timestamp,
} from '@/components/ui'

const labels: Record<string, string> = {
  legalName: 'Legal name',
  displayName: 'Public name',
  locality: 'Home locality',
  intro: 'Introduction',
  subjects: 'Subjects',
  classes: 'Classes',
  boards: 'Boards',
  areas: 'Service localities',
  days: 'Available days',
  teachingPlace: 'Teaching location',
  fee: 'Fee (INR)',
  feeUnit: 'Fee unit',
  qualification: 'Qualification',
  institution: 'Institution',
  credentials: 'Credentials',
  experience: 'Experience in years',
  additional: 'Additional qualifications',
  declaration: 'Declaration',
}
const documents: Record<string, string> = {
  identity: 'Government identity document',
  academic: 'Academic certificate',
  photo: 'Profile photo',
}
export default async function Review({
  params,
}: PageProps<'/admin/applications/[id]'>) {
  const { id } = await params
  if (!uuid.safeParse(id).success) notFound()
  await pageActor('admin', `/admin/applications/${id}`)
  const [record, catalogs] = await Promise.all([reviewDetails(id), catalog()])
  if (!record) notFound()
  const { app, history } = record
  const choices = new Map(
    [...catalogs.subjects, ...catalogs.localities, ...catalogs.boards].map(
      ({ id, name }) => [id, name],
    ),
  )
  function display(key: string, value: unknown) {
    if (key === 'days' && Array.isArray(value))
      return value.map((day) => days[Number(day) - 1]).join(', ')
    if (Array.isArray(value))
      return value
        .map((entry) => choices.get(String(entry)) ?? String(entry))
        .join(', ')
    if (value === true) return 'Accepted'
    if (value === false) return 'Pending'
    return (
      choices.get(String(value)) ?? String(value || '—').replaceAll('_', ' ')
    )
  }
  return (
    <Workspace role="admin" section="applications">
      <Link href="/admin/applications" className="muted underline">
        Back to application queue
      </Link>
      <PageHeading
        title={String(app.snapshot?.fields.displayName ?? 'Tutor application')}
        action={<Status value={app.status} />}
      >
        {app.revision
          ? `Submitted revision ${app.revision}`
          : 'This draft has no submitted revision.'}
      </PageHeading>
      {app.snapshot && (
        <Card className="mb-4">
          <h2>Submitted details</h2>
          <dl className="form-grid">
            {Object.entries(labels).map(([key, label]) => (
              <div key={key}>
                <dt className="font-semibold">{label}</dt>
                <dd className="muted whitespace-pre-wrap">
                  {display(key, app.snapshot?.fields[key])}
                </dd>
              </div>
            ))}
          </dl>
          <h2 className="mt-5">Private documents</h2>
          <div className="row">
            {Object.entries(app.snapshot.documents).map(([kind, file]) => (
              <Button key={file} variant="secondary" asChild>
                <a
                  href={`/api/v1/admin/documents/${file}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {documents[kind] ?? kind}
                </a>
              </Button>
            ))}
          </div>
        </Card>
      )}
      {app.status === 'pending_review' && (
        <Card className="mb-4">
          <h2>Record decision</h2>
          <SimpleForm
            endpoint={`/admin/applications/${id}/review`}
            button="Record decision"
            constants={{ revision: app.revision }}
            checkboxFields={['identityChecked', 'academicChecked']}
          >
            <label className="checkbox-line">
              <input name="identityChecked" type="checkbox" />
              Reviewed government identity document
            </label>
            <label className="checkbox-line">
              <input name="academicChecked" type="checkbox" />
              Reviewed academic credentials
            </label>
            <Field label="Decision">
              <Select
                name="decision"
                options={[
                  { id: 'approved', name: 'Approve' },
                  { id: 'changes_required', name: 'Request corrections' },
                  { id: 'rejected', name: 'Reject' },
                ]}
                placeholder="Choose a decision"
                required
              />
            </Field>
            <Field label="Feedback to tutor">
              <textarea name="notes" required minLength={5} maxLength={1500} />
            </Field>
            <Field label="Internal reviewer notes (optional)">
              <textarea name="internalNotes" maxLength={1500} />
            </Field>
          </SimpleForm>
        </Card>
      )}
      <Card>
        <h2>Review history</h2>
        {history.length ? (
          <ul className="stack">
            {history.map((entry) => (
              <li key={entry.id} className="border-t border-[#e2e6df] pt-2">
                <div className="row">
                  <Status value={entry.decision} />
                  <span>
                    Revision {entry.revision} · {timestamp(entry.created_at)}
                  </span>
                </div>
                <p>{entry.notes}</p>
                {entry.internal_notes && (
                  <p className="muted">
                    Internal notes · {entry.internal_notes}
                  </p>
                )}
                <small>Reviewer {entry.reviewer_id}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No review decisions recorded.</p>
        )}
      </Card>
    </Workspace>
  )
}
