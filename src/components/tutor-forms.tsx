'use client'
import { useEffect, useRef, useState } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import type { Option } from '@/lib/catalog'
import type { DocumentKind } from '@/lib/storage'
import { Badge, Button, Card, Field, Select, classOptions } from './ui'
import { Message, request } from './actions'
import { Checklist } from './requirement-form'
import { weekdays, teachingPlaces, units } from './selections'

export type TutorFields = {
  legalName: string
  displayName: string
  locality: string
  intro: string
  subjects: string[]
  classes: string[]
  boards: string[]
  areas: string[]
  days: string[]
  teachingPlace: string
  fee: number | string
  feeUnit: string
  qualification: string
  institution: string
  credentials: string
  experience: number | string
  additional: string
  declaration: boolean
}
type Catalogs = { subjects: Option[]; boards: Option[]; localities: Option[] }
const initialValues: TutorFields = {
  legalName: '',
  displayName: '',
  locality: '',
  intro: '',
  subjects: [],
  classes: [],
  boards: [],
  areas: [],
  days: [],
  teachingPlace: 'student_home',
  fee: '',
  feeUnit: 'month',
  qualification: '',
  institution: '',
  credentials: '',
  experience: '',
  additional: '',
  declaration: false,
}
const steps = [
  'Personal details',
  'Teaching preferences',
  'Education',
  'Verification documents',
  'Review',
]
const docs: Record<DocumentKind, string> = {
  photo: 'Profile photo',
  identity: 'Government identity document',
  academic: 'Academic certificate',
}
function TeachingFields({
  register,
  options,
}: {
  register: UseFormRegister<TutorFields>
  options: Catalogs
}) {
  return (
    <div className="form-grid">
      <Checklist
        title="Subjects"
        options={options.subjects}
        field={register('subjects')}
        className="span-all"
      />
      <Checklist
        title="Classes"
        options={classOptions}
        field={register('classes')}
        className="span-all"
      />
      <Checklist
        title="Academic boards"
        options={options.boards}
        field={register('boards')}
        className="span-all"
      />
      <Checklist
        title="Service localities"
        options={options.localities}
        field={register('areas')}
        className="span-all"
      />
      <Checklist
        title="Available days"
        options={weekdays}
        field={register('days')}
        className="span-all"
      />
      <Field label="Teaching location">
        <Select {...register('teachingPlace')} options={teachingPlaces} />
      </Field>
      <Field label="Expected fee (INR)">
        <input type="number" min="1" max="1000000" {...register('fee')} />
      </Field>
      <Field label="Fee unit">
        <Select {...register('feeUnit')} options={units} />
      </Field>
    </div>
  )
}
function Upload({
  kind,
  uploaded,
  onSuccess,
}: {
  kind: DocumentKind
  uploaded: boolean
  onSuccess: () => void
}) {
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  return (
    <div className="upload">
      <Field
        label={docs[kind]}
        hint={
          kind === 'photo'
            ? 'JPG or PNG, up to 8 MB. Visible once your profile is listed.'
            : 'JPG, PNG or PDF, up to 8 MB. Accessible to authorized reviewers.'
        }
      >
        <input
          type="file"
          aria-label={docs[kind]}
          accept={
            kind === 'photo'
              ? 'image/jpeg,image/png'
              : 'image/jpeg,image/png,application/pdf'
          }
          disabled={pending}
          onChange={async (event) => {
            const input = event.currentTarget
            const file = input.files?.item(0)
            if (!file) return
            setPending(true)
            setStatus('')
            try {
              const data = new FormData()
              data.append('kind', kind)
              data.append('file', file)
              await request('/tutor/application/document', data)
              onSuccess()
            } catch (error) {
              setStatus(
                error instanceof Error ? error.message : 'Upload failed.',
              )
            } finally {
              setPending(false)
              input.value = ''
            }
          }}
        />
      </Field>
      <div role="status">
        <Badge tone={uploaded ? 'sage' : 'neutral'}>
          {pending ? 'Uploading…' : uploaded ? 'Uploaded' : 'File needed'}
        </Badge>
      </div>
      <Message message={status} />
    </div>
  )
}
function normalize(values: TutorFields): TutorFields {
  return {
    ...values,
    subjects: Array.isArray(values.subjects)
      ? values.subjects
      : values.subjects
        ? [values.subjects]
        : [],
    classes: (Array.isArray(values.classes)
      ? values.classes
      : values.classes
        ? [values.classes]
        : []
    ).map(String),
    boards: Array.isArray(values.boards)
      ? values.boards
      : values.boards
        ? [values.boards]
        : [],
    areas: Array.isArray(values.areas)
      ? values.areas
      : values.areas
        ? [values.areas]
        : [],
    days: (Array.isArray(values.days)
      ? values.days
      : values.days
        ? [values.days]
        : []
    ).map(String),
  }
}
export function ApplicationWizard({
  initial,
  options,
  uploaded,
  masked,
}: {
  initial: Partial<TutorFields>
  options: Catalogs
  uploaded: DocumentKind[]
  masked: string
}) {
  const router = useRouter()
  const { register, getValues, subscribe, handleSubmit } = useForm<TutorFields>(
    { defaultValues: normalize({ ...initialValues, ...initial }) },
  )
  const [step, setStep] = useState(0)
  const [stored, setStored] = useState(uploaded)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef(Promise.resolve())
  useEffect(() => {
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: () => {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          const values = normalize(getValues())
          setStatus('Saving draft…')
          chain.current = chain.current.then(async () => {
            try {
              await request('/tutor/application/draft', values)
              setStatus('Draft saved')
            } catch {
              setStatus(
                'Draft could not be saved. Check your entries and connection.',
              )
            }
          })
        }, 550)
      },
    })
    return () => {
      unsubscribe()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [subscribe, getValues])
  function upload(kind: DocumentKind) {
    return (
      <Upload
        kind={kind}
        uploaded={stored.includes(kind)}
        onSuccess={() =>
          setStored((current) => [...new Set([...current, kind])])
        }
      />
    )
  }
  async function submit(values: TutorFields) {
    if (step !== steps.length - 1) return
    if (timer.current) clearTimeout(timer.current)
    setPending(true)
    setError('')
    try {
      await chain.current
      await request('/tutor/application/submit', normalize(values))
      router.refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Application could not be submitted.',
      )
    } finally {
      setPending(false)
    }
  }
  const record = getValues()
  return (
    <>
      <nav aria-label="Application progress" className="wizard-nav">
        {steps.map((label, index) => (
          <Button
            key={label}
            type="button"
            variant={step === index ? 'primary' : 'secondary'}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => {
              setStep(index)
              setError('')
            }}
          >
            {index + 1}. {label}
          </Button>
        ))}
      </nav>
      <Card>
        <form
          onSubmit={(event) => {
            void handleSubmit(submit)(event)
          }}
          className="stack"
        >
          <fieldset disabled={pending} className="stack">
            <h2>{steps[step]}</h2>
            {step === 0 && (
              <div className="form-grid">
                <Field label="Full legal name">
                  <input {...register('legalName')} maxLength={120} />
                </Field>
                <Field label="Public display name">
                  <input {...register('displayName')} maxLength={70} />
                </Field>
                <Field label="Verified mobile number">
                  <input readOnly value={masked || 'Unavailable'} />
                </Field>
                <Field label="Home locality">
                  <Select
                    {...register('locality')}
                    options={options.localities}
                    placeholder="Choose locality"
                  />
                </Field>
                <Field
                  label="Short introduction"
                  className="span-all"
                  hint="Leave out your phone number, email and exact address."
                >
                  <textarea {...register('intro')} maxLength={1000} />
                </Field>
                <div className="span-all">{upload('photo')}</div>
              </div>
            )}
            {step === 1 && (
              <TeachingFields register={register} options={options} />
            )}
            {step === 2 && (
              <div className="form-grid">
                <Field label="Highest qualification">
                  <input {...register('qualification')} maxLength={120} />
                </Field>
                <Field label="Institution">
                  <input {...register('institution')} maxLength={150} />
                </Field>
                <Field label="Teaching experience in years">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    {...register('experience')}
                  />
                </Field>
                <Field label="Academic credentials" className="span-all">
                  <textarea {...register('credentials')} maxLength={1000} />
                </Field>
                <Field
                  label="Additional qualifications (optional)"
                  className="span-all"
                >
                  <textarea {...register('additional')} maxLength={500} />
                </Field>
              </div>
            )}
            {step === 3 && (
              <div>
                {upload('identity')}
                {upload('academic')}
              </div>
            )}
            {step === 4 && (
              <>
                <dl className="form-grid">
                  <div>
                    <dt>Legal name</dt>
                    <dd className="muted">{record.legalName || 'Needed'}</dd>
                  </div>
                  <div>
                    <dt>Public name</dt>
                    <dd className="muted">{record.displayName || 'Needed'}</dd>
                  </div>
                  <div>
                    <dt>Qualification</dt>
                    <dd className="muted">
                      {record.qualification || 'Needed'}
                    </dd>
                  </div>
                  <div>
                    <dt>Institution</dt>
                    <dd className="muted">{record.institution || 'Needed'}</dd>
                  </div>
                  <div>
                    <dt>Teaching areas</dt>
                    <dd className="muted">
                      {options.localities
                        .filter((item) => record.areas.includes(item.id))
                        .map((item) => item.name)
                        .join(', ') || 'Needed'}
                    </dd>
                  </div>
                  <div>
                    <dt>Uploads</dt>
                    <dd className="muted">{stored.length} of 3 uploaded</dd>
                  </div>
                </dl>
                {!masked && (
                  <p className="muted">
                    Submission requires a verified mobile number. You can save
                    the draft while SMS verification is paused.
                  </p>
                )}
                <label className="checkbox-line">
                  <input type="checkbox" {...register('declaration')} />I
                  confirm that my details are accurate and I authorize review of
                  the documents for tutor verification.
                </label>
              </>
            )}
            <div className="row">
              {step > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button
                  key="continue"
                  type="button"
                  onClick={() => setStep(step + 1)}
                >
                  Continue
                </Button>
              ) : (
                <Button key="submit" type="submit" disabled={!masked}>
                  {pending ? 'Submitting…' : 'Submit application'}
                </Button>
              )}
              <span role="status" className="muted">
                {status}
              </span>
            </div>
          </fieldset>
          <Message message={error} />
        </form>
      </Card>
    </>
  )
}
export function ProfileEditor({
  initial,
  options,
}: {
  initial: Partial<TutorFields>
  options: Catalogs
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TutorFields>({
    defaultValues: normalize({ ...initialValues, ...initial }),
  })
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState(false)
  const router = useRouter()
  return (
    <form
      className="stack"
      onSubmit={handleSubmit(async (values) => {
        setMessage('')
        setOk(false)
        try {
          await request('/tutor/profile', normalize(values))
          setMessage('Profile updated.')
          setOk(true)
          router.refresh()
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Profile could not be updated.',
          )
        }
      })}
    >
      <fieldset className="stack" disabled={isSubmitting}>
        <div className="form-grid">
          <Field label="Public display name">
            <input {...register('displayName')} required maxLength={70} />
          </Field>
          <Field label="Home locality">
            <Select
              {...register('locality')}
              options={options.localities}
              placeholder="Choose locality"
              required
            />
          </Field>
          <Field label="Short introduction" className="span-all">
            <textarea {...register('intro')} required maxLength={1000} />
          </Field>
        </div>
        <TeachingFields register={register} options={options} />
        <Button type="submit" className="w-fit">
          {isSubmitting ? 'Saving…' : 'Save teaching details'}
        </Button>
      </fieldset>
      <Message message={message} success={ok} />
    </form>
  )
}
