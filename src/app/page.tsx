import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  House,
  MapPin,
  Search,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { brand } from '@/lib/brand'
import { catalog } from '@/lib/catalog'
import { directory } from '@/lib/directory'
import {
  Button,
  Card,
  Empty,
  Field,
  Select,
  classOptions,
} from '@/components/ui'
import { TutorCard } from '@/components/tutor-card'

const steps = [
  {
    title: 'Find a local tutor',
    body: 'Compare verified profiles by class, subject and neighbourhood, or post what your child needs.',
    Icon: Search,
  },
  {
    title: 'Agree to connect',
    body: 'Send a request or review interested tutors. Both sides agree before you choose whether to share your number.',
    Icon: UsersRound,
  },
  {
    title: 'Meet for a lesson',
    body: 'Discuss timing, fees and the first lesson directly. Lessons take place at your home or the tutor’s home.',
    Icon: House,
  },
]
const faq = [
  [
    'What does “documents verified” mean?',
    'Our team reviews government identity and academic documents before a tutor can activate a profile. Document review is one part of getting to know a tutor.',
  ],
  [
    'When is my phone number shared?',
    'Only after you explicitly confirm sharing it with a specific tutor who has agreed to connect. You can share it with up to three tutors per requirement.',
  ],
  [
    'What classes and boards do you cover?',
    'You can search for Classes 1–12 and filter by academic board and subject. Available combinations depend on the tutors serving your locality.',
  ],
  [
    'How do tutoring fees work?',
    'Tutors display an expected rate, and you arrange lesson fees directly. The platform does not charge parents per connection.',
  ],
]
export const dynamic = 'force-dynamic'
export default async function Home() {
  const [catalogs, featured] = await Promise.all([
    catalog(),
    directory({ page: 1, sort: 'newest' }, 3),
  ])
  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="location-chip">
                <MapPin size={14} /> {brand.city}, {brand.region}
              </div>
              <h1>
                Find a great tutor.
                <br />
                <em>Close to home.</em>
              </h1>
              <p>
                Discover verified local tutors for Classes 1–12 and arrange
                in-person lessons that fit your child’s needs.
              </p>
              <div className="hero-actions">
                <Button asChild>
                  <a href="#find">
                    Find a tutor <ArrowDown size={16} />
                  </a>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/parent/requirements/new">
                    Post a requirement <ArrowUpRight size={15} />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="hero-visual">
              <Image
                src="/tutoring.webp"
                alt="A tutor and student working through a notebook together"
                fill
                sizes="(max-width: 780px) 96vw, 50vw"
                preload
              />
              <div className="hero-label">
                <span className="icon-tile">
                  <BookOpen size={20} />
                </span>
                <span>
                  <strong>One-to-one tutoring</strong>
                  <small>In person for Classes 1–12</small>
                </span>
              </div>
            </div>
          </div>
          <form
            className="search-panel"
            id="find"
            action="/tutors"
            aria-label="Find a tutor"
          >
            <Field label="Class">
              <Select
                name="class"
                options={classOptions}
                placeholder="Any class"
              />
            </Field>
            <Field label="Subject">
              <Select
                name="subject"
                options={catalogs.subjects}
                placeholder="Any subject"
              />
            </Field>
            <Field label="Locality">
              <Select
                name="locality"
                options={catalogs.localities}
                placeholder="Any locality"
              />
            </Field>
            <Button type="submit">
              <Search size={17} /> Search tutors
            </Button>
          </form>
        </div>
      </section>
      <section
        className="container trust-strip"
        aria-label="How tutoring works"
      >
        {[
          {
            Icon: BadgeCheck,
            title: 'Documents checked',
            text: 'Identity and qualifications reviewed',
          },
          {
            Icon: ShieldCheck,
            title: 'Your contact stays private',
            text: 'Shared only with your consent',
          },
          {
            Icon: MapPin,
            title: 'In-person & local',
            text: `Tutors serving ${brand.city}`,
          },
        ].map(({ Icon, title, text }) => (
          <div className="trust-item" key={title}>
            <Icon size={23} strokeWidth={1.6} />
            <div>
              <strong>{title}</strong>
              <small>{text}</small>
            </div>
          </div>
        ))}
      </section>
      <section className="featured-section section">
        <div className="container">
          <div className="section-heading">
            <div>
              <div className="eyebrow">Explore the directory</div>
              <h2>Meet your local tutors</h2>
              <p>Compare teaching experience, subjects and expected fees.</p>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/tutors">
                View all tutors <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
          <div className="cards-grid">
            {featured.tutors.length ? (
              featured.tutors.map((tutor) => (
                <TutorCard key={tutor.id} tutor={tutor} />
              ))
            ) : (
              <Empty title="Tutor profiles are coming soon.">
                Post a tuition requirement to describe the teaching support
                you’re looking for.
              </Empty>
            )}
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <div className="eyebrow">From search to first lesson</div>
            <h2>How it works</h2>
          </div>
        </div>
        <div className="steps-grid">
          {steps.map(({ Icon, title, body }) => (
            <Card className="step-card" key={title}>
              <span className="icon-tile">
                <Icon size={21} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </Card>
          ))}
        </div>
      </section>
      <section className="container banner">
        <div>
          <h2>Teach in {brand.city}?</h2>
          <p>
            Create a tutor profile and connect with local families after
            verification.
          </p>
        </div>
        <Button asChild variant="white">
          <Link href="/become-a-tutor">
            Become a tutor <ArrowUpRight size={16} />
          </Link>
        </Button>
      </section>
      <section className="container section info-grid">
        <div>
          <div className="eyebrow">Questions from families</div>
          <h2>Good to know</h2>
        </div>
        <div className="faq">
          {faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
