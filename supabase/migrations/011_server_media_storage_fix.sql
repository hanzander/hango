-- Fix server-media storage: simpler policies (same pattern as server-emoji)

insert into storage.buckets (id, name, public)
values ('server-media', 'server-media', true)
on conflict (id) do nothing;

alter table public.servers
  add column if not exists banner_url text;

drop policy if exists "Server media public read" on storage.objects;
drop policy if exists "Owners upload server media" on storage.objects;
drop policy if exists "Owners update server media" on storage.objects;
drop policy if exists "Owners delete server media" on storage.objects;
drop policy if exists "Server media public" on storage.objects;
drop policy if exists "Auth upload server media" on storage.objects;
drop policy if exists "Auth update server media" on storage.objects;
drop policy if exists "Auth delete server media" on storage.objects;

create policy "Server media public"
  on storage.objects for select
  using (bucket_id = 'server-media');

create policy "Auth upload server media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'server-media');

create policy "Auth update server media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'server-media');

create policy "Auth delete server media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'server-media');
