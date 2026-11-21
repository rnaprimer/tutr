import { Fault } from '@/lib/core'
import Link from 'next/link'
import type { Actor } from '@/lib/auth'
import { consentPreview, consentText, type MatchView } from '@/lib/marketplace'
import { ActionButton, ReasonForm, RevealContact, SimpleForm } from './actions'
import { days, places } from '@/lib/core'
import { Badge, Card, Empty, Status, rupees } from './ui'

function MatchAction({
  id,
  action,
  label,
  confirm,
}: {
  id: string
  action: string
  label: string
  confirm?: string
}) {
  return (
    <ActionButton
      endpoint={`/matches/${id}/state`}
      payload={{ action }}
      label={label}
      confirm={confirm}
    />
  )
}
async function Consent({
  match,
  parent,
}: {
  match: MatchView
  parent: string
}) {
  const preview = await consentPreview(parent, match.id).catch(
    (error: unknown) => {
      if (
        error instanceof Fault &&
        error.code === 'PHONE_VERIFICATION_REQUIRED'
      )
        return undefined
      throw error
    },
  )
  if (!preview)
    return (
      <p className="alert">
        Contact sharing requires a verified mobile number. SMS verification is
        currently paused.
      </p>
    )
  return (
    <div className="mt-3 stack">
      <p className="muted">
        Share {preview.masked} with <strong>{match.tutor_name}</strong> ·{' '}
        {match.verified ? 'Documents verified' : 'Verification unavailable'}
      </p>
      <SimpleForm
        endpoint={`/matches/${match.id}/consent`}
        button="Confirm and share number"
        constants={{ proof: preview.proof, version: preview.version }}
        checkboxFields={['agreed']}
      >
        <label className="checkbox-line">
          <input type="checkbox" name="agreed" required />
          {consentText}
        </label>
      </SimpleForm>
    </div>
  )
}
export function MatchList({
  actor,
  matches,
}: {
  actor: Actor
  matches: MatchView[]
}) {
  if (!matches.length) return <Empty title="No matches to show yet." />
  return (
    <div className="data-list">
      {matches.map((match) => {
        const parent = actor.role === 'parent'
        const full = match.disclosures >= 3
        const canProceed =
          match.active &&
          match.requirement_status === 'published' &&
          !full &&
          !match.revoked
        const pending = [
          'pending_tutor',
          'pending_parent',
          'awaiting_parent_consent',
        ].includes(match.state)
        return (
          <Card key={match.id} className="stack">
            <div className="data-row">
              <div>
                <h3>
                  {parent ? (
                    match.active ? (
                      <Link
                        className="underline"
                        href={`/tutors/${match.slug}`}
                      >
                        {match.tutor_name}
                      </Link>
                    ) : (
                      (match.tutor_name ?? 'Tutor')
                    )
                  ) : (
                    `Class ${match.class} · ${match.board}`
                  )}
                </h3>
                <p>
                  {parent ? (
                    <Link
                      href={`/parent/requirements/${match.requirement_id}`}
                      className="underline"
                    >
                      Class {match.class} · {match.locality}
                    </Link>
                  ) : (
                    match.locality
                  )}{' '}
                  ·{' '}
                  {match.kind === 'direct'
                    ? 'Direct request'
                    : 'Open opportunity'}
                </p>
              </div>
              <div className="row">
                <Status value={match.state} />
                {match.revoked && (
                  <Badge tone="warning">Access blocked or revoked</Badge>
                )}
              </div>
            </div>
            {!parent && (
              <p className="muted">
                {match.subjects.join(', ')} · {places[match.teaching_place]} ·{' '}
                {rupees(match.budget)}/{match.unit}
                <br />
                {match.days.map((day) => days[day - 1]).join(', ')} ·{' '}
                {match.schedule}
              </p>
            )}
            {full && pending && parent && (
              <p className="alert" role="status">
                This requirement has shared its three contacts. You can still
                close pending matches.
              </p>
            )}
            {parent &&
              canProceed &&
              match.state === 'awaiting_parent_consent' && (
                <Consent match={match} parent={actor.id} />
              )}
            {parent && match.state === 'connected' && (
              <p className="muted">
                Your verified number was shared. You can revoke future access.
                The tutor may have already saved it.
              </p>
            )}
            {!parent &&
              match.state === 'connected' &&
              !match.revoked &&
              match.active && <RevealContact id={match.id} />}
            {pending || match.state === 'connected' ? (
              <div className="row">
                {!parent && canProceed && match.state === 'pending_tutor' && (
                  <MatchAction
                    id={match.id}
                    action="accept"
                    label="Accept request"
                  />
                )}
                {parent && canProceed && match.state === 'pending_parent' && (
                  <MatchAction
                    id={match.id}
                    action="choose"
                    label="Choose tutor"
                  />
                )}
                {((!parent && match.state === 'pending_tutor') ||
                  (parent &&
                    ['pending_parent', 'awaiting_parent_consent'].includes(
                      match.state,
                    ))) && (
                  <MatchAction
                    id={match.id}
                    action="decline"
                    label="Decline"
                    confirm="End this match without sharing contact details?"
                  />
                )}
                <MatchAction
                  id={match.id}
                  action="cancel"
                  label={
                    match.state === 'connected'
                      ? parent
                        ? 'Revoke access'
                        : 'End connection'
                      : 'Cancel match'
                  }
                  confirm={
                    match.state === 'connected'
                      ? 'End the connection and remove future access to the number in the platform? This disclosure still counts toward the limit.'
                      : 'Cancel this match?'
                  }
                />
              </div>
            ) : null}
            <div className="row">
              <ReasonForm
                endpoint={`/matches/${match.id}/report`}
                button="Report a concern"
              />
              {parent && !match.revoked && (
                <MatchAction
                  id={match.id}
                  action="block"
                  label="Block tutor"
                  confirm="Block new matches and remove this tutor’s access to your contact across all requirements?"
                />
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
