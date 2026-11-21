create table onboarding_fee_plans (
 id uuid primary key default gen_random_uuid(), amount integer not null check(amount > 0), currency char(3) not null default 'INR' check(currency='INR'),
 active boolean not null default true, created_by uuid not null references users, created_at timestamptz not null default now()
);
create unique index only_one_fee on onboarding_fee_plans(active) where active;
create table payment_orders (
 id uuid primary key default gen_random_uuid(), tutor_id uuid not null references tutor_profiles, plan_id uuid not null references onboarding_fee_plans,
 amount integer not null check(amount > 0), currency char(3) not null check(currency='INR'), gateway_order text unique, gateway_payment text unique,
 state text not null default 'created' check(state in ('created','captured','refunded')), mode text not null check(mode in ('sandbox','test','live')),
 refunded_amount integer not null default 0 check(refunded_amount between 0 and amount),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_open_payment on payment_orders(tutor_id,mode) where state='created';
create table payment_events (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references payment_orders, event_key text not null unique,
 kind text not null, payment_reference text, created_at timestamptz not null default now()
);
