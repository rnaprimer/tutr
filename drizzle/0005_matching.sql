create type match_status as enum ('pending_tutor','pending_parent','awaiting_parent_consent','connected','declined','cancelled','expired');
create table match_requests (
 id uuid primary key default gen_random_uuid(), requirement_id uuid not null references tuition_requirements, tutor_id uuid not null references tutor_profiles,
 kind text not null check(kind in ('direct','open')), state match_status not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(requirement_id,tutor_id), unique(id,requirement_id,tutor_id)
);
create index matches_tutor on match_requests(tutor_id,state,created_at desc);
create table contact_consents (
 match_id uuid primary key references match_requests, parent_id uuid not null references parent_profiles, tutor_id uuid not null references tutor_profiles,
 consent_version text not null, consented_at timestamptz not null default now()
);
create table contact_disclosures (
 match_id uuid primary key references contact_consents, requirement_id uuid not null, tutor_id uuid not null,
 slot smallint not null check(slot between 1 and 3), phone_cipher text not null, disclosed_at timestamptz not null default now(), revoked_at timestamptz,
 unique(requirement_id,slot), unique(requirement_id,tutor_id),
 foreign key(match_id,requirement_id,tutor_id) references match_requests(id,requirement_id,tutor_id)
);
create table account_blocks (
 parent_id uuid references parent_profiles, tutor_id uuid references tutor_profiles, created_at timestamptz not null default now(), primary key(parent_id,tutor_id)
);
create table moderation_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references users, target_id uuid not null references users,
 match_id uuid not null references match_requests, reason text not null, resolution text, resolved_by uuid references users,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
