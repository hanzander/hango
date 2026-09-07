-- Wave 3: emoji, invites, moderation, unreads

-- Server invite controls
alter table public.servers
  add column if not exists invite_expires_at timestamptz,
  add column if not exists invite_max_uses int,
  add column if not exists invite_uses int not null default 0;

-- Member timeout
alter table public.server_members
  add column if not exists timed_out_until timestamptz,
  add column if not exists nickname text;

-- Unread markers
create table if not exists public.channel_read_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

alter table public.channel_read_state enable row level security;

drop policy if exists "Users manage own read state" on public.channel_read_state;
create policy "Users manage own read state"
  on public.channel_read_state for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Custom server emoji
create table if not exists public.server_emoji (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);

alter table public.server_emoji enable row level security;

drop policy if exists "Members can view emoji" on public.server_emoji;
create policy "Members can view emoji"
  on public.server_emoji for select
  to authenticated
  using (public.is_server_member(server_id));

drop policy if exists "Owners manage emoji" on public.server_emoji;
create policy "Owners manage emoji"
  on public.server_emoji for all
  to authenticated
  using (
    exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
  );

insert into storage.buckets (id, name, public)
values ('server-emoji', 'server-emoji', true)
on conflict (id) do nothing;

drop policy if exists "Server emoji public" on storage.objects;
create policy "Server emoji public"
  on storage.objects for select
  using (bucket_id = 'server-emoji');

drop policy if exists "Auth upload server emoji" on storage.objects;
create policy "Auth upload server emoji"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'server-emoji');

-- Owner can kick members
drop policy if exists "Owners can remove members" on public.server_members;
create policy "Owners can remove members"
  on public.server_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can update members" on public.server_members;
create policy "Owners can update members"
  on public.server_members for update
  to authenticated
  using (
    exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  );

-- Channel topic update by members
drop policy if exists "Members can update channels" on public.channels;
create policy "Members can update channels"
  on public.channels for update
  to authenticated
  using (public.is_server_member(server_id))
  with check (public.is_server_member(server_id));

-- Join invite respects expiry / max uses
create or replace function public.join_server_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text := lower(trim(p_code));
  v_server public.servers;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_server
  from public.servers
  where invite_code = v_code;

  if v_server.id is null then
    raise exception 'Invalid invite code';
  end if;

  if v_server.invite_expires_at is not null and v_server.invite_expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if v_server.invite_max_uses is not null and v_server.invite_uses >= v_server.invite_max_uses then
    raise exception 'Invite has reached max uses';
  end if;

  insert into public.server_members (server_id, user_id)
  values (v_server.id, v_user_id)
  on conflict do nothing;

  update public.servers
  set invite_uses = invite_uses + 1
  where id = v_server.id;

  return v_server.id;
end;
$$;

-- Kick helper
create or replace function public.kick_member(p_server_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.servers s where s.id = p_server_id and s.owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can kick';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Cannot kick yourself';
  end if;
  delete from public.server_members
  where server_id = p_server_id and user_id = p_user_id;
end;
$$;

grant execute on function public.kick_member(uuid, uuid) to authenticated;

-- Timeout helper
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
  if not exists (
    select 1 from public.servers s where s.id = p_server_id and s.owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can timeout';
  end if;
  update public.server_members
  set timed_out_until = now() + make_interval(mins => greatest(1, p_minutes))
  where server_id = p_server_id and user_id = p_user_id;
end;
$$;

grant execute on function public.timeout_member(uuid, uuid, int) to authenticated;

-- Block timed-out users from sending (trigger)
create or replace function public.enforce_timeout_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
  v_server uuid;
begin
  select c.server_id into v_server from public.channels c where c.id = new.channel_id;
  select timed_out_until into v_until
  from public.server_members
  where server_id = v_server and user_id = new.author_id;

  if v_until is not null and v_until > now() then
    raise exception 'You are timed out until %', v_until;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_enforce_timeout on public.messages;
create trigger messages_enforce_timeout
  before insert on public.messages
  for each row execute function public.enforce_timeout_on_message();
