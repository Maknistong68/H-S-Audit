-- HSE Audit app: live audit tables next to the dashboard's own.
-- Phone timestamps are epoch milliseconds (bigint); server_at is the database clock.
-- Soft deletes only: nothing in the app issues DELETE and there are no delete policies.

create table public.hs_audits (
  id               uuid primary key,
  audit_no         text not null default '',
  contractor_wo    text not null default '',
  project_name     text not null default '',
  auditors         text not null default '',
  audit_date       date,
  contact_number   text not null default '',
  contractor_id    text references public.contractors(id),
  status           text not null default 'draft' check (status in ('draft', 'final', 'archived')),
  template_version text not null,
  last_export_at   bigint,
  deleted_at       bigint,
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_at       bigint not null,
  updated_by       uuid references auth.users(id),
  updated_at       bigint not null,
  field_at         jsonb not null default '{}'::jsonb,
  server_at        timestamptz not null default now()
);

create table public.hs_answers (
  audit_id   uuid not null references public.hs_audits(id) on delete cascade,
  item_id    text not null,
  result     text check (result in ('full', 'partial', 'no', 'na')),
  note       text not null default '',
  flagged    boolean not null default false,
  repeated   boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at bigint not null,
  field_at   jsonb not null default '{}'::jsonb,
  server_at  timestamptz not null default now(),
  primary key (audit_id, item_id)
);

create table public.hs_positives (
  id         uuid primary key,
  audit_id   uuid not null references public.hs_audits(id) on delete cascade,
  text       text not null default '',
  position   integer not null default 0,
  deleted_at bigint,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at bigint not null,
  updated_by uuid references auth.users(id),
  updated_at bigint not null,
  field_at   jsonb not null default '{}'::jsonb,
  server_at  timestamptz not null default now()
);

create table public.hs_photos (
  id           uuid primary key,
  audit_id     uuid not null references public.hs_audits(id) on delete cascade,
  owner_kind   text not null check (owner_kind in ('item', 'positive')),
  owner_id     text not null,
  mime         text not null default 'image/jpeg',
  bytes        integer not null,
  width        integer,
  height       integer,
  thumb        text,
  storage_path text not null,
  uploaded_at  bigint,
  deleted_at   bigint,
  created_by   uuid not null default auth.uid() references auth.users(id),
  created_at   bigint not null,
  updated_by   uuid references auth.users(id),
  updated_at   bigint not null,
  field_at     jsonb not null default '{}'::jsonb,
  server_at    timestamptz not null default now()
);

create index hs_audits_list_idx     on public.hs_audits (deleted_at, updated_at desc);
create index hs_audits_server_idx   on public.hs_audits (server_at);
create index hs_answers_audit_idx   on public.hs_answers (audit_id);
create index hs_answers_server_idx  on public.hs_answers (server_at);
create index hs_positives_audit_idx on public.hs_positives (audit_id);
create index hs_positives_server_idx on public.hs_positives (server_at);
create index hs_photos_audit_idx    on public.hs_photos (audit_id);
create index hs_photos_server_idx   on public.hs_photos (server_at);

-- server_at is the database clock on every write; it drives incremental pulls.
create or replace function public.hs_set_server_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_at := now();
  return new;
end $$;

create trigger hs_audits_server_at    before insert or update on public.hs_audits    for each row execute function public.hs_set_server_at();
create trigger hs_answers_server_at   before insert or update on public.hs_answers   for each row execute function public.hs_set_server_at();
create trigger hs_positives_server_at before insert or update on public.hs_positives for each row execute function public.hs_set_server_at();
create trigger hs_photos_server_at    before insert or update on public.hs_photos    for each row execute function public.hs_set_server_at();

alter table public.hs_audits    enable row level security;
alter table public.hs_answers   enable row level security;
alter table public.hs_positives enable row level security;
alter table public.hs_photos    enable row level security;

grant select, insert, update on public.hs_audits, public.hs_answers, public.hs_positives, public.hs_photos to authenticated;

-- Any member reads; auditors, leads and admins write. app_role() is null for outsiders and unconfirmed emails.
create policy "hs: team reads"      on public.hs_audits for select to authenticated using ((select public.app_role()) is not null);
create policy "hs: editors insert"  on public.hs_audits for insert to authenticated
  with check ((select public.app_role()) in ('auditor', 'lead', 'admin') and created_by = (select auth.uid()));
create policy "hs: editors update"  on public.hs_audits for update to authenticated
  using ((select public.app_role()) in ('auditor', 'lead', 'admin')) with check ((select public.app_role()) in ('auditor', 'lead', 'admin'));

create policy "hs: team reads"      on public.hs_answers for select to authenticated using ((select public.app_role()) is not null);
create policy "hs: editors insert"  on public.hs_answers for insert to authenticated with check ((select public.app_role()) in ('auditor', 'lead', 'admin'));
create policy "hs: editors update"  on public.hs_answers for update to authenticated
  using ((select public.app_role()) in ('auditor', 'lead', 'admin')) with check ((select public.app_role()) in ('auditor', 'lead', 'admin'));

create policy "hs: team reads"      on public.hs_positives for select to authenticated using ((select public.app_role()) is not null);
create policy "hs: editors insert"  on public.hs_positives for insert to authenticated
  with check ((select public.app_role()) in ('auditor', 'lead', 'admin') and created_by = (select auth.uid()));
create policy "hs: editors update"  on public.hs_positives for update to authenticated
  using ((select public.app_role()) in ('auditor', 'lead', 'admin')) with check ((select public.app_role()) in ('auditor', 'lead', 'admin'));

create policy "hs: team reads"      on public.hs_photos for select to authenticated using ((select public.app_role()) is not null);
create policy "hs: editors insert"  on public.hs_photos for insert to authenticated
  with check ((select public.app_role()) in ('auditor', 'lead', 'admin') and created_by = (select auth.uid()));
create policy "hs: editors update"  on public.hs_photos for update to authenticated
  using ((select public.app_role()) in ('auditor', 'lead', 'admin')) with check ((select public.app_role()) in ('auditor', 'lead', 'admin'));
