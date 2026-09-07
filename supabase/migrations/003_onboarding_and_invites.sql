-- Onboarding profile fields, invite codes, create/join RPCs, avatar storage

-- Profiles
alter table public.profiles
  add column if not exists username text,
  add column if not exists onboarding_complete boolean not null default false;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

-- Servers: invite codes
alter table public.servers
  add column if not exists invite_code text;

create unique index if not exists servers_invite_code_unique
  on public.servers (invite_code)
  where invite_code is not null;

-- Backfill invite codes for existing servers
update public.servers
set invite_code = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where invite_code is null;

alter table public.servers
  alter column invite_code set not null;

-- Helper: random invite code
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.servers where invite_code = code);
  end loop;
  return code;
end;
$$;

-- Create a server + default #general + membership
create or replace function public.create_server(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_server_id uuid;
  v_name text := trim(p_name);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'Server name must be 2–40 characters';
  end if;

  insert into public.servers (name, owner_id, invite_code)
  values (v_name, v_user_id, public.generate_invite_code())
  returning id into v_server_id;

  insert into public.server_members (server_id, user_id)
  values (v_server_id, v_user_id);

  insert into public.channels (server_id, name, position)
  values (v_server_id, 'general', 0);

  return v_server_id;
end;
$$;

grant execute on function public.create_server(text) to authenticated;

-- Join by invite code
create or replace function public.join_server_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_server_id uuid;
  v_code text := lower(trim(p_code));
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_code is null or char_length(v_code) < 4 then
    raise exception 'Invalid invite code';
  end if;

  select id into v_server_id
  from public.servers
  where invite_code = v_code;

  if v_server_id is null then
    raise exception 'Invite not found';
  end if;

  insert into public.server_members (server_id, user_id)
  values (v_server_id, v_user_id)
  on conflict do nothing;

  return v_server_id;
end;
$$;

grant execute on function public.join_server_by_invite(text) to authenticated;

-- Complete onboarding
create or replace function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := lower(trim(p_username));
  v_display text := trim(p_display_name);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3–20 chars: a-z, 0-9, underscore';
  end if;
  if v_display is null or char_length(v_display) < 1 or char_length(v_display) > 32 then
    raise exception 'Display name must be 1–32 characters';
  end if;
  if exists (
    select 1 from public.profiles
    where lower(username) = v_username and id <> v_user_id
  ) then
    raise exception 'Username taken';
  end if;

  update public.profiles
  set
    username = v_username,
    display_name = v_display,
    avatar_url = nullif(trim(p_avatar_url), ''),
    onboarding_complete = true
  where id = v_user_id;
end;
$$;

grant execute on function public.complete_onboarding(text, text, text) to authenticated;

-- Avatars storage
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow members to read invite_code of their servers (already covered by select policy)
