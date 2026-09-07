-- Call after 001_init.sql
-- Provides a shared lounge every authenticated user can join.

create or replace function public.ensure_hango_lounge()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_server_id
  from public.servers
  where name = 'Hango Lounge'
  order by created_at
  limit 1;

  if v_server_id is null then
    insert into public.servers (name, owner_id)
    values ('Hango Lounge', v_user_id)
    returning id into v_server_id;

    insert into public.channels (server_id, name, position)
    values
      (v_server_id, 'general', 0),
      (v_server_id, 'random', 1);
  end if;

  insert into public.server_members (server_id, user_id)
  values (v_server_id, v_user_id)
  on conflict do nothing;

  return v_server_id;
end;
$$;

grant execute on function public.ensure_hango_lounge() to authenticated;
