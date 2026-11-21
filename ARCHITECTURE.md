# Balasore Tutors architecture

The supplied workspace was empty. This project initializes a Next.js App Router modular monolith with strict TypeScript, PostgreSQL through Drizzle, and Tailwind. The shared shadcn/ui Button and Radix dialogs use the same design tokens. Branding is configured in one module. Server-rendered reads and versioned API writes share the same authorization and domain functions.

| Milestone | Planned deliverable |
| --- | --- |
| 1 | Database, OTP sessions, roles, admin MFA, shared UI |
| 2 | Versioned tutor applications, private storage, review console |
| 3 | Configurable Razorpay checkout and public listing gates |
| 4 | Directory filters, students, saves and tuition requirements |
| 5 | Direct and open matching, consent and protected disclosure |
| 6 | Operational dashboards, notifications, reports and verification |

Catalog tables model cities, localities, boards and subjects. User roles and encrypted verified phone data are separate from parent and tutor profiles. Application revisions, documents and decisions preserve verification history. Offerings, service areas and availability support indexed discovery. Payment plans, orders and events are separate from tutor verification and listing state. Requirements own multiple matches. A disclosure has a unique requirement/tutor pair, a unique match and one of three unique numbered slots. A requirement row lock serializes confirmation. Consent and disclosure commit together.

Public pages sit under `src/app`, with separate parent, tutor and admin workspace routes. `src/app/api/v1` exposes validated endpoints. `src/lib` contains the database, authentication, directory, onboarding, payment, matching, storage and notification modules. Forward migrations are in `drizzle`; local tools and automated checks are in `scripts` and `tests`.

## Route map

| Surface | Routes |
| --- | --- |
| Public | `/`, `/tutors`, `/tutors/[slug]`, `/how-it-works`, `/become-a-tutor`, `/login`, `/support`, `/privacy`, `/terms`, `/onboarding-policy`, `/data-rights` |
| Guardian | `/parent/dashboard`, `/parent/students`, `/parent/requirements`, `/parent/requirements/new`, `/parent/requirements/[id]`, `/parent/requests`, `/parent/connections`, `/parent/saved-tutors`, `/parent/settings` |
| Tutor | `/tutor/dashboard`, `/tutor/application`, `/tutor/activate`, `/tutor/opportunities`, `/tutor/requests`, `/tutor/applications`, `/tutor/connections`, `/tutor/profile`, `/tutor/payments`, `/tutor/settings` |
| Admin | `/admin/dashboard`, `/admin/applications`, `/admin/applications/[id]`, `/admin/tutors`, `/admin/parents`, `/admin/requirements`, `/admin/matches`, `/admin/payments`, `/admin/reports`, `/admin/catalog`, `/admin/fees`, `/admin/audit` |
| API | `/api/v1/{auth,tutors,catalog,parent,tutor,requirements,matches,admin,payments,webhooks,notifications}` |

## Data boundaries

- `src/lib/schema.ts` describes the tables in Drizzle. The ordered SQL files are authoritative for migration history, SQL triggers, reference seed data and index definitions. The domain uses typed Drizzle reads for catalogs and parameterized SQL through Drizzle where operations need row-level locks, specialized predicates, or multi-row changes.
- A user can have both guardian and tutor roles. Google sign-in uses an immutable Google subject, and existing members can link it from an authenticated session. Phone verification is tracked independently. An opaque, server-stored session is bound to one role at a time. A guardian owns student academic profiles and requirements. Students have no accounts. A profile bio and profile photograph are public after activation. Academic intake notes on requirements are private, and tutors see structured academic and schedule fields.
- Tutor application revisions and reviewer decisions are append-only. Submission captures the documents selected at the time. Review can request edits, reject, or mark the tutor approved. Checkout reads a configured fee plan and verifies Razorpay capture independently of the browser. A production listing also requires a captured live order.
- A direct request enters `pending_tutor`. Acceptance advances to `awaiting_parent_consent`. Open interest enters `pending_parent`, and guardian selection advances to the same consent state. Pending matches can be declined, cancelled, or expired when the requirement closes. Connected matches can be ended and disclosure access revoked. A repeated attempt for the same tutor and requirement uses the existing record.
- Confirmations lock the requirement, then the match and tutor before creating the consent and encrypted snapshot atomically. Named database constraints enforce three numbered slots and unique requirement-tutor and match keys. Historical slots are immutable. Consent records, audit events, review records and payment events are append-only.
- The app uses an encrypted phone snapshot bound to a match and checks current account state, match ownership, revocation, and blocking before revealing it. A revoked or blocked match still retains its allocation. Terminal match records and consent history can support dispute handling. The scheduled retention and individual erasure jobs require an operator policy before launch.
