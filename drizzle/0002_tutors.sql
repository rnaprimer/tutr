create type verification_status as enum ('unverified','approved','rejected');
create type application_status as enum ('draft','pending_review','changes_required','rejected','approved');
create type teaching_place as enum ('student_home','tutor_home');
create type fee_unit as enum ('hour','month');
create table tutor_profiles (
 id uuid primary key references users, slug text not null unique, display_name text, intro text, photo_key text,
 qualification text, institution text, experience integer check(experience between 0 and 60), locality_id uuid references localities,
 fee integer check(fee > 0), fee_unit fee_unit, teaching_place teaching_place, verification verification_status not null default 'unverified',
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded')),
 listing_status text not null default 'hidden' check(listing_status in ('hidden','listed')), suspended boolean not null default false,
 synthetic boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tutor_directory on tutor_profiles(synthetic,created_at desc,id) where verification='approved' and payment_status='paid' and listing_status='listed' and not suspended;
create index tutor_filter on tutor_profiles(locality_id,teaching_place,fee_unit,fee);
create table tutor_applications (
 id uuid primary key default gen_random_uuid(), tutor_id uuid not null unique references tutor_profiles,
 status application_status not null default 'draft', draft jsonb not null default '{}', revision integer not null default 0,
 updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index application_queue on tutor_applications(status,updated_at);
create table application_revisions (
 application_id uuid references tutor_applications, revision integer, snapshot jsonb not null, created_at timestamptz not null default now(), primary key(application_id,revision)
);
create table verification_documents (
 id uuid primary key default gen_random_uuid(), application_id uuid not null references tutor_applications, kind text not null check(kind in ('identity','academic','photo')),
 object_key text not null unique, mime text not null, size integer not null check(size between 1 and 8388608), created_at timestamptz not null default now()
);
create table application_decisions (
 id uuid primary key default gen_random_uuid(), application_id uuid not null, revision integer not null, reviewer_id uuid not null references users,
 decision application_status not null check(decision in ('approved','rejected','changes_required')), notes text not null,
 identity_checked boolean not null, academic_checked boolean not null, created_at timestamptz not null default now(),
 foreign key(application_id,revision) references application_revisions
);
create table tutor_offerings (
 tutor_id uuid references tutor_profiles, subject_id uuid references subjects, board_id uuid references boards,
 class smallint not null check(class between 1 and 12), primary key(tutor_id,subject_id,board_id,class)
);
create index offerings_search on tutor_offerings(subject_id,board_id,class,tutor_id);
create index offerings_class on tutor_offerings(class,tutor_id);
create index offerings_board on tutor_offerings(board_id,tutor_id);
create table tutor_service_areas (tutor_id uuid references tutor_profiles, locality_id uuid references localities, primary key(tutor_id,locality_id));
create index service_search on tutor_service_areas(locality_id,tutor_id);
create table tutor_availability (
 tutor_id uuid references tutor_profiles, day smallint check(day between 1 and 7), primary key(tutor_id,day)
);
create index availability_search on tutor_availability(day,tutor_id);
