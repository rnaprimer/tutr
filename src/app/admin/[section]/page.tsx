import Link from 'next/link'
import { notFound } from 'next/navigation'
import { pageActor } from '@/lib/page-auth'
import {
  adminCatalog,
  adminDashboard,
  adminList,
  adminSections,
  pagination,
  type AdminSection,
  type ListSection,
} from '@/lib/admin'
import { currentFee } from '@/lib/payments'
import { ActionButton, ReasonForm, SimpleForm } from '@/components/actions'
import { SignOut, Stats, Workspace, sectionLabel } from '@/components/workspace'
import {
  Button,
  Card,
  Empty,
  Field,
  PageHeading,
  Pagination,
  Select,
  Status,
  rupees,
  timestamp,
} from '@/components/ui'

const columns: Record<ListSection, [string, string][]> = {
  applications: [
    ['tutor', 'Tutor'],
    ['status', 'Status'],
    ['revision', 'Revision'],
    ['updated_at', 'Updated'],
  ],
  tutors: [
    ['display_name', 'Tutor'],
    ['verification', 'Verification'],
    ['payment_status', 'Payment'],
    ['listing_status', 'Listing'],
    ['suspended', 'Suspended'],
  ],
  parents: [
    ['display_name', 'Guardian'],
    ['students', 'Students'],
    ['disabled', 'Disabled'],
    ['created_at', 'Joined'],
  ],
  requirements: [
    ['class', 'Class'],
    ['locality', 'Locality'],
    ['mode', 'Type'],
    ['status', 'Status'],
    ['details', 'Academic notes'],
  ],
  matches: [
    ['id', 'Match'],
    ['requirement_id', 'Requirement'],
    ['tutor_id', 'Tutor'],
    ['state', 'State'],
    ['kind', 'Type'],
  ],
  payments: [
    ['amount', 'Amount'],
    ['state', 'State'],
    ['mode', 'Mode'],
    ['gateway_order', 'Order'],
    ['gateway_payment', 'Payment'],
    ['refunded_amount', 'Refunded'],
  ],
  reports: [
    ['reason', 'Report'],
    ['match_id', 'Match'],
    ['resolution', 'Resolution'],
    ['created_at', 'Received'],
  ],
  audit: [
    ['action', 'Action'],
    ['actor_id', 'Actor'],
    ['entity_id', 'Entity'],
    ['detail', 'Detail'],
    ['created_at', 'Time'],
  ],
}
function cell(key: string, value: unknown) {
  if (value instanceof Date) return timestamp(value)
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (
    [
      'status',
      'verification',
      'listing_status',
      'payment_status',
      'state',
    ].includes(key)
  )
    return <Status value={String(value)} />
  if (key === 'amount' || key === 'refunded_amount')
    return rupees(Number(value) / 100)
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function TableAction({
  section,
  row,
}: {
  section: ListSection
  row: Record<string, unknown>
}) {
  const id = String(row.id)
  if (section === 'applications')
    return (
      <Button variant="secondary" asChild>
        <Link href={`/admin/applications/${id}`}>Review</Link>
      </Button>
    )
  if (section === 'tutors' || section === 'parents') {
    const inactive = section === 'tutors' ? row.suspended : row.disabled
    return (
      <ReasonForm
        endpoint={`/admin/${section}/${id}`}
        constants={{ enabled: !!inactive }}
        button={inactive ? 'Restore account' : 'Suspend account'}
        minimum={5}
      />
    )
  }
  if (
    section === 'requirements' &&
    ['published', 'paused', 'draft'].includes(String(row.status))
  )
    return (
      <ActionButton
        endpoint={`/requirements/${id}/state`}
        payload={{ action: 'close' }}
        label="Close"
        confirm="Close this requirement and expire pending matches?"
      />
    )
  if (section === 'payments' && row.mode !== 'sandbox' && row.gateway_order)
    return (
      <ActionButton
        endpoint={`/admin/payments/${id}/reconcile`}
        label="Reconcile"
        confirm="Fetch the authoritative order and payment status from Razorpay?"
      />
    )
  if (section === 'reports' && !row.resolution)
    return (
      <ReasonForm
        endpoint={`/admin/reports/${id}`}
        field="resolution"
        button="Resolve report"
        minimum={5}
      />
    )
  return null
}
async function CatalogEditor() {
  const catalogs = await adminCatalog()
  const cities = catalogs.find((value) => value.key === 'cities')?.items ?? []
  return (
    <div className="stack">
      {catalogs.map(({ key, items }) => (
        <Card key={key} className="stack">
          <h2 className="capitalize">{key}</h2>
          <details>
            <summary className="cursor-pointer">Add entry</summary>
            <div className="mt-2">
              <SimpleForm
                endpoint={`/admin/catalog/${key}`}
                button="Add entry"
                constants={{ enabled: true }}
                reset
              >
                <Field label="Name">
                  <input name="name" required minLength={2} maxLength={80} />
                </Field>
                {key === 'localities' && (
                  <Field label="City">
                    <Select
                      name="city"
                      required
                      options={cities}
                      placeholder="Choose city"
                    />
                  </Field>
                )}
              </SimpleForm>
            </div>
          </details>
          {items.map((item) => (
            <details key={item.id} className="border-t border-[#e2e6df] pt-2">
              <summary className="cursor-pointer">
                {item.name} · {item.enabled ? 'Enabled' : 'Disabled'}
              </summary>
              <div className="mt-2">
                <SimpleForm
                  endpoint={`/admin/catalog/${key}/${item.id}`}
                  button="Save entry"
                  checkboxFields={['enabled']}
                >
                  <Field label="Name">
                    <input
                      name="name"
                      defaultValue={item.name}
                      required
                      minLength={2}
                      maxLength={80}
                    />
                  </Field>
                  {key === 'localities' && (
                    <Field label="City">
                      <Select
                        name="city"
                        required
                        defaultValue={item.city_id}
                        options={cities}
                      />
                    </Field>
                  )}
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={item.enabled}
                    />
                    Enabled
                  </label>
                </SimpleForm>
              </div>
            </details>
          ))}
        </Card>
      ))}
    </div>
  )
}
async function AdminContent({
  section,
  page,
}: {
  section: AdminSection
  page: number
}) {
  if (section === 'dashboard') {
    const stats = await adminDashboard()
    return (
      <>
        <PageHeading eyebrow="Operations" title="Admin overview">
          Review verification, marketplace activity and issues requiring
          attention.
        </PageHeading>
        <Stats
          items={[
            {
              label: 'Applications awaiting review',
              value: stats?.pending ?? 0,
            },
            { label: 'Listed tutors', value: stats?.listed ?? 0 },
            { label: 'Published requirements', value: stats?.published ?? 0 },
            { label: 'Open reports', value: stats?.reports ?? 0 },
          ]}
        />
        <div className="row mt-4">
          <Button asChild>
            <Link href="/admin/applications">Review applications</Link>
          </Button>
          <SignOut />
        </div>
      </>
    )
  }
  if (section === 'fees') {
    const fee = await currentFee()
    return (
      <>
        <PageHeading title="Onboarding fee">
          Set the one-time checkout amount. Existing orders keep their original
          amount.
        </PageHeading>
        <Card className="stack">
          <p>
            {fee
              ? `Current fee ${rupees(fee.amount / 100)}`
              : 'No onboarding fee has been configured.'}
          </p>
          <SimpleForm
            endpoint="/admin/fees"
            button="Set active onboarding fee"
            numberFields={['amount']}
          >
            <Field label="Amount in paise" hint="100 paise equals ₹1.">
              <input
                type="number"
                name="amount"
                required
                min="100"
                max="100000000"
                defaultValue={fee?.amount}
              />
            </Field>
          </SimpleForm>
        </Card>
      </>
    )
  }
  if (section === 'catalog')
    return (
      <>
        <PageHeading title="Catalogs">
          Manage academic subjects, boards, cities and localities.
        </PageHeading>
        <CatalogEditor />
      </>
    )
  const result = await adminList(section, page)
  const cols = columns[section]
  const hasActions = [
    'applications',
    'tutors',
    'parents',
    'requirements',
    'payments',
    'reports',
  ].includes(section)
  return (
    <>
      <PageHeading
        title={
          section === 'applications'
            ? 'Application review'
            : sectionLabel(section)
        }
      />
      {result.items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {cols.map(([key, label]) => (
                  <th key={key} scope="col">
                    {label}
                  </th>
                ))}
                {hasActions && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {result.items.map((row) => (
                <tr key={String(row.id)}>
                  {cols.map(([key]) => (
                    <td key={key}>{cell(key, row[key])}</td>
                  ))}
                  {hasActions && (
                    <td>
                      <TableAction section={section} row={row} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No records on this page." />
      )}
      <Pagination
        page={result.page}
        hasNext={result.hasNext}
        href={(value) => `/admin/${section}?page=${value}`}
      />
    </>
  )
}
export default async function AdminPage({
  params,
  searchParams,
}: PageProps<'/admin/[section]'>) {
  const [{ section }, query] = await Promise.all([params, searchParams])
  const selected = adminSections.find((item) => item === section)
  if (!selected) notFound()
  await pageActor('admin', `/admin/${section}`)
  return (
    <Workspace role="admin" section={section}>
      <AdminContent
        section={selected}
        page={pagination.parse(query.page ?? 1)}
      />
    </Workspace>
  )
}
