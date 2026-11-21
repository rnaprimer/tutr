create type role as enum ('parent','tutor','admin');
create table users (
 id uuid primary key default gen_random_uuid(), phone_hash text unique, phone_cipher text, phone_verified_at timestamptz,
 disabled boolean not null default false, admin_email text unique, password_hash text, mfa_cipher text, mfa_counter bigint not null default -1,
 created_at timestamptz not null default now()
);
create table user_roles (
 user_id uuid references users on delete cascade, role role not null, created_at timestamptz not null default now(), primary key(user_id,role)
);
create table sessions (
 token_hash text primary key, user_id uuid not null references users on delete cascade, role role not null,
 expires_at timestamptz not null, foreign key(user_id,role) references user_roles on delete cascade
);
create index sessions_expiry on sessions(expires_at);
create table rate_limits (bucket text primary key, hits integer not null, reset_at timestamptz not null);
create table otp_challenges (
 id uuid primary key default gen_random_uuid(), phone_hash text not null, phone_cipher text not null,
 otp_hash text, provider_sid text, role role not null check(role <> 'admin'), attempts integer not null default 0, expires_at timestamptz not null
);
create table cities (id uuid primary key default gen_random_uuid(), name text not null unique, enabled boolean not null default true);
create table localities (id uuid primary key default gen_random_uuid(), city_id uuid not null references cities, name text not null, enabled boolean not null default true, unique(city_id,name));
create table boards (id uuid primary key default gen_random_uuid(), name text not null unique, enabled boolean not null default true);
create table subjects (id uuid primary key default gen_random_uuid(), name text not null unique, enabled boolean not null default true);
create table parent_profiles (id uuid primary key references users, display_name text not null default 'Guardian', updated_at timestamptz not null default now());
create table student_profiles (
 id uuid primary key default gen_random_uuid(), parent_id uuid not null references parent_profiles, label text not null,
 class smallint not null check(class between 1 and 12), board_id uuid not null references boards, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,parent_id)
);
create table audit_events (
 id uuid primary key default gen_random_uuid(), actor_id uuid references users, action text not null, entity_id uuid,
 detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_entity on audit_events(entity_id,created_at desc);
create table notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references users, kind text not null, created_at timestamptz not null default now(),
 read_at timestamptz, delivery_status text not null default 'pending' check(delivery_status in ('pending','sent','preview','skipped')), provider_id text
);
create index notifications_user on notifications(user_id,created_at desc);
