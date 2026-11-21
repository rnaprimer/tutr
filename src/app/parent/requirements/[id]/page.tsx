import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageActor } from '@/lib/page-auth'
import { catalog } from '@/lib/catalog'
import { days, places, uuid } from '@/lib/core'
import { listMatches, listStudents, parentRequirement } from '@/lib/marketplace'
import { one, sql } from '@/lib/db'
import { ActionButton } from '@/components/actions'
import { MatchList } from '@/components/match-list'
import { RequirementForm } from '@/components/requirement-form'
import { Workspace } from '@/components/workspace'
import { Card, PageHeading, Status, rupees } from '@/components/ui'

function RequirementAction({
  id,
  action,
  label,
  confirm,
}: {
  id: string
  action: string
  label: string
  confirm?: string
}) {
  return (
    <ActionButton
      endpoint={`/requirements/${id}/state`}
      payload={{ action }}
      label={label}
      confirm={confirm}
      variant={action === 'publish' ? 'primary' : 'secondary'}
    />
  )
}
export default async function RequirementDetails({
  params,
}: PageProps<'/parent/requirements/[id]'>) {
  const { id } = await params
  if (!uuid.safeParse(id).success) notFound()
  const user = await pageActor('parent', `/parent/requirements/${id}`)
  const [item, matches] = await Promise.all([
    parentRequirement(user.id, id),
    listMatches(user, id),
  ])
  if (!item) notFound()
  const [options, students, target] =
    item.status === 'draft'
      ? await Promise.all([
          catalog(),
          listStudents(user.id),
          item.target_tutor_id
            ? one<{ id: string; name: string }>(
                sql`select id,display_name name from tutor_profiles where id=${item.target_tutor_id}`,
              )
            : undefined,
        ])
      : [undefined, [], undefined]
  return (
    <Workspace role="parent" section="requirements">
      <Link className="underline muted" href="/parent/requirements">
        Back to requirements
      </Link>
      <PageHeading
        title={`Class ${item.class} · ${item.subjects.map((subject) => subject.name).join(', ')}`}
        action={<Status value={item.status} />}
      />
      <Card className="stack mb-4">
        <div className="data-row">
          <div>
            <h3>
              {item.locality} · {item.board}
            </h3>
            <p>
              {places[item.teaching_place]} · {rupees(item.budget)}/{item.unit}{' '}
              · {item.mode === 'direct' ? 'Direct' : 'Open'}
            </p>
          </div>
          <strong>{item.disclosures} of 3 contacts shared</strong>
        </div>
        <p>
          {item.days.map((day) => days[day - 1]).join(', ')} · {item.schedule}
        </p>
        {item.details && <p className="muted">{item.details}</p>}
        {item.disclosures >= 3 && (
          <p className="alert">
            You’ve used all three contact slots. You can still manage existing
            connections and close pending matches.
          </p>
        )}
        <div className="row">
          {['draft', 'paused'].includes(item.status) &&
            item.disclosures < 3 && (
              <RequirementAction
                id={id}
                action="publish"
                label={
                  item.status === 'paused'
                    ? 'Resume'
                    : item.mode === 'direct' && target
                      ? 'Publish and send request'
                      : 'Publish'
                }
                confirm={
                  item.status === 'draft'
                    ? item.mode === 'open'
                      ? 'Publish this opportunity to eligible tutors?'
                      : 'Publish this direct tuition requirement?'
                    : undefined
                }
              />
            )}
          {item.status === 'published' && (
            <RequirementAction id={id} action="pause" label="Pause" />
          )}
          {['published', 'paused'].includes(item.status) && (
            <RequirementAction
              id={id}
              action="fill"
              label="Mark tutor found"
              confirm="Mark this requirement filled and close pending matches?"
            />
          )}
          {['draft', 'published', 'paused'].includes(item.status) && (
            <RequirementAction
              id={id}
              action="close"
              label="Close requirement"
              confirm="Close this requirement and its pending matches? Existing connections retain their current contact access."
            />
          )}
        </div>
      </Card>
      {options && students.length > 0 && (
        <Card className="mb-4">
          <h2>Edit draft</h2>
          <RequirementForm
            key={item.id}
            students={students}
            options={options}
            id={id}
            target={target}
            initial={{
              student: item.student_id,
              class: item.class,
              board: item.board_id,
              locality: item.locality_id,
              subjects: item.subjects.map((s) => s.id),
              budget: item.budget,
              unit: item.unit,
              days: item.days.map(String),
              schedule: item.schedule,
              place: item.teaching_place,
              details: item.details,
              mode: item.mode,
              target: item.target_tutor_id ?? undefined,
            }}
          />
        </Card>
      )}
      <h2>Matches</h2>
      <MatchList actor={user} matches={matches} />
    </Workspace>
  )
}
