# App-Übersicht

Stand: 7. September 2026

## Zweck

„Opa Reiters Chili Sammlung“ ist eine installierbare, browserbasierte Verwaltung
für Chili-Pflanzen und Saatgutbestellungen. Daten und Fotos liegen in Supabase.
Die App läuft ohne Build-Schritt als statische GitHub-Pages-Anwendung.

## Einstiegspunkte

| Datei | Aufgabe |
| --- | --- |
| `index.html` | Seitenstruktur, Formulare, Modals und Script-Reihenfolge |
| `style.css` | Gesamtes responsives Ember-Design einschließlich Druckansicht |
| `app.js` | Bestehende UI- und Fachlogik; schrittweise weiter modularisieren |
| `config.js` | Öffentliche Supabase-URL und Publishable Key; keine Secrets |
| `manifest.json` | Metadaten für Installation am Home-Bildschirm |

## Module unter `src/`

| Modul | Zuständigkeit |
| --- | --- |
| `core.js` | Jahresoptionen, IDs, HTML-Escaping, Downloads und Kennzahlen |
| `data-service.js` | Supabase-Client sowie CRUD für Chilis und Bestellungen |
| `lazy-load.js` | Bedarfsgesteuertes Laden von Chart.js, Tesseract und XLSX |
| `auth.js` | Passwortloser E-Mail-Login vor dem Laden der privaten Daten |

## Hauptfunktionen

- Chili-Sammlung als Kachel- oder Listenansicht
- Jahre, Status, Schärfegrad, Geschmack, Suche und Sortierung
- Gemeinsame Sortendaten über mehrere Anbaujahre
- Pflanzenfotos mit Komprimierung und Galerie
- QR-Etiketten, Deep Links und Kamera-Scanner
- Samentütchen-Texterkennung
- Bestellverwaltung
- Mehrfachauswahl, Sammelbearbeitung und CSV-Export
- JSON-Backup/Import sowie Excel-Import
- Sortenreferenzdatenbank mit Vorschlägen
- Statistik einschließlich Keimquote und gesamtem Erntegewicht

## Chili-Datenmodell

Tabelle `public.chilis`, Primärschlüssel `id` (Text).

| Bereich | Felder |
| --- | --- |
| Identität | `id`, `nr`, `name`, `jahr` |
| Sorte | `sorte`, `art`, `herkunft`, `sg`, `scoville` |
| Saison | `status`, `pflanzdatum`, `erntedatum`, `erntenotizen`, `notizen` |
| Messwerte | `ausgesaet`, `gekeimt`, `ernte_gewicht_g` |
| Bewertung | `geschmack`, `geschmack_tags` |
| Medien | `fotos` als Array öffentlicher Storage-URLs |
| System | `created_at`, `updated_at` |

Weitere Tabellen:

- `public.bestellungen` – Jahr, Sorte, Menge, Händler, Datum, Preis und Notizen
- `public.chili_reference` – bekannte Sortendaten und Quellen
- `public.app_owners` – erlaubte Supabase-Auth-Benutzer nach erfolgreicher Sicherheitsmigration
- Storage-Bucket `chili-fotos` – komprimierte Pflanzenbilder

## Bibliotheken

| Bibliothek | Verwendung | Laden |
| --- | --- | --- |
| Supabase JS | Daten, Auth und Storage | beim Start |
| qrcode.js | QR-Etiketten | beim Start |
| jsQR | Kamera-Scanner | beim Start |
| Chart.js | Statistikdiagramm | erst beim Öffnen der Statistik |
| Tesseract.js | Texterkennung | erst beim Fotografieren eines Samentütchens |
| SheetJS/XLSX | Excel-Import und Vorlage | erst bei Excel-Nutzung |

## Datenfluss

1. `index.html` lädt Konfiguration und Basismodule.
2. `auth.js` prüft die Supabase-Sitzung bzw. sendet einen Magic Link.
3. `data-service.js` lädt Chilis und Bestellungen.
4. `app.js` verknüpft gleiche Sorten über Jahre und rendert die aktive Ansicht.
5. Änderungen werden zuerst in Supabase gespeichert und danach lokal dargestellt.

## Migrationen und Ausrollen

- `20260907090000_add_growing_metrics.sql` ergänzt Aussaat, Keimung und Erntegewicht.
- `20260907090100_secure_single_user_access.sql` ersetzt die derzeit öffentlichen
  Vollzugriffs-Policies durch eine Besitzer-Allowlist.
- Reihenfolge und Sicherheitsvoraussetzungen stehen im `README.md`.
- Die Sicherheitsmigration wurde absichtlich noch nicht auf Produktion angewendet.

## Bekannte Grenzen

- `app.js` enthält noch mehrere Funktionsbereiche und soll bei künftigen Änderungen
  schrittweise weiter in thematische Module zerlegt werden.
- Das Manifest macht die App installierbar, ein vollständiger Offline-Service-Worker fehlt noch.
- Der Foto-Bucket ist für bestehende öffentliche Bild-URLs weiterhin öffentlich lesbar.
- Der Tabellenersatz beim JSON-Import ist nicht transaktional; deshalb wird unmittelbar
  davor automatisch ein lokales JSON-Backup erzeugt.

## Schnellprüfung

```bash
node --test
node --check app.js
for file in src/*.js; do node --check "$file"; done
git diff --check
```
