import {
  cloneElement,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CircleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from './ui/button'
export { Button } from './ui/button'

export function Badge({
  children,
  tone = 'sage',
}: {
  children: ReactNode
  tone?: 'sage' | 'neutral' | 'warning' | 'danger'
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('card', className)} {...props} />
}
type FieldControl = ReactElement<{ id?: string; 'aria-describedby'?: string }>
export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string
  children: FieldControl
  hint?: string
  className?: string
}) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  const description = hint ? id + '-hint' : undefined
  return (
    <div className={cn('field', className)}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-describedby': description ?? children.props['aria-describedby'],
      })}
      {hint && <small id={description}>{hint}</small>}
    </div>
  )
}
export function Select({
  options,
  placeholder,
  ...props
}: ComponentProps<'select'> & {
  options: { id: string | number; name: string }[]
  placeholder?: string
}) {
  return (
    <select {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  )
}
export function Empty({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <Card className="empty">
      <div className="icon-tile">
        <CircleAlert size={21} />
      </div>
      <h2>{title}</h2>
      {children && <div className="muted">{children}</div>}
    </Card>
  )
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <div className="muted page-description">{children}</div>}
      </div>
      {action}
    </div>
  )
}
export function Pagination({
  page,
  hasNext,
  href,
}: {
  page: number
  hasNext: boolean
  href: (value: number) => string
}) {
  if (page === 1 && !hasNext) return null
  return (
    <nav aria-label="Pagination" className="pagination">
      {page > 1 && (
        <Button asChild variant="secondary">
          <Link href={href(page - 1)}>
            <ArrowLeft size={16} /> Previous
          </Link>
        </Button>
      )}
      <span>Page {page}</span>
      {hasNext && (
        <Button asChild variant="secondary">
          <Link href={href(page + 1)}>
            Next <ArrowRight size={16} />
          </Link>
        </Button>
      )}
    </nav>
  )
}
export function Status({ value }: { value: string }) {
  const tone = [
    'listed',
    'published',
    'active',
    'approved',
    'captured',
    'connected',
    'resolved',
  ].includes(value)
    ? 'sage'
    : ['rejected', 'cancelled', 'suspended', 'disabled'].includes(value)
      ? 'danger'
      : [
            'pending_review',
            'changes_required',
            'unpaid',
            'awaiting_parent_consent',
            'refunded',
          ].includes(value)
        ? 'warning'
        : 'neutral'
  return <Badge tone={tone}>{value.replaceAll('_', ' ')}</Badge>
}
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})
export const rupees = (amount: number) => inr.format(amount)
export const timestamp = (date: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(date))
export const classOptions = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `Class ${index + 1}`,
}))
