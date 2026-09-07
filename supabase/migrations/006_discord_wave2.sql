-- Hango Discord wave 2: attachments, pins, friends, DMs, roles, threads

-- Allow empty message body when attachments/gifs carry the content
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages
  add constraint messages_content_check
  check (char_length(content) <= 2000);

alter table public.messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles (id) on delete set null,
  add column if not exists thread_id uuid,
  add column if not exists embed_json jsonb;

-- Attachments
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  url text not null,
  filename text not null,
  content_type text,
  size_bytes int,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

drop policy if exists "Members can view attachments" on public.message_attachments;
create policy "Members can view attachments"
  on public.message_attachments for select
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

drop policy if exists "Members can add attachments" on public.message_attachments;
create policy "Members can add attachments"
  on public.message_attachments for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.messages m
      join public.channels c on c.id = m.channel_id
      where m.id = message_id
        and m.author_id = auth.uid()
        and public.is_server_member(c.server_id)
    )
  );

-- Chat media bucket
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "Chat media is publicly accessible" on storage.objects;
create policy "Chat media is publicly accessible"
  on storage.objects for select
  using (bucket_id = 'chat-media');

drop policy if exists "Members can upload chat media" on storage.objects;
create policy "Members can upload chat media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own chat media" on storage.objects;
create policy "Users can delete own chat media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Friends
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

drop policy if exists "Users see own friendships" on public.friendships;
create policy "Users see own friendships"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "Users create friend requests" on public.friendships;
create policy "Users create friend requests"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid());

drop policy if exists "Users update own friendships" on public.friendships;
create policy "Users update own friendships"
  on public.friendships for update
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "Users delete own friendships" on public.friendships;
create policy "Users delete own friendships"
  on public.friendships for delete
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Direct message channels (1:1)
create table if not exists public.dm_channels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.dm_members (
  channel_id uuid not null references public.dm_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (channel_id, user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.dm_channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists dm_messages_channel_created_idx
  on public.dm_messages (channel_id, created_at);

alter table public.dm_channels enable row level security;
alter table public.dm_members enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "DM members can view channel" on public.dm_channels;
create policy "DM members can view channel"
  on public.dm_channels for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_members m
      where m.channel_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Auth can create DM channels" on public.dm_channels;
create policy "Auth can create DM channels"
  on public.dm_channels for insert
  to authenticated
  with check (true);

drop policy if exists "DM members can view members" on public.dm_members;
create policy "DM members can view members"
  on public.dm_members for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_members m
      where m.channel_id = channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Auth can add DM members" on public.dm_members;
create policy "Auth can add DM members"
  on public.dm_members for insert
  to authenticated
  with check (true);

drop policy if exists "DM members can view messages" on public.dm_messages;
create policy "DM members can view messages"
  on public.dm_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.dm_members m
      where m.channel_id = channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "DM members can send messages" on public.dm_messages;
create policy "DM members can send messages"
  on public.dm_messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.dm_members m
      where m.channel_id = channel_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Authors can update DM messages" on public.dm_messages;
create policy "Authors can update DM messages"
  on public.dm_messages for update
  to authenticated
  using (author_id = auth.uid());

-- Open or get existing 1:1 DM
create or replace function public.open_dm(p_other_user uuid)
returns public.dm_channels
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_channel public.dm_channels;
  v_existing uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user = v_me then
    raise exception 'Cannot DM yourself';
  end if;

  select dm.channel_id into v_existing
  from public.dm_members dm
  where dm.user_id = v_me
    and exists (
      select 1 from public.dm_members o
      where o.channel_id = dm.channel_id and o.user_id = p_other_user
    )
    and (
      select count(*) from public.dm_members c where c.channel_id = dm.channel_id
    ) = 2
  limit 1;

  if v_existing is not null then
    select * into v_channel from public.dm_channels where id = v_existing;
    return v_channel;
  end if;

  insert into public.dm_channels default values returning * into v_channel;
  insert into public.dm_members (channel_id, user_id) values
    (v_channel.id, v_me),
    (v_channel.id, p_other_user);

  return v_channel;
end;
$$;

grant execute on function public.open_dm(uuid) to authenticated;

-- Roles (basic)
create table if not exists public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  color text not null default '#99aab5',
  position int not null default 0,
  permissions int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.server_roles (id) on delete cascade,
  primary key (server_id, user_id, role_id),
  foreign key (server_id, user_id) references public.server_members (server_id, user_id) on delete cascade
);

alter table public.server_roles enable row level security;
alter table public.member_roles enable row level security;

drop policy if exists "Members can view roles" on public.server_roles;
create policy "Members can view roles"
  on public.server_roles for select
  to authenticated
  using (public.is_server_member(server_id));

drop policy if exists "Owners can manage roles" on public.server_roles;
create policy "Owners can manage roles"
  on public.server_roles for all
  to authenticated
  using (
    exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Members can view member roles" on public.member_roles;
create policy "Members can view member roles"
  on public.member_roles for select
  to authenticated
  using (public.is_server_member(server_id));

drop policy if exists "Owners can assign roles" on public.member_roles;
create policy "Owners can assign roles"
  on public.member_roles for all
  to authenticated
  using (
    exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  );

-- Light threads: reply chains tagged by root message
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  root_message_id uuid not null references public.messages (id) on delete cascade,
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.threads enable row level security;

drop policy if exists "Members can view threads" on public.threads;
create policy "Members can view threads"
  on public.threads for select
  to authenticated
  using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.is_server_member(c.server_id)
    )
  );

drop policy if exists "Members can create threads" on public.threads;
create policy "Members can create threads"
  on public.threads for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.channels c
      where c.id = channel_id and public.is_server_member(c.server_id)
    )
  );

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_attachments;
exception when duplicate_object then null;
end $$;
