import { GoogleAccountSettings } from '@/components/google-sign-in'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageActor } from '@/lib/page-auth'
import type { Actor } from '@/lib/auth'
import { brand } from '@/lib/brand'
import { catalog } from '@/lib/catalog'
import { days, devServices, places } from '@/lib/core'
import { getApplication, draftDocuments } from '@/lib/onboarding'
import { maskedAccountPhone, pagination } from '@/lib/admin'
import { profileEditor } from '@/lib/directory'
import { listMatches, opportunities } from '@/lib/marketplace'
import { currentFee, paymentHistory } from '@/lib/payments'
import { one, sql } from '@/lib/db'
import { ActionButton } from '@/components/actions'
import { Checkout } from '@/components/checkout'
import { MatchList } from '@/components/match-list'
import {
  ApplicationWizard,
  ProfileEditor,
  type TutorFields,
} from '@/components/tutor-forms'
import {
  DataList,
  Notices,
  SignOut,
  Stats,
  Workspace,
  tutorSections,
} from '@/components/workspace'
import {
  Badge,
  Button,
  Card,
  PageHeading,
  Pagination,
  Status,
  rupees,
  timestamp,
} from '@/components/ui'

type Section = (typeof tutorSections)[number]
async function Application({ user }: { user: Actor }) {
  const app = await getApplication(user.id)
  const writable = app.status === 'draft' || app.status === 'changes_required'
  const [decision, photo, options, docs] = await Promise.all([
    one<{ notes: string; decision: string; created_at: Date }>(
      sql`select notes,decision,created_at from application_decisions where application_id=${app.id} order by created_at desc limit 1`,
    ),
    writable ? maskedAccountPhone(user.id) : undefined,
    writable ? catalog() : undefined,
    writable ? draftDocuments(app.id) : [],
  ])
  return (
    <>
      <PageHeading
        title="Verification application"
        action={<Status value={app.status} />}
      >
        {writable
          ? 'Complete all five steps and submit your information for review. Your draft saves as you go.'
          : 'Track the status of your submitted application here.'}
      </PageHeading>
      {decision && (
        <Card className="mb-4">
          <h2>Latest review decision</h2>
          <p className="muted">
            {timestamp(decision.created_at)} ·{' '}
            {decision.decision.replaceAll('_', ' ')}
          </p>
          <p>{decision.notes}</p>
        </Card>
      )}
      {options ? (
        <ApplicationWizard
          initial={app.draft as Partial<TutorFields>}
          options={options}
          uploaded={docs.map((file) => file.kind)}
          masked={photo ?? ''}
        />
      ) : (
        <Card className="stack">
          {app.status === 'pending_review' && (
            <p>
              Revision {app.revision} is with the verification team. You can
              check this page for the outcome.
            </p>
          )}
          {app.status === 'rejected' && (
            <p>
              Your application was rejected. See the latest decision for
              details.
            </p>
          )}
          {app.status === 'approved' && (
            <>
              <p>Your identity and academic review is complete.</p>
              <Button asChild className="w-fit">
                <Link href="/tutor/activate">View activation</Link>
              </Button>
            </>
          )}
        </Card>
      )}
    </>
  )
}
async function SectionContent({
  section,
  user,
  page,
  googleError,
}: {
  googleError?: unknown
  section: Section
  user: Actor
  page: number
}) {
  if (section === 'application') return <Application user={user} />
  if (section === 'activate') {
    const [profile, fee] = await Promise.all([
      profileEditor(user.id),
      currentFee(),
    ])
    const eligible =
      profile?.verification === 'approved' &&
      !profile.suspended &&
      profile.payment_status !== 'paid'
    return (
      <>
        <PageHeading title="Activate profile">
          The one-time onboarding fee becomes payable after document approval.
        </PageHeading>
        <Card className="stack">
          {profile?.suspended ? (
            <p>Your profile is suspended. Use the help centre for support.</p>
          ) : profile?.listing_status === 'listed' ? (
            <>
              <p>Your profile is active.</p>
              <Button asChild className="w-fit">
                <Link href={`/tutors/${profile.slug}`}>
                  View public profile
                </Link>
              </Button>
            </>
          ) : eligible ? (
            fee ? (
              <>
                <h2>{rupees(fee.amount / 100)} onboarding fee</h2>
                <p className="muted">
                  Checkout shows the amount attached to your order. See payment
                  history after checkout.
                </p>
                <Checkout
                  brand={brand.name}
                  sandbox={devServices() && !process.env.RAZORPAY_KEY_ID}
                />
              </>
            ) : (
              <p className="alert">
                Checkout will be available once an administrator sets the fee.
              </p>
            )
          ) : (
            <>
              <p>Your application must be approved before you can pay.</p>
              <Button asChild className="w-fit" variant="secondary">
                <Link href="/tutor/application">View application</Link>
              </Button>
            </>
          )}
        </Card>
      </>
    )
  }
  if (section === 'dashboard') {
    const [app, profile, matches, relevant] = await Promise.all([
      getApplication(user.id),
      profileEditor(user.id),
      listMatches(user),
      opportunities(user.id),
    ])
    const current = profile?.suspended
      ? 'suspended'
      : profile?.listing_status === 'listed'
        ? 'active'
        : profile?.verification === 'approved' &&
            profile.payment_status !== 'paid'
          ? 'approved unpaid'
          : app.status
    const completed = [
      app.draft.displayName,
      app.draft.subjects?.length,
      app.draft.qualification,
      app.revision,
      app.draft.declaration,
    ].filter(Boolean).length
    return (
      <>
        <PageHeading
          eyebrow="Tutor workspace"
          title={
            profile?.displayName
              ? `Hello, ${profile.displayName}`
              : 'Tutor dashboard'
          }
          action={<Status value={current} />}
        >
          Track verification, activation and the families looking for your
          teaching expertise.
        </PageHeading>
        <Stats
          items={[
            { label: 'Application progress', value: `${completed}/5` },
            {
              label: 'New direct requests',
              value: matches.filter((m) => m.state === 'pending_tutor').length,
            },
            {
              label: 'Relevant opportunities',
              value: relevant.hasNext ? '15+' : relevant.items.length,
            },
            {
              label: 'Pending applications',
              value: matches.filter(
                (m) =>
                  m.kind === 'open' &&
                  ['pending_parent', 'awaiting_parent_consent'].includes(
                    m.state,
                  ),
              ).length,
            },
            {
              label: 'Confirmed connections',
              value: matches.filter(
                (m) => m.state === 'connected' && !m.revoked,
              ).length,
            },
          ]}
        />
        <div className="row my-4">
          <Button asChild>
            <Link
              href={
                current === 'active'
                  ? '/tutor/opportunities'
                  : current === 'approved unpaid'
                    ? '/tutor/activate'
                    : '/tutor/application'
              }
            >
              {current === 'active'
                ? 'Explore opportunities'
                : current === 'approved unpaid'
                  ? 'Activate profile'
                  : 'View verification application'}
            </Link>
          </Button>
        </div>
        <Notices user={user.id} />
      </>
    )
  }
  if (section === 'opportunities') {
    const [profile, results] = await Promise.all([
      profileEditor(user.id),
      opportunities(user.id, page),
    ])
    return (
      <>
        <PageHeading title="Open opportunities">
          Find published requests that match your subjects, boards, classes,
          service areas and teaching location.
        </PageHeading>
        {profile?.listing_status !== 'listed' ? (
          <Card className="stack">
            <p>Activate your tutor profile to find matching opportunities.</p>
            <Button asChild className="w-fit">
              <Link href="/tutor/activate">View activation</Link>
            </Button>
          </Card>
        ) : (
          <DataList
            items={results.items}
            title="No matching opportunities right now."
            render={(item) => (
              <div className="stack">
                <div className="data-row">
                  <div>
                    <h3>
                      Class {item.class} ·{' '}
                      {item.subjects.map((s) => s.name).join(', ')}
                    </h3>
                    <p>
                      {item.board} · {item.locality} ·{' '}
                      {places[item.teaching_place]}
                    </p>
                  </div>
                  <Badge>
                    {rupees(item.budget)}/{item.unit}
                  </Badge>
                </div>
                <p>
                  {item.days.map((day) => days[day - 1]).join(', ')} ·{' '}
                  {item.schedule}
                </p>
                <div>
                  <ActionButton
                    endpoint={`/requirements/${item.id}/interest`}
                    label="Express interest"
                    variant="primary"
                    confirm="Let the guardian know you’re interested in this requirement? They decide if they want to share their number."
                  />
                </div>
              </div>
            )}
          />
        )}
        <Pagination
          page={results.page}
          hasNext={results.hasNext}
          href={(value) => '/tutor/opportunities?page=' + value}
        />
      </>
    )
  }
  if (
    section === 'requests' ||
    section === 'applications' ||
    section === 'connections'
  ) {
    const matches = await listMatches(user)
    const filtered =
      section === 'connections'
        ? matches.filter((m) => m.state === 'connected' || m.revoked)
        : matches.filter(
            (m) =>
              m.kind === (section === 'requests' ? 'direct' : 'open') &&
              m.state !== 'connected',
          )
    return (
      <>
        <PageHeading
          title={
            section === 'requests'
              ? 'Direct requests'
              : section === 'applications'
                ? 'My applications'
                : 'Connections'
          }
        >
          {section === 'connections'
            ? 'Access guardian numbers for your authorized connections.'
            : 'Manage your tutoring matches and review their current status.'}
        </PageHeading>
        <MatchList actor={user} matches={filtered} />
      </>
    )
  }
  if (section === 'profile') {
    const [profile, options] = await Promise.all([
      profileEditor(user.id),
      catalog(),
    ])
    return (
      <>
        <PageHeading title="Teaching profile">
          Edit teaching details and see your current listing status.
        </PageHeading>
        {profile?.verification === 'approved' && !profile.suspended ? (
          <div className="stack">
            <Card>
              <ProfileEditor
                initial={{
                  ...profile,
                  classes: profile.classes.map(String),
                  days: profile.days.map(String),
                }}
                options={options}
              />
            </Card>
            <Card className="stack">
              <h2>Update verified credentials</h2>
              <p>
                Submit another application revision to update your legal name or
                academic records. Your listing will be paused during review.
              </p>
              <div>
                <ActionButton
                  endpoint="/tutor/application/reverify"
                  label="Start a fresh review"
                  confirm="Pause your listing and reopen your application for credential changes?"
                  go="/tutor/application"
                />
              </div>
            </Card>
          </div>
        ) : (
          <Card className="stack">
            <p>
              An approved tutor application is required to edit this profile.
            </p>
            <Button asChild className="w-fit" variant="secondary">
              <Link href="/tutor/application">View application</Link>
            </Button>
          </Card>
        )}
      </>
    )
  }
  if (section === 'payments') {
    const orders = await paymentHistory(user.id)
    return (
      <>
        <PageHeading title="Payments">
          Onboarding orders, settlement status and receipt references.
        </PageHeading>
        <DataList
          items={orders}
          title="No onboarding orders yet."
          render={(order) => (
            <div className="stack">
              <div className="data-row">
                <h3>
                  {rupees(order.amount / 100)} · {order.mode}
                </h3>
                <Status value={order.state} />
              </div>
              <p className="muted">
                {timestamp(order.created_at)} · Order{' '}
                {order.gateway_order ?? order.id}
              </p>
              {order.gateway_payment && (
                <p>
                  Payment reference <strong>{order.gateway_payment}</strong>
                </p>
              )}
              {!!order.refunded_amount && (
                <p>Refunded {rupees(order.refunded_amount / 100)}</p>
              )}
            </div>
          )}
        />
      </>
    )
  }
  const phone = await maskedAccountPhone(user.id)
  return (
    <>
      <PageHeading title="Account settings" />
      <Card className="stack">
        <p>
          Verified mobile <strong>{phone ?? 'Unavailable'}</strong>
        </p>
        {!phone && (
          <p className="muted">
            Your application can be saved as a draft. Submission requires a
            verified mobile number.
          </p>
        )}
        <GoogleAccountSettings user={user} error={googleError} />
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
export default async function TutorSection({
  params,
  searchParams,
}: PageProps<'/tutor/[section]'>) {
  const [{ section }, query] = await Promise.all([params, searchParams])
  const selected = tutorSections.find((item) => item === section)
  if (!selected) notFound()
  const user = await pageActor('tutor', `/tutor/${section}`)
  return (
    <Workspace role="tutor" section={section}>
      <SectionContent
        user={user}
        section={selected}
        page={pagination.parse(query.page ?? 1)}
        googleError={query.google}
      />
    </Workspace>
  )
}
