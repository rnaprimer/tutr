// PostgreSQL table definitions. Apply the checked-in SQL migrations for triggers and migration history.
import {
  pgTable,
  text,
  unique,
  uuid,
  timestamp,
  boolean,
  bigint,
  index,
  foreignKey,
  integer,
  check,
  smallint,
  jsonb,
  uniqueIndex,
  char,
  primaryKey,
  pgEnum,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const applicationStatus = pgEnum('application_status', [
  'draft',
  'pending_review',
  'changes_required',
  'rejected',
  'approved',
])
export const feeUnit = pgEnum('fee_unit', ['hour', 'month'])
export const matchStatus = pgEnum('match_status', [
  'pending_tutor',
  'pending_parent',
  'awaiting_parent_consent',
  'connected',
  'declined',
  'cancelled',
  'expired',
])
export const requirementStatus = pgEnum('requirement_status', [
  'draft',
  'published',
  'paused',
  'closed',
  'filled',
])
export const role = pgEnum('role', ['parent', 'tutor', 'admin'])
export const teachingPlace = pgEnum('teaching_place', [
  'student_home',
  'tutor_home',
])
export const verificationStatus = pgEnum('verification_status', [
  'unverified',
  'approved',
  'rejected',
])

export const users = pgTable(
  'users',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    phoneHash: text('phone_hash'),
    googleSubject: text('google_subject'),
    phoneCipher: text('phone_cipher'),
    phoneVerifiedAt: timestamp('phone_verified_at', {
      withTimezone: true,
      mode: 'string',
    }),
    disabled: boolean().default(false).notNull(),
    adminEmail: text('admin_email'),
    passwordHash: text('password_hash'),
    mfaCipher: text('mfa_cipher'),
    // The TOTP time-step counter fits safely in a JavaScript number.
    mfaCounter: bigint('mfa_counter', { mode: 'number' })
      .default(sql`'-1'`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('users_phone_hash_key').on(table.phoneHash),
    unique('users_google_subject_key').on(table.googleSubject),
    unique('users_admin_email_key').on(table.adminEmail),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    role: role().notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    index('sessions_expiry').using('btree', table.expiresAt.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'sessions_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId, table.role],
      foreignColumns: [userRoles.userId, userRoles.role],
      name: 'sessions_user_id_role_fkey',
    }).onDelete('cascade'),
  ],
)

export const rateLimits = pgTable('rate_limits', {
  bucket: text().primaryKey().notNull(),
  hits: integer().notNull(),
  resetAt: timestamp('reset_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
})

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    phoneHash: text('phone_hash').notNull(),
    phoneCipher: text('phone_cipher').notNull(),
    otpHash: text('otp_hash'),
    providerSid: text('provider_sid'),
    role: role().notNull(),
    attempts: integer().default(0).notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
  },
  () => [check('otp_challenges_role_check', sql`role <> 'admin'::role`)],
)

export const cities = pgTable(
  'cities',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    enabled: boolean().default(true).notNull(),
  },
  (table) => [unique('cities_name_key').on(table.name)],
)

export const localities = pgTable(
  'localities',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    cityId: uuid('city_id').notNull(),
    name: text().notNull(),
    enabled: boolean().default(true).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.cityId],
      foreignColumns: [cities.id],
      name: 'localities_city_id_fkey',
    }),
    unique('localities_city_id_name_key').on(table.cityId, table.name),
  ],
)

export const parentProfiles = pgTable(
  'parent_profiles',
  {
    id: uuid().primaryKey().notNull(),
    displayName: text('display_name').default('Guardian').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [users.id],
      name: 'parent_profiles_id_fkey',
    }),
  ],
)

export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    parentId: uuid('parent_id').notNull(),
    label: text().notNull(),
    class: smallint().notNull(),
    boardId: uuid('board_id').notNull(),
    archived: boolean().default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [parentProfiles.id],
      name: 'student_profiles_parent_id_fkey',
    }),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: 'student_profiles_board_id_fkey',
    }),
    unique('student_profiles_id_parent_id_key').on(table.id, table.parentId),
    check('student_profiles_class_check', sql`(class >= 1) AND (class <= 12)`),
  ],
)

