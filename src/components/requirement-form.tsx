'use client'
import { useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { scheduleOptions } from '@/lib/scheduling'
import type { Option } from '@/lib/catalog'
import { Button, Field, Select, classOptions } from './ui'
import { Message, request } from './actions'
import { weekdays, teachingPlaces, units } from './selections'

type Values = {
  student: string
  class: string | number
  board: string
  locality: string
  subjects: string[]
  budget: string | number
  unit: string
  days: string[]
  schedule: string
  place: string
  details: string
  mode: 'open' | 'direct'
  target?: string
}
type Student = { id: string; label: string; class: number; board_id: string }
export function RequirementForm({
  students,
  options,
  initial,
  id,
  target,
}: {
  students: Student[]
  options: { subjects: Option[]; boards: Option[]; localities: Option[] }
  initial?: Partial<Values>
  id?: string
  target?: { id: string; name: string }
}) {
  const defaults: Values = {
    student: '',
    class: '',
    board: '',
    locality: '',
    subjects: [],
    budget: '',
    unit: 'month',
    days: [],
    schedule: '',
    place: 'student_home',
    details: '',
    mode: target ? 'direct' : 'open',
    ...initial,
    target: target?.id ?? initial?.target,
  }
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<Values>({ defaultValues: defaults })
  const [error, setError] = useState('')
  const router = useRouter()
  async function save(values: Values) {
    setError('')
    try {
      const { id: record } = await request<{ id: string }>(
        '/requirements' + (id ? '/' + id : ''),
        values,
      )
      router.push(`/parent/requirements/${record}`)
      router.refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The draft could not be saved.',
      )
    }
  }
  const student = register('student', { required: true })
  return (
    <form className="stack" onSubmit={handleSubmit(save)}>
      <fieldset disabled={isSubmitting} className="form-grid">
        <Field label="Student profile">
          <Select
            {...student}
            required
            options={students.map((s) => ({ id: s.id, name: s.label }))}
            placeholder="Choose a student"
            onChange={(event) => {
              void student.onChange(event)
              const selected = students.find((s) => s.id === event.target.value)
              if (selected) {
                setValue('class', selected.class)
                setValue('board', selected.board_id)
              }
            }}
          />
        </Field>
        {target ? (
          <Field label="Requested tutor">
            <input value={target.name} readOnly />
          </Field>
        ) : (
          <Field label="Requirement type">
            <Select
              {...register('mode')}
              options={[
                { id: 'open', name: 'Open opportunity' },
                { id: 'direct', name: 'Direct requests only' },
              ]}
            />
          </Field>
        )}
        <Field label="Class">
          <Select
            {...register('class')}
            required
            options={classOptions}
            placeholder="Choose class"
          />
        </Field>
        <Field label="Board">
          <Select
            {...register('board')}
            required
            options={options.boards}
            placeholder="Choose board"
          />
        </Field>
        <Field label="Locality">
          <Select
            {...register('locality')}
            required
            options={options.localities}
            placeholder="Choose locality"
          />
        </Field>
        <Field label="Teaching location">
          <Select {...register('place')} required options={teachingPlaces} />
        </Field>
        <Checklist
          className="span-all"
          title="Subjects"
          options={options.subjects}
          field={register('subjects')}
        />
        <Field label="Budget (INR)">
          <input
            type="number"
            min="1"
            max="1000000"
            {...register('budget')}
            required
          />
        </Field>
        <Field label="Fee unit">
          <Select {...register('unit')} options={units} />
        </Field>
        <Checklist
          className="span-all"
          title="Preferred days"
          options={weekdays}
          field={register('days')}
        />
        <Field label="Preferred schedule" className="span-all">
          <Select
            {...register('schedule')}
            options={scheduleOptions.map((name) => ({ id: name, name }))}
            placeholder="Choose a time window"
            required
          />
        </Field>
        <Field
          label="Academic needs"
          className="span-all"
          hint="Private to you and authorized reviewers. Leave out names, schools and addresses."
        >
          <textarea {...register('details')} maxLength={1000} />
        </Field>
        <Button type="submit" className="w-fit">
          {isSubmitting ? 'Saving…' : 'Save draft'}
        </Button>
      </fieldset>
      <Message message={error} />
    </form>
  )
}
export function Checklist({
  title,
  options,
  field,
  className,
}: {
  title: string
  options: { id: string | number; name: string }[]
  field: UseFormRegisterReturn
  className?: string
}) {
  return (
    <fieldset className={className}>
      <legend>{title}</legend>
      <div className="check-grid">
        {options.map((option) => (
          <label key={option.id}>
            <input type="checkbox" value={String(option.id)} {...field} />
            {option.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
export function DirectRequestForm({
  tutor,
  requirements,
}: {
  tutor: string
  requirements: Option[]
}) {
  const router = useRouter()
  const [requirement, setRequirement] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        setMessage('')
        try {
          await request(`/requirements/${requirement}/direct`, { tutor })
          router.push('/parent/requirements/' + requirement)
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Try again.')
        } finally {
          setPending(false)
        }
      }}
    >
      <Field label="Use a published requirement">
        <Select
          options={requirements}
          placeholder="Choose a requirement"
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          required
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Sending…' : 'Send direct request'}
      </Button>
      <Message message={message} />
    </form>
  )
}
