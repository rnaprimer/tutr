import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Actor } from '@/lib/auth'
import { adminSections, recentNotices } from '@/lib/admin'
import { messages } from '@/lib/events'
import { ActionButton } from './actions'
import { Card, Empty, timestamp } from './ui'

export const parentSections = [
  'dashboard',
  'students',
  'requirements',
  'requests',
  'connections',
  'saved-tutors',
  'settings',
] as const
export const tutorSections = [
  'dashboard',
  'application',
  'activate',
  'opportunities',
  'requests',
  'applications',
  'connections',
  'profile',
  'payments',
  'settings',
] as const
const links = {
  parent: parentSections,
  tutor: tutorSections,
  admin: adminSections,
}
const labels: Record<string, string> = {
  dashboard: 'Overview',
  students: 'Students',
  requirements: 'Requirements',
  requests: 'Direct requests',
  connections: 'Connections',
  'saved-tutors': 'Saved tutors',
  settings: 'Settings',
  application: 'Verification application',
  activate: 'Activate profile',
  opportunities: 'Opportunities',
  applications: 'Applications',
  profile: 'Teaching profile',
  payments: 'Payments',
  tutors: 'Tutors',
  parents: 'Guardians',
  matches: 'Matches',
  reports: 'Reports',
  catalog: 'Catalogs',
  fees: 'Onboarding fee',
  audit: 'Audit log',
}
export const sectionLabel = (section: string) => labels[section] ?? section
export function Workspace({
  role,
  section,
  children,
}: {
  role: Actor['role']
  section: string
  children: ReactNode
}) {
  return (
    <div className="container page workspace">
      <nav className="workspace-nav" aria-label={role + ' workspace'}>
        <span className="eyebrow">
          {role === 'parent' ? 'Guardian' : role} workspace
        </span>
        {links[role].map((item) => (
          <Link
            key={item}
            aria-current={section === item ? 'page' : undefined}
            href={`/${role}/${item}`}
          >
            {role === 'admin' && item === 'applications'
              ? 'Application review'
              : sectionLabel(item)}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  )
}
export function Stats({
  items,
}: {
  items: { label: string; value: ReactNode }[]
}) {
  return (
    <div className="stat-grid">
      {items.map(({ label, value }) => (
        <Card className="stat" key={label}>
          <div className="value">{value}</div>
          <div className="label">{label}</div>
        </Card>
      ))}
    </div>
  )
}
export async function Notices({ user }: { user: string }) {
  const notes = await recentNotices(user)
  return (
    <Card className="mt-4">
      <h2>Notifications</h2>
      {notes.length ? (
        <ul className="stack">
          {notes.map((note) => (
            <li
              className="data-row py-2 border-b border-[#e2e6df]"
              key={note.id}
            >
              <div>
                <strong>{messages[note.kind]}</strong>
                <p>{timestamp(note.created_at)}</p>
              </div>
              {!note.read_at && (
                <ActionButton
                  endpoint="/notifications/read"
                  payload={{ id: note.id }}
                  label="Mark read"
                  variant="quiet"
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">You’re caught up.</p>
      )}
    </Card>
  )
}
export function SignOut() {
  return (
    <ActionButton
      endpoint="/auth/logout"
      label="Sign out"
      confirm="Sign out of this session?"
      go="/"
    />
  )
}
export function DataList<T extends { id: string }>({
  items,
  title,
  render,
}: {
  items: T[]
  title: string
  render: (item: T) => ReactNode
}) {
  if (!items.length) return <Empty title={title} />
  return (
    <div className="data-list">
      {items.map((item) => (
        <Card key={item.id}>{render(item)}</Card>
      ))}
    </div>
  )
}
