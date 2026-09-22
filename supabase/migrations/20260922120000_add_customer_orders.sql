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
  menge integer not null check (menge > 0 and menge <= 99)
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

-- Bestellanfragen enthalten Kontaktdaten: Besucher legen NICHT direkt in
-- diesen Tabellen an (sonst könnten sie über PostgREST auch versuchen, die
-- gerade angelegte Zeile zurückzulesen, was die Leserechte-Policy unten
-- verweigert und den Insert wirkungslos macht). Stattdessen läuft das
-- Anlegen ausschließlich über die Funktion submit_bestellanfrage() weiter
-- unten, die Anfrage und Positionen in einer Transaktion anlegt und nichts
-- zurückgibt. Lesen/ändern/löschen bleibt Papa (eingeloggt) vorbehalten.
create policy "Anfragen nur eingeloggt lesbar" on public.bestellanfragen
  for select to authenticated using (true);
create policy "Anfragen nur eingeloggt updatebar" on public.bestellanfragen
  for update to authenticated using (true) with check (true);
create policy "Anfragen nur eingeloggt loeschbar" on public.bestellanfragen
  for delete to authenticated using (true);

create policy "Positionen nur eingeloggt lesbar" on public.bestellanfragen_positionen
  for select to authenticated using (true);
create policy "Positionen nur eingeloggt loeschbar" on public.bestellanfragen_positionen
  for delete to authenticated using (true);

-- Einzige Möglichkeit für Besucher, eine Bestellanfrage anzulegen: läuft
-- mit den Rechten des Funktionseigentümers (SECURITY DEFINER), prüft und
-- begrenzt die Eingaben selbst und legt Anfrage + Positionen atomar an.
create or replace function public.submit_bestellanfrage(
  p_name text,
  p_kontakt text,
  p_nachricht text,
  p_positionen jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anfrage_id uuid;
  v_position jsonb;
  v_menge integer;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name fehlt';
  end if;
  if p_kontakt is null or btrim(p_kontakt) = '' then
    raise exception 'Kontakt fehlt';
  end if;
  if p_positionen is null or jsonb_array_length(p_positionen) = 0 then
    raise exception 'Keine Bestellpositionen';
  end if;

  insert into public.bestellanfragen (name, kontakt, nachricht, status)
  values (btrim(p_name), btrim(p_kontakt), nullif(btrim(coalesce(p_nachricht, '')), ''), 'angefragt')
  returning id into v_anfrage_id;

  for v_position in select * from jsonb_array_elements(p_positionen)
  loop
    v_menge := greatest(1, least(99, (v_position->>'menge')::integer));
    insert into public.bestellanfragen_positionen (anfrage_id, chili_id, chili_name, menge)
    values (v_anfrage_id, v_position->>'chiliId', v_position->>'chiliName', v_menge);
  end loop;
end;
$$;

grant execute on function public.submit_bestellanfrage(text, text, text, jsonb) to anon, authenticated;

-- Push-Benachrichtigungen für die Admin-Oberfläche: je eingeloggtem Gerät
-- eine Zeile mit den Browser-Zugangsdaten für den Web-Push-Versand
-- (RFC 8291). Enthält keine Bestell- oder Kontaktdaten. Nur eingeloggte
-- Nutzer (Papa) dürfen eigene Geräte registrieren/entfernen; gelesen wird
-- diese Tabelle ausschließlich serverseitig von der Edge Function
-- notify-new-order (mit dem Service-Role-Key, umgeht RLS regulär).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Push-Geraete nur eingeloggt anlegbar" on public.push_subscriptions
  for insert to authenticated with check (true);
create policy "Push-Geraete nur eingeloggt loeschbar" on public.push_subscriptions
  for delete to authenticated using (true);