export const boards = pgTable(
  'boards',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    enabled: boolean().default(true).notNull(),
  },
  (table) => [unique('boards_name_key').on(table.name)],
)

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    actorId: uuid('actor_id'),
    action: text().notNull(),
    entityId: uuid('entity_id'),
    detail: jsonb().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_entity').using(
      'btree',
      table.entityId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: 'audit_events_actor_id_fkey',
    }),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    kind: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    deliveryStatus: text('delivery_status').default('pending').notNull(),
    providerId: text('provider_id'),
    deliveryAttempts: integer('delivery_attempts').default(0).notNull(),
    deliveryAfter: timestamp('delivery_after', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    deliveryLease: uuid('delivery_lease'),
  },
  (table) => [
    index('notifications_user').using(
      'btree',
      table.userId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index('pending_message_delivery')
      .using('btree', table.deliveryAfter, table.createdAt)
      .where(sql`(delivery_status = 'pending'::text)`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'notifications_user_id_fkey',
    }),
    check(
      'notifications_delivery_status_check',
      sql`delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'preview'::text, 'skipped'::text])`,
    ),
  ],
)

export const tutorProfiles = pgTable(
  'tutor_profiles',
  {
    id: uuid().primaryKey().notNull(),
    slug: text().notNull(),
    displayName: text('display_name'),
    intro: text(),
    photoKey: text('photo_key'),
    qualification: text(),
    institution: text(),
    experience: integer(),
    localityId: uuid('locality_id'),
    fee: integer(),
    feeUnit: feeUnit('fee_unit'),
    teachingPlace: teachingPlace('teaching_place'),
    verification: verificationStatus().default('unverified').notNull(),
    paymentStatus: text('payment_status').default('unpaid').notNull(),
    listingStatus: text('listing_status').default('hidden').notNull(),
    suspended: boolean().default(false).notNull(),
    synthetic: boolean().default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('tutor_directory')
      .using(
        'btree',
        table.synthetic.asc().nullsLast(),
        table.createdAt.desc().nullsFirst(),
        table.id.asc().nullsLast(),
      )
      .where(
        sql`((verification = 'approved'::verification_status) AND (payment_status = 'paid'::text) AND (listing_status = 'listed'::text) AND (NOT suspended))`,
      ),
    index('tutor_filter').using(
      'btree',
      table.localityId.asc().nullsLast(),
      table.teachingPlace.asc().nullsLast(),
      table.feeUnit.asc().nullsLast(),
      table.fee.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.id],
      foreignColumns: [users.id],
      name: 'tutor_profiles_id_fkey',
    }),
    foreignKey({
      columns: [table.localityId],
      foreignColumns: [localities.id],
      name: 'tutor_profiles_locality_id_fkey',
    }),
    unique('tutor_profiles_slug_key').on(table.slug),
    check(
      'tutor_profiles_experience_check',
      sql`(experience >= 0) AND (experience <= 60)`,
    ),
    check('tutor_profiles_fee_check', sql`fee > 0`),
    check(
      'tutor_profiles_payment_status_check',
      sql`payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'refunded'::text])`,
    ),
    check(
      'tutor_profiles_listing_status_check',
      sql`listing_status = ANY (ARRAY['hidden'::text, 'listed'::text])`,
    ),
  ],
)

export const tutorApplications = pgTable(
  'tutor_applications',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tutorId: uuid('tutor_id').notNull(),
    status: applicationStatus().default('draft').notNull(),
    draft: jsonb().default({}).notNull(),
    revision: integer().default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('application_queue').using(
      'btree',
      table.status.asc().nullsLast(),
      table.updatedAt.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'tutor_applications_tutor_id_fkey',
    }),
    unique('tutor_applications_tutor_id_key').on(table.tutorId),
  ],
)

export const applicationDecisions = pgTable(
  'application_decisions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    applicationId: uuid('application_id').notNull(),
    revision: integer().notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    decision: applicationStatus().notNull(),
    notes: text().notNull(),
    identityChecked: boolean('identity_checked').notNull(),
    academicChecked: boolean('academic_checked').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    internalNotes: text('internal_notes').default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reviewerId],
      foreignColumns: [users.id],
      name: 'application_decisions_reviewer_id_fkey',
    }),
    foreignKey({
      columns: [table.applicationId, table.revision],
      foreignColumns: [
        applicationRevisions.applicationId,
        applicationRevisions.revision,
      ],
      name: 'application_decisions_application_id_revision_fkey',
    }),
    check(
      'application_decisions_decision_check',
      sql`decision = ANY (ARRAY['approved'::application_status, 'rejected'::application_status, 'changes_required'::application_status])`,
    ),
  ],
)

export const verificationDocuments = pgTable(
  'verification_documents',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    applicationId: uuid('application_id').notNull(),
    kind: text().notNull(),
    objectKey: text('object_key').notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [tutorApplications.id],
      name: 'verification_documents_application_id_fkey',
    }),
    unique('verification_documents_object_key_key').on(table.objectKey),
    check(
      'verification_documents_kind_check',
      sql`kind = ANY (ARRAY['identity'::text, 'academic'::text, 'photo'::text])`,
    ),
    check(
      'verification_documents_size_check',
      sql`(size >= 1) AND (size <= 8388608)`,
    ),
  ],
)

