import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageActor } from '@/lib/page-auth'
import { publicTutor } from '@/lib/directory'
import { catalog } from '@/lib/catalog'
import { listStudents } from '@/lib/marketplace'
import { RequirementForm } from '@/components/requirement-form'
import { Workspace } from '@/components/workspace'
import { Button, Card, Empty, PageHeading } from '@/components/ui'

export default async function NewRequirement({
  searchParams,
}: PageProps<'/parent/requirements/new'>) {
  const query = await searchParams
  const slug = typeof query.tutor === 'string' ? query.tutor : undefined
  const user = await pageActor(
    'parent',
    '/parent/requirements/new' +
      (slug ? '?tutor=' + encodeURIComponent(slug) : ''),
  )
  const [students, options, tutor] = await Promise.all([
    listStudents(user.id),
    catalog(),
    slug ? publicTutor(slug) : undefined,
  ])
  if (slug && !tutor) notFound()
  return (
    <Workspace role="parent" section="requirements">
      <PageHeading title="New requirement">
        {tutor
          ? `Create a tuition requirement for ${tutor.display_name}.`
          : 'Describe the tuition your child needs. You can review the draft before publishing.'}
      </PageHeading>
      {students.length ? (
        <Card>
          <RequirementForm
            students={students}
            options={options}
            target={
              tutor ? { id: tutor.id, name: tutor.display_name } : undefined
            }
          />
        </Card>
      ) : (
        <Empty title="Add a student profile first.">
          <Button asChild>
            <Link href="/parent/students">Add student profile</Link>
          </Button>
        </Empty>
      )}
    </Workspace>
  )
}
