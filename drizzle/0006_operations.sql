alter table application_decisions add column internal_notes text not null default '';
create index payment_activation_proof on payment_orders(tutor_id,mode,state);
create index pending_message_delivery on notifications(created_at) where delivery_status='pending';
