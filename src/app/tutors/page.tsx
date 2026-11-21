import Link from 'next/link'
import { Search } from 'lucide-react'
import { catalog } from '@/lib/catalog'
import { days, places } from '@/lib/core'
import { directory, directoryInput } from '@/lib/directory'
import { TutorCard } from '@/components/tutor-card'
import {
  Button,
  Card,
  Empty,
  Field,
  PageHeading,
  Pagination,
  Select,
  classOptions,
} from '@/components/ui'

const feeOptions = [
  { id: 'month', name: 'Per month' },
  { id: 'hour', name: 'Per hour' },
]
export default async function Tutors({ searchParams }: PageProps<'/tutors'>) {
  const query = await searchParams
  const strings = Object.fromEntries(
    Object.entries(query).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  )
  const parsed = directoryInput.safeParse(strings)
  const [options, result] = await Promise.all([
    catalog(),
    directory(parsed.success ? parsed.data : { page: 1, sort: 'newest' }),
  ])
  return (
    <div className="page container">
      <PageHeading title="Find a tutor">
        Browse local tutors and narrow your search by what matters for your
        child.
      </PageHeading>
      <Card>
        <form className="filters !mb-0" action="/tutors">
          <Field label="Class">
            <Select
              name="class"
              defaultValue={strings.class}
              placeholder="Any class"
              options={classOptions}
            />
          </Field>
          <Field label="Subject">
            <Select
              name="subject"
              defaultValue={strings.subject}
              placeholder="Any subject"
              options={options.subjects}
            />
          </Field>
          <Field label="Board">
            <Select
              name="board"
              defaultValue={strings.board}
              placeholder="Any board"
              options={options.boards}
            />
          </Field>
          <Field label="Locality">
            <Select
              name="locality"
              defaultValue={strings.locality}
              placeholder="Any locality"
              options={options.localities}
            />
          </Field>
          {options.cities.length > 1 && (
            <Field label="City">
              <Select
                name="city"
                defaultValue={strings.city}
                placeholder="Any city"
                options={options.cities}
              />
            </Field>
          )}
          <Field label="Teaching location">
            <Select
              name="place"
              defaultValue={strings.place}
              placeholder="Either location"
              options={Object.entries(places).map(([id, name]) => ({
                id,
                name,
              }))}
            />
          </Field>
          <Field label="Availability">
            <Select
              name="day"
              defaultValue={strings.day}
              placeholder="Any day"
              options={days.map((name, i) => ({ id: i + 1, name }))}
            />
          </Field>
          <Field label="Fee unit">
            <Select
              name="unit"
              defaultValue={strings.unit}
              placeholder="Any fee unit"
              options={feeOptions}
            />
          </Field>
          <Field label="Sort by">
            <Select
              name="sort"
              defaultValue={strings.sort}
              options={[
                { id: 'newest', name: 'Recently listed' },
                { id: 'experience', name: 'Most experience' },
                { id: 'fee', name: 'Lowest fee' },
              ]}
            />
          </Field>
          <Field label="Minimum fee (₹)">
            <input
              type="number"
              min="1"
              name="min"
              defaultValue={strings.min}
              placeholder="No minimum"
            />
          </Field>
          <Field label="Maximum fee (₹)">
            <input
              type="number"
              min="1"
              name="max"
              defaultValue={strings.max}
              placeholder="No maximum"
            />
          </Field>
          <div className="filter-buttons">
            <Button type="submit">
              <Search size={17} /> Apply filters
            </Button>
            <Button asChild variant="quiet">
              <Link href="/tutors">Reset</Link>
            </Button>
          </div>
          {!parsed.success && (
            <p className="alert alert-error span-all" role="alert">
              Some filters were invalid. Check the selections and try again.
            </p>
          )}
        </form>
      </Card>
      <div className="cards-grid mt-5">
        {result.tutors.length ? (
          result.tutors.map((tutor) => (
            <TutorCard key={tutor.id} tutor={tutor} />
          ))
        ) : (
          <Empty title="No tutors match these filters.">
            <Link href="/tutors">Clear filters</Link> or{' '}
            <Link href="/parent/requirements/new">
              post a tuition requirement
            </Link>
            .
          </Empty>
        )}
      </div>
      <Pagination
        page={result.page}
        hasNext={result.hasNext}
        href={(page) =>
          '/tutors?' + new URLSearchParams({ ...strings, page: String(page) })
        }
      />
    </div>
  )
}
