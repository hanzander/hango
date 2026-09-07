-- Hango initial schema: profiles, servers, channels, messages + RLS

create extension if not exists "pgcrypto";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Servers
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon_url text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Membership
create table if not exists public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

-- Channels
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists channels_server_id_idx on public.channels (server_id);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_id_created_at_idx
  on public.messages (channel_id, created_at);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1),
      'User'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is member of server
create or replace function public.is_server_member(p_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.server_members sm
    where sm.server_id = p_server_id
      and sm.user_id = auth.uid()
  );
$$;

create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.channels c
    join public.server_members sm on sm.server_id = c.server_id
    where c.id = p_channel_id
      and sm.user_id = auth.uid()
  );
$$;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;

-- Profiles policies
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Servers: members can read
create policy "Members can view servers"
  on public.servers for select
  to authenticated
  using (public.is_server_member(id));

create policy "Authenticated users can create servers"
  on public.servers for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- Server members
create policy "Members can view membership"
  on public.server_members for select
  to authenticated
  using (public.is_server_member(server_id) or user_id = auth.uid());

create policy "Users can join servers"
  on public.server_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- Channels
create policy "Members can view channels"
  on public.channels for select
  to authenticated
  using (public.is_server_member(server_id));

create policy "Members can create channels"
  on public.channels for insert
  to authenticated
  with check (public.is_server_member(server_id));

-- Messages
create policy "Members can view messages"
  on public.messages for select
  to authenticated
  using (public.is_channel_member(channel_id));

create policy "Members can send messages"
  on public.messages for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_channel_member(channel_id)
  );

-- Realtime
alter publication supabase_realtime add table public.messages;

-- Seed helper: run after first user signs up, or use seed.sql with service role
-- See supabase/seed.sql for joining the lounge.
