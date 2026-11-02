-- Team directory (so every member can show "Edited by <name>" and presence), the contractor list for the
-- header picker, a way to change one's own name, and the dashboard's event trail on audits.

create or replace function public.hs_team_directory()
returns table (id uuid, email text, full_name text, role public.app_role, confirmed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.full_name, p.role, (u.email_confirmed_at is not null) as confirmed
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.app_role() is not null
  order by p.full_name nulls last, p.email
$$;

create or replace function public.hs_contractors()
returns table (id text, name text, contract_no text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, coalesce(c.doc->>'name', c.id) as name, c.doc->>'contractNo' as contract_no
  from public.contractors c
  where public.app_role() is not null and coalesce((c.doc->>'active')::boolean, true)
  order by coalesce(c.doc->>'name', c.id)
$$;

-- profiles.update is admin-only (and rightly so: it holds the role), so a member changes their name here.
create or replace function public.hs_set_my_name(name text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set full_name = nullif(trim(name), '') where id = auth.uid()
$$;

grant execute on function public.hs_team_directory() to authenticated;
grant execute on function public.hs_contractors() to authenticated;
grant execute on function public.hs_set_my_name(text) to authenticated;

-- Audit creation, status and deletion show up in the dashboard's audit_events trail.
create trigger hs_audits_log after insert or update on public.hs_audits for each row execute function public.log_event();
