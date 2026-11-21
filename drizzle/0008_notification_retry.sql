alter table notifications add column delivery_attempts integer not null default 0 check(delivery_attempts >= 0);
alter table notifications add column delivery_after timestamptz not null default now();
alter table notifications add column delivery_lease uuid;
drop index pending_message_delivery;
create index pending_message_delivery on notifications(delivery_after,created_at) where delivery_status='pending';
