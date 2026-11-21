-- Application authorization is handled by Next.js over a direct database connection.
-- Hosted PostgreSQL may grant API roles access by default. Limit changes to app tables.
do $$
declare
  table_name text;
  api_role text;
begin
  foreach table_name in array array[
    'account_blocks', 'application_decisions', 'application_revisions',
    'audit_events', 'boards', 'cities', 'contact_consents', 'contact_disclosures',
    'localities', 'match_requests', 'moderation_reports', 'notifications',
    'onboarding_fee_plans', 'otp_challenges', 'parent_profiles', 'payment_events',
    'payment_orders', 'rate_limits', 'requirement_subjects', 'saved_tutors',
    'schema_migrations', 'sessions', 'student_profiles', 'subjects',
    'tuition_requirements', 'tutor_applications', 'tutor_availability',
    'tutor_offerings', 'tutor_profiles', 'tutor_service_areas', 'user_roles',
    'users', 'verification_documents'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public', table_name);
    for api_role in
      select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
    loop
      execute format('revoke all on table public.%I from %I', table_name, api_role);
    end loop;
  end loop;
end
$$;
