-- WICHTIG: Erst ausrollen, nachdem mindestens ein Supabase-Auth-Benutzer
-- angelegt und der Login in der App aktiviert wurde. Die bisherige Konfiguration
-- erlaubt der Rolle PUBLIC vollständigen Zugriff auf alle Daten und Fotos.

create table if not exists public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_owners enable row level security;
revoke all on public.app_owners from anon, authenticated;
grant select on public.app_owners to authenticated;
create policy "owner can read own allowlist entry" on public.app_owners
  for select to authenticated using (user_id = (select auth.uid()));

-- Vor dem Fortsetzen einmalig den eigenen Benutzer eintragen:
-- insert into public.app_owners (user_id) values ('UUID-AUS-AUTH-USERS');

drop policy if exists "public full access chilis" on public.chilis;
drop policy if exists "public full access bestellungen" on public.bestellungen;
drop policy if exists "chili_reference_all" on public.chili_reference;

create policy "authenticated chili access" on public.chilis
  for all to authenticated
  using (exists (select 1 from public.app_owners where user_id = (select auth.uid())))
  with check (exists (select 1 from public.app_owners where user_id = (select auth.uid())));
create policy "authenticated order access" on public.bestellungen
  for all to authenticated
  using (exists (select 1 from public.app_owners where user_id = (select auth.uid())))
  with check (exists (select 1 from public.app_owners where user_id = (select auth.uid())));
create policy "authenticated reference access" on public.chili_reference
  for all to authenticated
  using (exists (select 1 from public.app_owners where user_id = (select auth.uid())))
  with check (exists (select 1 from public.app_owners where user_id = (select auth.uid())));

drop policy if exists "public delete chili-fotos" on storage.objects;
drop policy if exists "public read chili-fotos" on storage.objects;
drop policy if exists "public update chili-fotos" on storage.objects;
drop policy if exists "public upload chili-fotos" on storage.objects;

create policy "authenticated read chili-fotos" on storage.objects
  for select to authenticated using (bucket_id = 'chili-fotos' and exists (select 1 from public.app_owners where user_id = (select auth.uid())));
create policy "authenticated upload chili-fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'chili-fotos' and exists (select 1 from public.app_owners where user_id = (select auth.uid())));
create policy "authenticated update chili-fotos" on storage.objects
  for update to authenticated using (bucket_id = 'chili-fotos' and exists (select 1 from public.app_owners where user_id = (select auth.uid())))
  with check (bucket_id = 'chili-fotos' and exists (select 1 from public.app_owners where user_id = (select auth.uid())));
create policy "authenticated delete chili-fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'chili-fotos' and exists (select 1 from public.app_owners where user_id = (select auth.uid())));
