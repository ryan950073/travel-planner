-- Run once in your Supabase project's SQL Editor.
-- The table is outside the exposed public schema; browser clients use only the three RPC wrappers below.

create schema if not exists trip_private;

create table if not exists trip_private.trips (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  access_token uuid not null default pg_catalog.gen_random_uuid(),
  data jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table trip_private.trips enable row level security;
revoke all on schema trip_private from public;
revoke all on trip_private.trips from public, anon, authenticated;

create or replace function trip_private.valid_trip(p_data jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then return false; end if;
  if pg_catalog.length(p_data::text) > 100000 then return false; end if;
  if coalesce(pg_catalog.length(pg_catalog.btrim(p_data->>'title')), 0) not between 1 and 80 then return false; end if;
  if coalesce(pg_catalog.length(pg_catalog.btrim(p_data->>'destination')), 0) not between 1 and 80 then return false; end if;
  if pg_catalog.jsonb_typeof(p_data->'days') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(p_data->'days') not between 1 and 30 then return false; end if;
  return true;
end;
$$;

create or replace function trip_private.create_trip(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_token uuid;
begin
  if not trip_private.valid_trip(p_data) then
    raise exception 'Invalid trip data';
  end if;

  insert into trip_private.trips (data) values (p_data)
    returning id, access_token into v_id, v_token;
  return pg_catalog.jsonb_build_object('id', v_id, 'token', v_token, 'revision', 1);
end;
$$;

create or replace function trip_private.get_trip(p_trip_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data jsonb;
  v_revision integer;
begin
  select data, revision into v_data, v_revision
  from trip_private.trips
  where id = p_trip_id and access_token = p_token;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('trip', v_data, 'revision', v_revision);
end;
$$;

create or replace function trip_private.update_trip(
  p_trip_id uuid, p_token uuid, p_data jsonb, p_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision integer;
begin
  if p_revision is null or p_revision < 1 then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if not trip_private.valid_trip(p_data) then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  update trip_private.trips
  set data = p_data, revision = revision + 1, updated_at = pg_catalog.now()
  where id = p_trip_id and access_token = p_token and revision = p_revision
  returning revision into v_revision;
  if found then
    return pg_catalog.jsonb_build_object('status', 'updated', 'revision', v_revision);
  end if;
  if exists (select 1 from trip_private.trips where id = p_trip_id and access_token = p_token) then
    return pg_catalog.jsonb_build_object('status', 'conflict');
  end if;
  return pg_catalog.jsonb_build_object('status', 'not_found');
end;
$$;

create or replace function public.trip_create(p_data jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select trip_private.create_trip(p_data); $$;

create or replace function public.trip_get(p_trip_id uuid, p_token uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select trip_private.get_trip(p_trip_id, p_token); $$;

create or replace function public.trip_update(
  p_trip_id uuid, p_token uuid, p_data jsonb, p_revision integer
)
returns jsonb language sql security invoker set search_path = ''
as $$ select trip_private.update_trip(p_trip_id, p_token, p_data, p_revision); $$;

revoke execute on function trip_private.valid_trip(jsonb) from public;
revoke execute on function trip_private.create_trip(jsonb) from public;
revoke execute on function trip_private.get_trip(uuid, uuid) from public;
revoke execute on function trip_private.update_trip(uuid, uuid, jsonb, integer) from public;
revoke execute on function public.trip_create(jsonb) from public;
revoke execute on function public.trip_get(uuid, uuid) from public;
revoke execute on function public.trip_update(uuid, uuid, jsonb, integer) from public;

grant usage on schema trip_private to anon;
grant execute on function trip_private.create_trip(jsonb) to anon;
grant execute on function trip_private.get_trip(uuid, uuid) to anon;
grant execute on function trip_private.update_trip(uuid, uuid, jsonb, integer) to anon;
grant execute on function public.trip_create(jsonb) to anon;
grant execute on function public.trip_get(uuid, uuid) to anon;
grant execute on function public.trip_update(uuid, uuid, jsonb, integer) to anon;
