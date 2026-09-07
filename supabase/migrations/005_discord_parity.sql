-- Discord-parity schema expansions

-- Messages: edit / soft-delete / reply
alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

create index if not exists messages_reply_to_id_idx on public.messages (reply_to_id);

-- Reactions
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) >= 1 and char_length(emoji) <= 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_id_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "Members can view reactions" on public.message_reactions;
create policy "Members can view reactions"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.channels c on c.id = m.channel_id
      where m.id = message_id
        and public.is_server_member(c.server_id)
    )
  );

drop policy if exists "Members can add reactions" on public.message_reactions;
create policy "Members can add reactions"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      join public.channels c on c.id = m.channel_id
      where m.id = message_id
        and public.is_server_member(c.server_id)
    )
  );

drop policy if exists "Users can remove own reactions" on public.message_reactions;
create policy "Users can remove own reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- Allow authors to update/delete own messages
drop policy if exists "Authors can update own messages" on public.messages;
create policy "Authors can update own messages"
  on public.messages for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "Authors can delete own messages" on public.messages;
create policy "Authors can delete own messages"
  on public.messages for delete
  to authenticated
  using (author_id = auth.uid());

-- Profiles: status + bio
alter table public.profiles
  add column if not exists status text not null default 'online'
    check (status in ('online', 'idle', 'dnd', 'invisible')),
  add column if not exists custom_status text,
  add column if not exists bio text;

-- Channels: topic
alter table public.channels
  add column if not exists topic text;

-- Mutes
create table if not exists public.channel_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  muted_until timestamptz,
  primary key (user_id, channel_id)
);

create table if not exists public.server_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  muted_until timestamptz,
  primary key (user_id, server_id)
);

alter table public.channel_mutes enable row level security;
alter table public.server_mutes enable row level security;

drop policy if exists "Users manage own channel mutes" on public.channel_mutes;
create policy "Users manage own channel mutes"
  on public.channel_mutes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users manage own server mutes" on public.server_mutes;
create policy "Users manage own server mutes"
  on public.server_mutes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Create text/voice channel helper
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
  if not public.is_server_member(p_server_id) then
    raise exception 'Not a member of this server';
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

-- Allow members to insert channels (create_channel is security definer; also keep direct policy)
drop policy if exists "Members can create channels" on public.channels;
create policy "Members can create channels"
  on public.channels for insert
  to authenticated
  with check (public.is_server_member(server_id));
