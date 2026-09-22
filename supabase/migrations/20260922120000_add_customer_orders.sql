-- Neue, eigenständige Tabellen für die Kunden-Bestellfunktion.
-- WICHTIG: Diese Migration wurde bewusst NICHT automatisch ausgeführt
-- (siehe AGENTS.md: "Produktionsmigrationen nicht allein wegen einer
-- Codeänderung automatisch ausführen"). Sie verändert keine bestehende
-- Tabelle, keinen bestehenden Datensatz und keine bestehende Zugriffsregel.
-- Erst nach ausdrücklicher Freigabe auf der Live-Datenbank ausführen und
-- danach `ORDER_TEST_MODE` in src/order-data.js auf false stellen.

create table if not exists public.chili_freigaben (
  chili_id text primary key references public.chilis(id) on delete cascade,
  freigegeben boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.bestellanfragen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kontakt text not null,
  nachricht text,
  status text not null default 'angefragt' check (status in ('angefragt', 'bestaetigt', 'storniert')),
  created_at timestamptz not null default now(),
  entschieden_am timestamptz
);

create table if not exists public.bestellanfragen_positionen (
  id uuid primary key default gen_random_uuid(),
  anfrage_id uuid not null references public.bestellanfragen(id) on delete cascade,
  chili_id text references public.chilis(id) on delete set null,
  chili_name text not null,
  menge integer not null check (menge > 0)
);

alter table public.chili_freigaben enable row level security;
alter table public.bestellanfragen enable row level security;
alter table public.bestellanfragen_positionen enable row level security;

-- Freigaben sind nicht vertraulich: alle dürfen lesen, nur angemeldete
-- Nutzer (Papa) dürfen sie ändern.
create policy "Freigaben oeffentlich lesbar" on public.chili_freigaben
  for select using (true);
create policy "Freigaben nur eingeloggt aenderbar" on public.chili_freigaben
  for insert to authenticated with check (true);
create policy "Freigaben nur eingeloggt updatebar" on public.chili_freigaben
  for update to authenticated using (true) with check (true);
create policy "Freigaben nur eingeloggt loeschbar" on public.chili_freigaben
  for delete to authenticated using (true);

-- Bestellanfragen enthalten Kontaktdaten: Besucher dürfen nur anlegen,
-- lesen/ändern/löschen darf ausschließlich Papa (eingeloggt).
create policy "Anfragen oeffentlich anlegbar" on public.bestellanfragen
  for insert to anon, authenticated with check (status = 'angefragt');
create policy "Anfragen nur eingeloggt lesbar" on public.bestellanfragen
  for select to authenticated using (true);
create policy "Anfragen nur eingeloggt updatebar" on public.bestellanfragen
  for update to authenticated using (true) with check (true);
create policy "Anfragen nur eingeloggt loeschbar" on public.bestellanfragen
  for delete to authenticated using (true);

create policy "Positionen oeffentlich anlegbar" on public.bestellanfragen_positionen
  for insert to anon, authenticated with check (true);
create policy "Positionen nur eingeloggt lesbar" on public.bestellanfragen_positionen
  for select to authenticated using (true);
create policy "Positionen nur eingeloggt loeschbar" on public.bestellanfragen_positionen
  for delete to authenticated using (true);
