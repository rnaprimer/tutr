import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BadgeCheck, MapPin } from 'lucide-react'
import { actor } from '@/lib/auth'
import { days, places } from '@/lib/core'
import { publicTutor } from '@/lib/directory'
import { listRequirements } from '@/lib/marketplace'
import { one, sql } from '@/lib/db'
import { TutorPhoto } from '@/components/tutor-card'
import { ActionButton } from '@/components/actions'
import { Badge, Button, Card, rupees } from '@/components/ui'

export default async function TutorProfile({
  params,
  searchParams,
}: PageProps<'/tutors/[slug]'>) {
  const [{ slug }, query, user] = await Promise.all([
    params,
    searchParams,
    actor(),
  ])
  const tutor = await publicTutor(slug)
  if (!tutor) notFound()
  const href = `/tutors/${slug}`
  if (query.request === '1' && user?.role !== 'parent')
    redirect(
      '/login?role=parent&next=' + encodeURIComponent(href + '?request=1'),
    )
  const [requirements, saved] =
    user?.role === 'parent'
      ? await Promise.all([
          query.request === '1' ? listRequirements(user.id) : [],
          one(
            sql`select 1 from saved_tutors where parent_id=${user.id} and tutor_id=${tutor.id}`,
          ),
        ])
      : [[], undefined]
  const matching = requirements.filter(
    (r) =>
      r.status === 'published' &&
      r.disclosures < 3 &&
      (!r.target_tutor_id || r.target_tutor_id === tutor.id),
  )
  return (
    <div className="container page">
      <Link href="/tutors" className="row muted mb-4">
        <ArrowLeft size={17} /> Back to tutors
      </Link>
      <div className="profile-grid">
        <div className="profile-details">
          <Card>
            <div className="profile-heading">
              <TutorPhoto tutor={tutor} size={90} />
              <div>
                <Badge>
                  <BadgeCheck size={14} />{' '}
                  {tutor.synthetic ? 'Demo profile' : 'Documents verified'}
                </Badge>
                <h1>{tutor.display_name}</h1>
                <p className="muted">
                  {tutor.qualification} · {tutor.experience} years teaching
                </p>
              </div>
            </div>
            <h2>About</h2>
            <p>{tutor.intro}</p>
          </Card>
          <Card>
            <h2>What I teach</h2>
            <div className="tag-row">
              {tutor.subjects.map((subject) => (
                <span key={subject.id}>{subject.name}</span>
              ))}
            </div>
            <p className="muted">
              Classes {tutor.classes.join(', ')} ·{' '}
              {tutor.boards.map((board) => board.name).join(', ')}
            </p>
          </Card>
          <Card>
            <h2>Teaching area &amp; availability</h2>
            <p className="row">
              <MapPin size={17} /> {tutor.locality}, {tutor.city} ·{' '}
              {places[tutor.teaching_place]}
            </p>
            <div className="tag-row">
              {tutor.areas.map((area) => (
                <span key={area.id}>{area.name}</span>
              ))}
            </div>
            <p className="muted">
              {tutor.days.map((day) => days[day - 1]).join(', ')}
            </p>
          </Card>
        </div>
        <Card className="profile-aside">
          <span className="eyebrow">Expected fee</span>
          <div>
            <strong className="price">{rupees(tutor.fee)}</strong>
            <span className="muted"> / {tutor.fee_unit}</span>
          </div>
          {query.request === '1' ? (
            <>
              <h2 className="text-xl">Request this tutor</h2>
              {matching.length > 0 && (
                <DirectRequestForm
                  tutor={tutor.id}
                  requirements={matching.map((r) => ({
                    id: r.id,
                    name: `Class ${r.class} · ${r.subjects.map((s) => s.name).join(', ')}`,
                  }))}
                />
              )}
              <Button asChild>
                <Link href={`/parent/requirements/new?tutor=${slug}`}>
                  Create a direct requirement
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href={href + '?request=1'}>Request tutor</Link>
            </Button>
          )}
          {user?.role === 'parent' ? (
            <ActionButton
              endpoint={`/parent/saved/${tutor.id}`}
              payload={{ save: !saved }}
              label={saved ? 'Remove from saved' : 'Save tutor'}
            />
          ) : (
            <Button variant="secondary" asChild>
              <Link
                href={'/login?role=parent&next=' + encodeURIComponent(href)}
              >
                Log in to save
              </Link>
            </Button>
          )}
          <p className="muted">
            You decide if and when your verified phone number is shared.
          </p>
        </Card>
      </div>
    </div>
  )
}
import { DirectRequestForm } from '@/components/requirement-form'
