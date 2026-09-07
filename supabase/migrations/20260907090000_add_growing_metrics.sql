alter table public.chilis
  add column if not exists ausgesaet integer not null default 0 check (ausgesaet >= 0),
  add column if not exists gekeimt integer not null default 0 check (gekeimt >= 0),
  add column if not exists ernte_gewicht_g numeric(10,2) not null default 0 check (ernte_gewicht_g >= 0),
  add constraint chilis_gekeimt_lte_ausgesaet check (gekeimt <= ausgesaet or ausgesaet = 0);

comment on column public.chilis.ausgesaet is 'Anzahl ausgesäter Samen';
comment on column public.chilis.gekeimt is 'Anzahl gekeimter Samen';
comment on column public.chilis.ernte_gewicht_g is 'Gesamtes Erntegewicht dieser Pflanze/Saison in Gramm';
