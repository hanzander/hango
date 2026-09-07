-- Voice channels + update create_server defaults

alter table public.channels
  add column if not exists kind text not null default 'text';

alter table public.channels
  drop constraint if exists channels_kind_check;

alter table public.channels
  add constraint channels_kind_check
  check (kind in ('text', 'voice'));

-- Existing channels stay text; ensure at least one voice lounge per server missing one
insert into public.channels (server_id, name, position, kind)
select s.id, 'Lounge', coalesce((select max(c.position) + 1 from public.channels c where c.server_id = s.id), 1), 'voice'
from public.servers s
where not exists (
  select 1 from public.channels c where c.server_id = s.id and c.kind = 'voice'
);

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

  insert into public.channels (server_id, name, position, kind)
  values
    (v_server_id, 'general', 0, 'text'),
    (v_server_id, 'Lounge', 1, 'voice');

  return v_server_id;
end;
$$;