export const subjects = pgTable(
  'subjects',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    enabled: boolean().default(true).notNull(),
  },
  (table) => [unique('subjects_name_key').on(table.name)],
)

export const onboardingFeePlans = pgTable(
  'onboarding_fee_plans',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    amount: integer().notNull(),
    currency: char({ length: 3 }).default('INR').notNull(),
    active: boolean().default(true).notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('only_one_fee')
      .using('btree', table.active.asc().nullsLast())
      .where(sql`active`),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'onboarding_fee_plans_created_by_fkey',
    }),
    check('onboarding_fee_plans_amount_check', sql`amount > 0`),
    check('onboarding_fee_plans_currency_check', sql`currency = 'INR'::bpchar`),
  ],
)

export const tuitionRequirements = pgTable(
  'tuition_requirements',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    parentId: uuid('parent_id').notNull(),
    studentId: uuid('student_id').notNull(),
    class: smallint().notNull(),
    boardId: uuid('board_id').notNull(),
    localityId: uuid('locality_id').notNull(),
    targetTutorId: uuid('target_tutor_id'),
    mode: text().notNull(),
    status: requirementStatus().default('draft').notNull(),
    budget: integer().notNull(),
    unit: feeUnit().notNull(),
    days: smallint().array().notNull(),
    schedule: text().notNull(),
    teachingPlace: teachingPlace('teaching_place').notNull(),
    details: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('requirement_discovery')
      .using(
        'btree',
        table.localityId.asc().nullsLast(),
        table.class.asc().nullsLast(),
        table.boardId.asc().nullsLast(),
        table.teachingPlace.asc().nullsLast(),
        table.createdAt.desc().nullsFirst(),
      )
      .where(
        sql`((status = 'published'::requirement_status) AND (mode = 'open'::text))`,
      ),
    index('requirements_owner').using(
      'btree',
      table.parentId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [parentProfiles.id],
      name: 'tuition_requirements_parent_id_fkey',
    }),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: 'tuition_requirements_board_id_fkey',
    }),
    foreignKey({
      columns: [table.localityId],
      foreignColumns: [localities.id],
      name: 'tuition_requirements_locality_id_fkey',
    }),
    foreignKey({
      columns: [table.targetTutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'tuition_requirements_target_tutor_id_fkey',
    }),
    foreignKey({
      columns: [table.parentId, table.studentId],
      foreignColumns: [studentProfiles.id, studentProfiles.parentId],
      name: 'tuition_requirements_student_id_parent_id_fkey',
    }),
    check(
      'tuition_requirements_class_check',
      sql`(class >= 1) AND (class <= 12)`,
    ),
    check(
      'tuition_requirements_mode_check',
      sql`mode = ANY (ARRAY['open'::text, 'direct'::text])`,
    ),
    check('tuition_requirements_budget_check', sql`budget > 0`),
    check(
      'tuition_requirements_days_check',
      sql`(days <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]) AND (cardinality(days) > 0)`,
    ),
    check(
      'tuition_requirements_check',
      sql`(mode = 'direct'::text) OR (target_tutor_id IS NULL)`,
    ),
    check(
      'requirement_schedule',
      sql`schedule = ANY (ARRAY['Flexible'::text, 'Before school'::text, 'Late morning'::text, 'Early afternoon'::text, 'After 3 pm'::text, 'After 5 pm'::text, 'After 7 pm'::text]))) NOT VALID`,
    ),
  ],
)

