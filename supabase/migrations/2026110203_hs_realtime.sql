-- Live updates: every change to an hs_ row is broadcast on a private channel per audit ("audit:<id>");
-- audit header/status rows also go to "team:audits" for the audit list. Presence rides on the audit channel.

create or replace function public.hs_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic text;
begin
  if tg_table_name = 'hs_audits' then
    topic := 'audit:' || new.id::text;
  else
    topic := 'audit:' || new.audit_id::text;
  end if;
  perform realtime.broadcast_changes(topic, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  if tg_table_name = 'hs_audits' then
    perform realtime.broadcast_changes('team:audits', tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
end $$;

create trigger hs_audits_broadcast    after insert or update on public.hs_audits    for each row execute function public.hs_broadcast();
create trigger hs_answers_broadcast   after insert or update on public.hs_answers   for each row execute function public.hs_broadcast();
create trigger hs_positives_broadcast after insert or update on public.hs_positives for each row execute function public.hs_broadcast();
create trigger hs_photos_broadcast    after insert or update on public.hs_photos    for each row execute function public.hs_broadcast();

-- Who may listen (broadcast + presence) and who may announce presence. Clients never broadcast themselves.
create policy "hs: team listens" on realtime.messages
  for select to authenticated
  using ((select public.app_role()) is not null and (realtime.topic() = 'team:audits' or realtime.topic() like 'audit:%'));

create policy "hs: team presence" on realtime.messages
  for insert to authenticated
  with check ((select public.app_role()) is not null and realtime.messages.extension = 'presence' and realtime.topic() like 'audit:%');
