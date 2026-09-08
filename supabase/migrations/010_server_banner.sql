-- Server cover / banner (Discord-style)

alter table public.servers
  add column if not exists banner_url text;

insert into storage.buckets (id, name, public)
values ('server-media', 'server-media', true)
on conflict (id) do nothing;

drop policy if exists "Server media public read" on storage.objects;
create policy "Server media public read"
  on storage.objects for select
  using (bucket_id = 'server-media');

drop policy if exists "Owners upload server media" on storage.objects;
create policy "Owners upload server media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'server-media'
    and exists (
      select 1 from public.servers s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners update server media" on storage.objects;
create policy "Owners update server media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'server-media'
    and exists (
      select 1 from public.servers s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners delete server media" on storage.objects;
create policy "Owners delete server media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'server-media'
    and exists (
      select 1 from public.servers s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = auth.uid()
    )
  );
