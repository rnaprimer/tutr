import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, BadgeCheck, MapPin, UserRound } from 'lucide-react'
import type { PublicTutor } from '@/lib/directory'
import { Badge, Button, Card, rupees } from './ui'

export function TutorPhoto({
  tutor,
  size = 60,
}: {
  tutor: PublicTutor
  size?: number
}) {
  return tutor.photo ? (
    <Image
      className="tutor-photo"
      src={`/api/v1/tutors/${tutor.slug}/photo`}
      alt=""
      width={size}
      height={size}
      unoptimized
    />
  ) : (
    <div
      className="tutor-photo portrait-fallback"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <UserRound size={size / 2} />
    </div>
  )
}
function classRange(classes: number[]) {
  if (!classes.length) return ''
  if (classes.length === 1) return `Class ${classes[0]}`
  return classes.at(-1)! - classes[0] + 1 === classes.length
    ? `Classes ${classes[0]}–${classes.at(-1)}`
    : `Classes ${classes.join(', ')}`
}
export function TutorCard({ tutor }: { tutor: PublicTutor }) {
  const href = `/tutors/${tutor.slug}`
  return (
    <Card className="tutor-card">
      <div className="tutor-top">
        <TutorPhoto tutor={tutor} />
        <div>
          <Badge>
            <BadgeCheck size={13} />{' '}
            {tutor.synthetic ? 'Demo profile' : 'Documents verified'}
          </Badge>
          <h3>
            <Link href={href}>{tutor.display_name}</Link>
          </h3>
          <p>
            {tutor.qualification} · {tutor.experience}{' '}
            {tutor.experience === 1 ? 'year' : 'years'} teaching
          </p>
        </div>
      </div>
      <div className="tag-row">
        {tutor.subjects.slice(0, 3).map((subject) => (
          <span key={subject.id}>{subject.name}</span>
        ))}
        {tutor.subjects.length > 3 && <span>+{tutor.subjects.length - 3}</span>}
      </div>
      <div className="tutor-meta">
        <span>
          <MapPin size={15} /> {tutor.locality}
        </span>
        <span>{classRange(tutor.classes)}</span>
      </div>
      <div className="tutor-bottom">
        <span>
          <strong>{rupees(tutor.fee)}</strong>
          <small>/{tutor.fee_unit}</small>
        </span>
        <Button asChild variant="quiet">
          <Link href={href}>
            View profile <ArrowUpRight size={15} />
          </Link>
        </Button>
      </div>
      <Button asChild variant="secondary" className="card-request">
        <Link href={href + '?request=1'}>Request tutor</Link>
      </Button>
    </Card>
  )
}
