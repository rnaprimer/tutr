import { GoogleAccountSettings } from '@/components/google-sign-in'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { pageActor } from '@/lib/page-auth'
import type { Actor } from '@/lib/auth'
import { catalog } from '@/lib/catalog'
import { savedTutors } from '@/lib/directory'
import {
  listMatches,
  listRequirements,
  listStudents,
  parentSettings,
  type RequirementView,
} from '@/lib/marketplace'
import { maskedAccountPhone } from '@/lib/admin'
import { ActionButton, SimpleForm } from '@/components/actions'
import { MatchList } from '@/components/match-list'
import { TutorCard } from '@/components/tutor-card'
import {
  DataList,
  Notices,
  SignOut,
  Stats,
  Workspace,
  parentSections,
} from '@/components/workspace'
import {
  Button,
  Card,
  Empty,
  Field,
  PageHeading,
  Select,
  Status,
  classOptions,
} from '@/components/ui'
import type { Option } from '@/lib/catalog'

function StudentFields({
  boards,
  initial,
}: {
  boards: Option[]
  initial?: { label: string; class: number; board_id: string }
}) {
  return (
    <div className="form-grid">
      <Field
        label="Student label"
        hint="Use a nickname or academic label, such as “Class 8 student”."
      >
        <input
          name="label"
          defaultValue={initial?.label}
          maxLength={30}
          required
        />
      </Field>
      <Field label="Class">
        <Select
          name="class"
          options={classOptions}
          defaultValue={initial?.class}
          placeholder="Choose class"
          required
        />
      </Field>
      <Field label="Board">
        <Select
          name="board"
          options={boards}
          defaultValue={initial?.board_id}
          placeholder="Choose board"
          required
        />
      </Field>
    </div>
  )
}
function RequirementRow({ item }: { item: RequirementView }) {
  return (
    <div className="data-row">
      <div>
        <h3>
          Class {item.class} ·{' '}
          {item.subjects.map((subject) => subject.name).join(', ')}
        </h3>
        <p>
          {item.locality} · {item.mode === 'direct' ? 'Direct' : 'Open'} ·{' '}
          {item.disclosures}/3 contacts shared
          {item.applicant_count > 0 &&
            ` · ${item.applicant_count} awaiting your review`}
        </p>
      </div>
      <div className="row">
        <Status value={item.status} />
        <Button asChild variant="secondary">
          <Link href={`/parent/requirements/${item.id}`}>Manage</Link>
        </Button>
      </div>
    </div>
  )
}
async function Section({
  section,
  user,
  googleError,
}: {
  googleError?: unknown
  section: (typeof parentSections)[number]
  user: Actor
}) {
  if (section === 'dashboard') {
    const [requirements, matches, saved, settings] = await Promise.all([
      listRequirements(user.id),
      listMatches(user),
      savedTutors(user.id),
      parentSettings(user.id),
    ])
    return (
      <>
        <PageHeading
          eyebrow="Guardian workspace"
          title={`Hello, ${settings?.display_name ?? 'Guardian'}`}
          action={
            <Button asChild>
              <Link href="/parent/requirements/new">
                <Plus size={17} /> New requirement
              </Link>
            </Button>
          }
        >
          Manage your tutoring requirements and choose which tutors can contact
          you.
        </PageHeading>
        <Stats
          items={[
            {
              label: 'Active requirements',
              value: requirements.filter((r) => r.status === 'published')
                .length,
            },
            {
              label: 'Interested tutors',
              value: matches.filter(
                (m) =>
                  m.kind === 'open' &&
                  ['pending_parent', 'awaiting_parent_consent'].includes(
                    m.state,
                  ),
              ).length,
            },
            {
              label: 'Pending direct requests',
              value: matches.filter((m) => m.state === 'pending_tutor').length,
            },
            {
              label: 'Confirmed connections',
              value: matches.filter(
                (m) => m.state === 'connected' && !m.revoked,
              ).length,
            },
            { label: 'Saved tutors', value: saved.length },
          ]}
        />
        <div className="row my-4">
          <Button asChild variant="secondary">
            <Link href="/tutors">Find a tutor</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/parent/students">Manage students</Link>
          </Button>
        </div>
        <Notices user={user.id} />
      </>
    )
  }
  if (section === 'students') {
    const [students, options] = await Promise.all([
      listStudents(user.id),
      catalog(),
    ])
    return (
      <>
        <PageHeading eyebrow="Guardian workspace" title="Students">
          Keep a basic academic profile for each student whose tuition you
          manage.
        </PageHeading>
        <Card className="mb-4">
          <h2>Add a student</h2>
          <SimpleForm endpoint="/parent/students" button="Add student" reset>
            <StudentFields boards={options.boards} />
          </SimpleForm>
        </Card>
        <DataList
          items={students}
          title="No student profiles yet."
          render={(student) => (
            <div className="stack">
              <div className="data-row">
                <div>
                  <h3>{student.label}</h3>
                  <p>
                    Class {student.class} · {student.board}
                  </p>
                </div>
                <ActionButton
                  endpoint={`/parent/students/${student.id}/archive`}
                  label="Archive"
                  confirm="Archive this student profile? Existing requirements will remain available."
                />
              </div>
              <details>
                <summary className="cursor-pointer">
                  Edit academic details
                </summary>
                <div className="mt-2">
                  <SimpleForm
                    endpoint={`/parent/students/${student.id}`}
                    button="Save changes"
                  >
                    <StudentFields initial={student} boards={options.boards} />
                  </SimpleForm>
                </div>
              </details>
            </div>
          )}
        />
      </>
    )
  }
  if (section === 'requirements') {
    const items = await listRequirements(user.id)
    return (
      <>
        <PageHeading
          title="Requirements"
          action={
            <Button asChild>
              <Link href="/parent/requirements/new">
                <Plus size={17} /> New requirement
              </Link>
            </Button>
          }
        />
        <DataList
          items={items}
          title="You haven’t created a requirement yet."
          render={(item) => <RequirementRow item={item} />}
        />
      </>
    )
  }
  if (section === 'requests' || section === 'connections') {
    const matches = await listMatches(user)
    const items =
      section === 'requests'
        ? matches.filter((m) => m.state !== 'connected')
        : matches.filter((m) => m.state === 'connected' || m.revoked)
    return (
      <>
        <PageHeading
          title={
            section === 'requests' ? 'Requests and applications' : 'Connections'
          }
        >
          {section === 'requests'
            ? 'Review direct requests and interest in your open requirements.'
            : 'Manage access to the contact details you have shared.'}
        </PageHeading>
        <MatchList actor={user} matches={items} />
      </>
    )
  }
  if (section === 'saved-tutors') {
    const saved = await savedTutors(user.id)
    return (
      <>
        <PageHeading title="Saved tutors" />
        <div className="cards-grid">
          {saved.length ? (
            saved.map((tutor) => <TutorCard key={tutor.id} tutor={tutor} />)
          ) : (
            <Empty title="You haven’t saved a tutor yet.">
              <Button asChild>
                <Link href="/tutors">Browse tutor profiles</Link>
              </Button>
            </Empty>
          )}
        </div>
      </>
    )
  }
  const [settings, number] = await Promise.all([
    parentSettings(user.id),
    maskedAccountPhone(user.id),
  ])
  return (
    <>
      <PageHeading title="Account settings" />
      <Card className="stack">
        <h2>Guardian account</h2>
        <p>
          Verified mobile <strong>{number ?? 'Unavailable'}</strong>
        </p>
        {!number && (
          <p className="muted">
            A verified mobile number is required to share your contact with a
            tutor.
          </p>
        )}
        <GoogleAccountSettings user={user} error={googleError} />
        <SimpleForm endpoint="/parent/settings" button="Save changes">
          <Field label="Display name">
            <input
              name="displayName"
              defaultValue={settings?.display_name}
              minLength={2}
              maxLength={60}
              required
            />
          </Field>
        </SimpleForm>
        <Link className="underline" href="/data-rights">
          Account and data rights
        </Link>
        <div>
          <SignOut />
        </div>
      </Card>
    </>
  )
}
export default async function ParentSection({
  params,
  searchParams,
}: PageProps<'/parent/[section]'>) {
  const [{ section }, query] = await Promise.all([params, searchParams])
  const selected = parentSections.find((item) => item === section)
  if (!selected) notFound()
  const user = await pageActor('parent', `/parent/${section}`)
  return (
    <Workspace role="parent" section={section}>
      <Section user={user} section={selected} googleError={query.google} />
    </Workspace>
  )
}
