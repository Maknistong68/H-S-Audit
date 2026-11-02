-- Evidence photos: a private bucket, one JPEG per photo at "<audit_id>/<photo_id>.jpg".
-- Photos are immutable; removal is the row's deleted_at, so there are no update or delete policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hs-photos', 'hs-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy "hs photos: team reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'hs-photos' and (select public.app_role()) is not null);

create policy "hs photos: editors upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hs-photos' and (select public.app_role()) in ('auditor', 'lead', 'admin'));
