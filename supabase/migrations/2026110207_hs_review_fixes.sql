-- Review fixes:
-- 1. server_at from clock_timestamp(): rows written in one transaction no longer all share one stamp, so paging
--    by server_at rarely meets ties (the client also pages inclusively across any that remain).
-- 2. hs_apply clamps a change whose timestamp is more than a minute ahead of the server to server time, so a
--    phone with a fast clock cannot stamp fields that nobody else can ever overwrite.
-- 3. hs_apply refuses key objects with columns other than the key columns.

create or replace function public.hs_set_server_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_at := clock_timestamp();
  return new;
end $$;

create or replace function public.hs_apply(changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  change       jsonb;
  tbl          text;
  key          jsonb;
  fields       jsonb;
  at           bigint;
  allowed      text[];
  key_columns  text[];
  bad          text;
  where_sql    text;
  existing     jsonb;
  field_at     jsonb;
  new_fields   jsonb;
  new_field_at jsonb;
  payload      jsonb;
  k            text;
  applied      integer := 0;
  skipped      integer := 0;
  row_applied  integer;
  uid          uuid := auth.uid();
  now_ms       bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  grace_ms     constant bigint := 60000;
begin
  if changes is null or jsonb_typeof(changes) <> 'array' then
    raise exception 'changes must be an array' using errcode = 'P0001';
  end if;

  for change in select value from jsonb_array_elements(changes) loop
    tbl    := change->>'table';
    key    := change->'key';
    fields := change->'fields';
    at     := nullif(change->>'at', '')::bigint;

    allowed := case tbl
      when 'hs_audits'    then array['audit_no', 'contractor_wo', 'project_name', 'auditors', 'audit_date', 'contact_number', 'contractor_id',
                                     'status', 'template_version', 'last_export_at', 'deleted_at', 'created_at']
      when 'hs_answers'   then array['result', 'note', 'flagged', 'repeated']
      when 'hs_positives' then array['audit_id', 'text', 'position', 'deleted_at', 'created_at']
      when 'hs_photos'    then array['audit_id', 'owner_kind', 'owner_id', 'mime', 'bytes', 'width', 'height', 'thumb', 'storage_path',
                                     'uploaded_at', 'deleted_at', 'created_at']
      else null end;
    if allowed is null then
      raise exception 'unknown table %', coalesce(tbl, '(none)') using errcode = 'P0001';
    end if;
    if key is null or jsonb_typeof(key) <> 'object' or fields is null or jsonb_typeof(fields) <> 'object' or at is null or at <= 0 then
      raise exception 'malformed change for %', tbl using errcode = 'P0001';
    end if;
    select f into bad from jsonb_object_keys(fields) f where not (f = any(allowed)) limit 1;
    if bad is not null then
      raise exception 'field % is not allowed on %', bad, tbl using errcode = 'P0001';
    end if;

    key_columns := case when tbl = 'hs_answers' then array['audit_id', 'item_id'] else array['id'] end;
    select f into bad from jsonb_object_keys(key) f where not (f = any(key_columns)) limit 1;
    if bad is not null then
      raise exception 'key column % is not allowed on %', bad, tbl using errcode = 'P0001';
    end if;

    -- A clock more than a minute ahead of the server is clamped: its fields stay editable by everyone.
    if at > now_ms + grace_ms then
      at := now_ms;
    end if;

    -- Key columns are always qualified with the table alias t: the UPDATE below joins a second relation.
    if tbl = 'hs_answers' then
      if not (key ? 'audit_id' and key ? 'item_id') then
        raise exception 'hs_answers key needs audit_id and item_id' using errcode = 'P0001';
      end if;
      where_sql := format('t.audit_id = %L::uuid and t.item_id = %L', key->>'audit_id', key->>'item_id');
    else
      if not (key ? 'id') then
        raise exception '% key needs id', tbl using errcode = 'P0001';
      end if;
      where_sql := format('t.id = %L::uuid', key->>'id');
    end if;

    execute format('select to_jsonb(t) from public.%I t where %s for update', tbl, where_sql) into existing;

    if existing is null then
      select coalesce(jsonb_object_agg(f, to_jsonb(at)), '{}'::jsonb) into new_field_at from jsonb_object_keys(fields) f;
      payload := key || fields || jsonb_build_object('updated_at', at, 'updated_by', uid, 'field_at', new_field_at);
      execute format(
        'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L::jsonb) r',
        tbl,
        (select string_agg(format('%I', c), ', ') from jsonb_object_keys(payload) c),
        (select string_agg(format('r.%I', c), ', ') from jsonb_object_keys(payload) c),
        tbl,
        payload::text
      );
      applied := applied + (select count(*) from jsonb_object_keys(fields));
    else
      field_at     := coalesce(existing->'field_at', '{}'::jsonb);
      new_fields   := '{}'::jsonb;
      new_field_at := field_at;
      row_applied  := 0;
      for k in select f from jsonb_object_keys(fields) f loop
        if at > coalesce((field_at->>k)::bigint, 0) then
          new_fields   := new_fields || jsonb_build_object(k, fields->k);
          new_field_at := new_field_at || jsonb_build_object(k, at);
          row_applied  := row_applied + 1;
        else
          skipped := skipped + 1;
        end if;
      end loop;
      if row_applied > 0 then
        payload := new_fields || jsonb_build_object(
          'updated_at', greatest(coalesce((existing->>'updated_at')::bigint, 0), at),
          'updated_by', uid,
          'field_at', new_field_at);
        execute format(
          'update public.%I t set %s from jsonb_populate_record(null::public.%I, %L::jsonb) r where %s',
          tbl,
          (select string_agg(format('%I = r.%I', c, c), ', ') from jsonb_object_keys(payload) c),
          tbl,
          payload::text,
          where_sql
        );
        applied := applied + row_applied;
      end if;
    end if;
  end loop;

  return jsonb_build_object('applied', applied, 'skipped', skipped);
end $$;