export const paymentOrders = pgTable(
  'payment_orders',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    tutorId: uuid('tutor_id').notNull(),
    planId: uuid('plan_id').notNull(),
    amount: integer().notNull(),
    currency: char({ length: 3 }).notNull(),
    gatewayOrder: text('gateway_order'),
    gatewayPayment: text('gateway_payment'),
    state: text().default('created').notNull(),
    mode: text().notNull(),
    refundedAmount: integer('refunded_amount').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('one_open_payment')
      .using(
        'btree',
        table.tutorId.asc().nullsLast(),
        table.mode.asc().nullsLast(),
      )
      .where(sql`(state = 'created'::text)`),
    index('payment_activation_proof').using(
      'btree',
      table.tutorId.asc().nullsLast(),
      table.mode.asc().nullsLast(),
      table.state.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'payment_orders_tutor_id_fkey',
    }),
    foreignKey({
      columns: [table.planId],
      foreignColumns: [onboardingFeePlans.id],
      name: 'payment_orders_plan_id_fkey',
    }),
    unique('payment_orders_gateway_order_key').on(table.gatewayOrder),
    unique('payment_orders_gateway_payment_key').on(table.gatewayPayment),
    check('payment_orders_amount_check', sql`amount > 0`),
    check('payment_orders_currency_check', sql`currency = 'INR'::bpchar`),
    check(
      'payment_orders_state_check',
      sql`state = ANY (ARRAY['created'::text, 'captured'::text, 'refunded'::text])`,
    ),
    check(
      'payment_orders_mode_check',
      sql`mode = ANY (ARRAY['sandbox'::text, 'test'::text, 'live'::text])`,
    ),
    check(
      'payment_orders_check',
      sql`(refunded_amount >= 0) AND (refunded_amount <= amount)`,
    ),
  ],
)

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    orderId: uuid('order_id').notNull(),
    eventKey: text('event_key').notNull(),
    kind: text().notNull(),
    paymentReference: text('payment_reference'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [paymentOrders.id],
      name: 'payment_events_order_id_fkey',
    }),
    unique('payment_events_event_key_key').on(table.eventKey),
  ],
)

export const matchRequests = pgTable(
  'match_requests',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    requirementId: uuid('requirement_id').notNull(),
    tutorId: uuid('tutor_id').notNull(),
    kind: text().notNull(),
    state: matchStatus().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matches_tutor').using(
      'btree',
      table.tutorId.asc().nullsLast(),
      table.state.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.requirementId],
      foreignColumns: [tuitionRequirements.id],
      name: 'match_requests_requirement_id_fkey',
    }),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'match_requests_tutor_id_fkey',
    }),
    unique('match_requests_requirement_id_tutor_id_key').on(
      table.requirementId,
      table.tutorId,
    ),
    unique('match_requests_id_requirement_id_tutor_id_key').on(
      table.id,
      table.requirementId,
      table.tutorId,
    ),
    check(
      'match_requests_kind_check',
      sql`kind = ANY (ARRAY['direct'::text, 'open'::text])`,
    ),
  ],
)

export const contactConsents = pgTable(
  'contact_consents',
  {
    matchId: uuid('match_id').primaryKey().notNull(),
    parentId: uuid('parent_id').notNull(),
    tutorId: uuid('tutor_id').notNull(),
    consentVersion: text('consent_version').notNull(),
    consentedAt: timestamp('consented_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.matchId],
      foreignColumns: [matchRequests.id],
      name: 'contact_consents_match_id_fkey',
    }),
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [parentProfiles.id],
      name: 'contact_consents_parent_id_fkey',
    }),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'contact_consents_tutor_id_fkey',
    }),
  ],
)

export const contactDisclosures = pgTable(
  'contact_disclosures',
  {
    matchId: uuid('match_id').primaryKey().notNull(),
    requirementId: uuid('requirement_id').notNull(),
    tutorId: uuid('tutor_id').notNull(),
    slot: smallint().notNull(),
    phoneCipher: text('phone_cipher').notNull(),
    disclosedAt: timestamp('disclosed_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    foreignKey({
      columns: [table.matchId],
      foreignColumns: [contactConsents.matchId],
      name: 'contact_disclosures_match_id_fkey',
    }),
    foreignKey({
      columns: [table.matchId, table.requirementId, table.tutorId],
      foreignColumns: [
        matchRequests.id,
        matchRequests.requirementId,
        matchRequests.tutorId,
      ],
      name: 'contact_disclosures_match_id_requirement_id_tutor_id_fkey',
    }),
    unique('contact_disclosures_requirement_id_slot_key').on(
      table.requirementId,
      table.slot,
    ),
    unique('contact_disclosures_requirement_id_tutor_id_key').on(
      table.requirementId,
      table.tutorId,
    ),
    check('contact_disclosures_slot_check', sql`(slot >= 1) AND (slot <= 3)`),
  ],
)

export const moderationReports = pgTable(
  'moderation_reports',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    reporterId: uuid('reporter_id').notNull(),
    targetId: uuid('target_id').notNull(),
    matchId: uuid('match_id').notNull(),
    reason: text().notNull(),
    resolution: text(),
    resolvedBy: uuid('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.reporterId],
      foreignColumns: [users.id],
      name: 'moderation_reports_reporter_id_fkey',
    }),
    foreignKey({
      columns: [table.targetId],
      foreignColumns: [users.id],
      name: 'moderation_reports_target_id_fkey',
    }),
    foreignKey({
      columns: [table.matchId],
      foreignColumns: [matchRequests.id],
      name: 'moderation_reports_match_id_fkey',
    }),
    foreignKey({
      columns: [table.resolvedBy],
      foreignColumns: [users.id],
      name: 'moderation_reports_resolved_by_fkey',
    }),
  ],
)

