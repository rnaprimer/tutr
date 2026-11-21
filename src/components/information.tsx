import Link from 'next/link'
import { brand } from '@/lib/brand'
import { Button, PageHeading } from './ui'

type Section = { title: string; text: string }
export const information: Record<
  string,
  {
    title: string
    intro: string
    sections: Section[]
    action?: { label: string; href: string }
  }
> = {
  'how-it-works': {
    title: 'How it works',
    intro: `Find offline tutoring for Classes 1–12 in ${brand.city}.`,
    sections: [
      {
        title: 'Search or post a requirement',
        text: 'Browse tutor profiles by subject, board, locality and teaching location. Sign in to request a tutor or publish an open requirement.',
      },
      {
        title: 'Agree to connect',
        text: 'A tutor can accept a direct request or express interest in an open requirement. The guardian then decides whether to share their verified phone number.',
      },
      {
        title: 'Arrange a lesson',
        text: 'You can share your number with up to three tutors per requirement. Discuss schedules, the teaching location and lesson fees directly.',
      },
    ],
    action: { label: 'Find a tutor', href: '/tutors' },
  },
  'become-a-tutor': {
    title: `Teach in ${brand.city}`,
    intro: 'Build a profile and meet families looking for in-person tutoring.',
    sections: [
      {
        title: 'Complete your application',
        text: 'Share your teaching preferences, academic qualifications and verification documents through the private application wizard.',
      },
      {
        title: 'Wait for a decision',
        text: 'An administrator reviews your documents and may ask you to correct or replace information.',
      },
      {
        title: 'Activate your profile',
        text: 'Once approved, pay the one-time onboarding fee shown on your activation page. V1 has no subscription or per-contact fee.',
      },
    ],
    action: {
      label: 'Start tutor application',
      href: '/login?role=tutor&next=%2Ftutor%2Fapplication',
    },
  },
  support: {
    title: 'Help centre',
    intro:
      'Get help with tutoring requests, verification, payments and your account.',
    sections: [
      {
        title: 'Report a concern',
        text: 'Open the relevant match in your workspace and select Report a concern. Guardians can also block a tutor or revoke future access to a disclosed number.',
      },
      {
        title: 'Get help with an application or payment',
        text: 'Keep your application or order reference handy. Use the support contact below when it is available.',
      },
    ],
  },
  privacy: {
    title: 'Privacy',
    intro:
      'How the service handles account, tutoring and verification information.',
    sections: [
      {
        title: 'Account and student information',
        text: 'For Google sign-in, we store a Google account identifier. Phone verification is separate, and student profiles remain under guardian control. Use an academic label and avoid entering full names, school addresses or other identifying information about children.',
      },
      {
        title: 'Verification and contact sharing',
        text: 'Authorized reviewers can access private tutor verification documents. Guardians choose when their verified phone is shared with a specific tutor. Access can be revoked in the platform. A tutor may have already seen or retained the number.',
      },
      {
        title: 'Retention and requests',
        text: 'Requests for access, correction and deletion can be made through support when available. Transaction and consent records may need to be retained to handle disputes and applicable obligations.',
      },
    ],
  },
  terms: {
    title: 'Terms of use',
    intro: 'Account responsibilities and expectations for in-person tutoring.',
    sections: [
      {
        title: 'Use the service responsibly',
        text: 'Use accurate information, keep sign-in codes private, and separate child and household information from public requirement text. Guardians control all student profiles.',
      },
      {
        title: 'Arrange tutoring directly',
        text: 'Tutors and guardians agree on lesson rates, times and location. Document review verifies submitted records as part of onboarding. Families should assess whether a tutor is suitable for their child.',
      },
      {
        title: 'Account restrictions',
        text: 'Reports may lead to a review, removal of content or suspension. Use workspace reporting controls when a connection causes concern.',
      },
    ],
  },
  'onboarding-policy': {
    title: 'Onboarding & refunds',
    intro:
      'The one-time tutor onboarding payment becomes available after approval.',
    sections: [
      {
        title: 'Onboarding fee',
        text: 'The checkout page shows the configured amount in INR before payment. Your payment history shows gateway references and settlement status.',
      },
      {
        title: 'Refund review',
        text: 'Contact support with your order reference for a duplicate charge, payment issue or refund request. A refund can affect listing eligibility. Refund eligibility and timelines will be finalized before live checkout opens.',
      },
    ],
  },
  'data-rights': {
    title: 'Account & data rights',
    intro: 'Manage your account information and make privacy requests.',
    sections: [
      {
        title: 'Update or archive account information',
        text: 'Guardians can edit their display name and manage student academic profiles. Tutors can update teaching details or request a fresh review for changes to verified credentials.',
      },
      {
        title: 'Request access, correction or deletion',
        text: 'Use the support contact when available. We verify the requester’s identity and review retention obligations before fulfilling account or data requests.',
      },
    ],
  },
}
export function Information({ slug }: { slug: string }) {
  const page = information[slug]
  return (
    <article className="container page">
      <div className="prose">
        <PageHeading title={page.title}>{page.intro}</PageHeading>
        {page.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.text}</p>
          </section>
        ))}
        {page.action && (
          <Button asChild>
            <Link href={page.action.href}>{page.action.label}</Link>
          </Button>
        )}
        {['support', 'data-rights', 'privacy'].includes(slug) &&
          (brand.supportEmail ? (
            <p>
              <a href={'mailto:' + brand.supportEmail}>{brand.supportEmail}</a>
            </p>
          ) : (
            <p>
              Support email is currently unavailable. If you have a match, you
              can report an issue from your workspace.
            </p>
          ))}
      </div>
    </article>
  )
}
