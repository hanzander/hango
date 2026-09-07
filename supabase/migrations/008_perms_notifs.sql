-- Wave 4: real role permissions + notification levels

-- Permission helper: owner OR role bitmask
create or replace function public.has_server_perm(p_server_id uuid, p_bit int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.servers s
    where s.id = p_server_id and s.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.member_roles mr
    join public.server_roles sr on sr.id = mr.role_id
    where mr.server_id = p_server_id
      and mr.user_id = auth.uid()
      and (sr.permissions & p_bit) <> 0
  );
$$;

grant execute on function public.has_server_perm(uuid, int) to authenticated;

-- Bits match src/lib/permissions.ts:
-- MANAGE_CHANNELS=1, KICK_MEMBERS=2, MANAGE_ROLES=4, MANAGE_MESSAGES=8

create or replace function public.kick_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_server_perm(p_server_id, 2) then
    raise exception 'Missing permission: Kick members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot kick yourself';
  end if;
  if exists (
    select 1 from public.servers s
    where s.id = p_server_id and s.owner_id = p_user_id
  ) then
    raise exception 'Cannot kick the server owner';
  end if;
  delete from public.server_members
  where server_id = p_server_id and user_id = p_user_id;
end;
$$;

create or replace function public.timeout_member(
  p_server_id uuid,
  p_user_id uuid,
  p_minutes int default 10
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_server_perm(p_server_id, 2) then
    raise exception 'Missing permission: Kick members';
  end if;
  if exists (
    select 1 from public.servers s
    where s.id = p_server_id and s.owner_id = p_user_id
  ) then
    raise exception 'Cannot timeout the server owner';
  end if;
  update public.server_members
  set timed_out_until = now() + make_interval(mins => greatest(1, p_minutes))
  where server_id = p_server_id and user_id = p_user_id;
end;
$$;

-- Roles: members with MANAGE_ROLES can manage
drop policy if exists "Owners can manage roles" on public.server_roles;
create policy "Owners can manage roles"
  on public.server_roles for all
  to authenticated
  using (public.has_server_perm(server_id, 4))
  with check (public.has_server_perm(server_id, 4));

drop policy if exists "Owners can assign roles" on public.member_roles;
create policy "Owners can assign roles"
  on public.member_roles for all
  to authenticated
  using (public.has_server_perm(server_id, 4))
  with check (public.has_server_perm(server_id, 4));

-- Soft-delete / edit others' messages with MANAGE_MESSAGES
drop policy if exists "Authors can update own messages" on public.messages;
create policy "Authors can update own messages"
  on public.messages for update
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_id and public.has_server_perm(c.server_id, 8)
    )
  )
  with check (
    author_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_id and public.has_server_perm(c.server_id, 8)
    )
  );

-- create_channel: require MANAGE_CHANNELS (or owner via helper)
create or replace function public.create_channel(
  p_server_id uuid,
  p_name text,
  p_kind text default 'text'
)
returns public.channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel public.channels;
  v_pos int;
  v_name text;
begin
  if not public.has_server_perm(p_server_id, 1) then
    raise exception 'Missing permission: Manage channels';
  end if;

  v_name := lower(trim(both from p_name));
  v_name := regexp_replace(v_name, '[^a-z0-9\- ]', '', 'g');
  v_name := regexp_replace(v_name, '\s+', '-', 'g');
  if v_name = '' then
    raise exception 'Invalid channel name';
  end if;
  if p_kind not in ('text', 'voice') then
    raise exception 'Invalid channel kind';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
  from public.channels
  where server_id = p_server_id;

  insert into public.channels (server_id, name, position, kind)
  values (p_server_id, v_name, v_pos, p_kind)
  returning * into v_channel;

  return v_channel;
end;
$$;

grant execute on function public.create_channel(uuid, text, text) to authenticated;

-- Notification levels on mute tables
alter table public.server_mutes
  add column if not exists notification_level text
    check (notification_level in ('all', 'mentions', 'nothing'));

alter table public.channel_mutes
  add column if not exists notification_level text
    check (notification_level in ('all', 'mentions', 'nothing'));

update public.server_mutes
set notification_level = 'nothing'
where notification_level is null;

update public.channel_mutes
set notification_level = 'nothing'
where notification_level is null;