export const tutorServiceAreas = pgTable(
  'tutor_service_areas',
  {
    tutorId: uuid('tutor_id').notNull(),
    localityId: uuid('locality_id').notNull(),
  },
  (table) => [
    index('service_search').using(
      'btree',
      table.localityId.asc().nullsLast(),
      table.tutorId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'tutor_service_areas_tutor_id_fkey',
    }),
    foreignKey({
      columns: [table.localityId],
      foreignColumns: [localities.id],
      name: 'tutor_service_areas_locality_id_fkey',
    }),
    primaryKey({
      columns: [table.tutorId, table.localityId],
      name: 'tutor_service_areas_pkey',
    }),
  ],
)

export const tutorAvailability = pgTable(
  'tutor_availability',
  {
    tutorId: uuid('tutor_id').notNull(),
    day: smallint().notNull(),
  },
  (table) => [
    index('availability_search').using(
      'btree',
      table.day.asc().nullsLast(),
      table.tutorId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'tutor_availability_tutor_id_fkey',
    }),
    primaryKey({
      columns: [table.tutorId, table.day],
      name: 'tutor_availability_pkey',
    }),
    check('tutor_availability_day_check', sql`(day >= 1) AND (day <= 7)`),
  ],
)

export const requirementSubjects = pgTable(
  'requirement_subjects',
  {
    requirementId: uuid('requirement_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.requirementId],
      foreignColumns: [tuitionRequirements.id],
      name: 'requirement_subjects_requirement_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjects.id],
      name: 'requirement_subjects_subject_id_fkey',
    }),
    primaryKey({
      columns: [table.requirementId, table.subjectId],
      name: 'requirement_subjects_pkey',
    }),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull(),
    role: role().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_roles_user_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.userId, table.role],
      name: 'user_roles_pkey',
    }),
  ],
)

export const savedTutors = pgTable(
  'saved_tutors',
  {
    parentId: uuid('parent_id').notNull(),
    tutorId: uuid('tutor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [parentProfiles.id],
      name: 'saved_tutors_parent_id_fkey',
    }),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'saved_tutors_tutor_id_fkey',
    }),
    primaryKey({
      columns: [table.parentId, table.tutorId],
      name: 'saved_tutors_pkey',
    }),
  ],
)

export const accountBlocks = pgTable(
  'account_blocks',
  {
    parentId: uuid('parent_id').notNull(),
    tutorId: uuid('tutor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [parentProfiles.id],
      name: 'account_blocks_parent_id_fkey',
    }),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'account_blocks_tutor_id_fkey',
    }),
    primaryKey({
      columns: [table.parentId, table.tutorId],
      name: 'account_blocks_pkey',
    }),
  ],
)

export const applicationRevisions = pgTable(
  'application_revisions',
  {
    applicationId: uuid('application_id').notNull(),
    revision: integer().notNull(),
    snapshot: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [tutorApplications.id],
      name: 'application_revisions_application_id_fkey',
    }),
    primaryKey({
      columns: [table.applicationId, table.revision],
      name: 'application_revisions_pkey',
    }),
  ],
)

export const tutorOfferings = pgTable(
  'tutor_offerings',
  {
    tutorId: uuid('tutor_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    boardId: uuid('board_id').notNull(),
    class: smallint().notNull(),
  },
  (table) => [
    index('offerings_board').using(
      'btree',
      table.boardId.asc().nullsLast(),
      table.tutorId.asc().nullsLast(),
    ),
    index('offerings_class').using(
      'btree',
      table.class.asc().nullsLast(),
      table.tutorId.asc().nullsLast(),
    ),
    index('offerings_search').using(
      'btree',
      table.subjectId.asc().nullsLast(),
      table.boardId.asc().nullsLast(),
      table.class.asc().nullsLast(),
      table.tutorId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.tutorId],
      foreignColumns: [tutorProfiles.id],
      name: 'tutor_offerings_tutor_id_fkey',
    }),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjects.id],
      name: 'tutor_offerings_subject_id_fkey',
    }),
    foreignKey({
      columns: [table.boardId],
      foreignColumns: [boards.id],
      name: 'tutor_offerings_board_id_fkey',
    }),
    primaryKey({
      columns: [table.tutorId, table.subjectId, table.boardId, table.class],
      name: 'tutor_offerings_pkey',
    }),
    check('tutor_offerings_class_check', sql`(class >= 1) AND (class <= 12)`),
  ],
)
