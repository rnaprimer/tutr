alter table tuition_requirements add constraint requirement_schedule
  check(schedule in ('Flexible','Before school','Late morning','Early afternoon','After 3 pm','After 5 pm','After 7 pm')) not valid;

create function prevent_record_rewrite() returns trigger language plpgsql as $$
begin
  raise exception 'Historical records are append-only' using errcode='23514';
end;
$$;
create trigger audit_immutable before update or delete on audit_events for each row execute function prevent_record_rewrite();
create trigger consent_immutable before update or delete on contact_consents for each row execute function prevent_record_rewrite();
create trigger payment_event_immutable before update or delete on payment_events for each row execute function prevent_record_rewrite();
create trigger application_revision_immutable before update or delete on application_revisions for each row execute function prevent_record_rewrite();
create trigger application_decision_immutable before update or delete on application_decisions for each row execute function prevent_record_rewrite();

create function protect_disclosure() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then
    raise exception 'Disclosure slots cannot be released' using errcode='23514';
  end if;
  if (old.match_id,old.requirement_id,old.tutor_id,old.slot,old.phone_cipher,old.disclosed_at)
    is distinct from (new.match_id,new.requirement_id,new.tutor_id,new.slot,new.phone_cipher,new.disclosed_at)
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Only access revocation may change a disclosure' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger disclosure_immutable before update or delete on contact_disclosures for each row execute function protect_disclosure();

create function protect_order_amount() returns trigger language plpgsql as $$
begin
  if (old.id,old.tutor_id,old.plan_id,old.amount,old.currency,old.gateway_order,old.mode,old.created_at)
    is distinct from (new.id,new.tutor_id,new.plan_id,new.amount,new.currency,new.gateway_order,new.mode,new.created_at) then
    raise exception 'Payment order terms cannot change' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger order_terms_immutable before update on payment_orders for each row execute function protect_order_amount();
