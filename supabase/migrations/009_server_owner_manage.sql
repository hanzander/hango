-- Allow server owners to rename and delete their servers

drop policy if exists "Owners can update servers" on public.servers;
create policy "Owners can update servers"
  on public.servers for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can delete servers" on public.servers;
create policy "Owners can delete servers"
  on public.servers for delete
  using (auth.uid() = owner_id);
