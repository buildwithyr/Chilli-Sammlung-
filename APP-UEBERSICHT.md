# App-Übersicht

Stand: 11. September 2026

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
| `tv-gallery.js` | Vollbild-Galerie für Querformat, Fernseher und Bildschirmspiegelung |

## Bestellfunktion für Besucher (Branch-Vorschau, noch nicht live)

Auf dem Branch `claude/beautiful-mendel-d1xnbu` (noch nicht in `main`) gibt es
eine neue, von der bestehenden App unabhängige Bestellfunktion:

| Datei | Aufgabe |
| --- | --- |
| `bestellen.html` | Öffentliche Seite: zeigt nur freigegebene Chilis, Mengenwahl, Anfrageformular ohne Login |
| `admin.html` | Geschützter Bereich für Papa (und weitere eingeloggte Personen): Login, Bestellanfragen bestätigen/stornieren, öffentliche Freigabe je Chili setzen |
| `src/order-core.js` | Reine Hilfsfunktionen (Mengenprüfung, Status-Labels) – getestet in `tests/order-core.test.js` |
| `src/order-data.js` | Einziger Supabase-Zugriffspunkt dieses Features, inkl. `ORDER_TEST_MODE`-Schalter |
| `src/order-public.js` / `src/order-admin.js` | UI-Logik der beiden neuen Seiten |
| `order.css` | Styles des Features, nutzt bestehende Variablen aus `style.css` |

**Testmodus:** `ORDER_TEST_MODE = true` in `src/order-data.js` sorgt dafür,
dass beide Seiten ausschließlich mit Testdaten im `localStorage` des
Browsers arbeiten – kein Zugriff auf die Live-Datenbank oder Supabase Auth.
Login im Testmodus: beliebige E-Mail, Passwort `papa-test`.

**Geplante, noch nicht ausgeführte Migration:**
`supabase/migrations/20260922120000_add_customer_orders.sql` legt drei neue,
eigenständige Tabellen an (`chili_freigaben`, `bestellanfragen`,
`bestellanfragen_positionen`) inklusive RLS-Policies. Sie ändert keine
bestehende Tabelle, keine bestehenden Daten und keine bestehende
Zugriffsregel. Erst nach ausdrücklicher Freigabe auf der Live-Datenbank
ausführen; danach `ORDER_TEST_MODE` auf `false` stellen und für Papa sowie
weitere Admins (z. B. dich) je einen Supabase-Auth-Login anlegen – die
RLS-Regeln prüfen nur die Rolle `authenticated`, nicht eine bestimmte
Person, daher funktionieren mehrere Admin-Logins ohne weitere Änderung.

**Offenes Risiko:** Bis zur Migration und Umstellung von `ORDER_TEST_MODE`
ist die Bestellfunktion nicht mit echten Bestellungen nutzbar. Die
bestehende App (`index.html`/`app.js`) wurde für dieses Feature nicht
verändert.

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
- TV-/Galerie-Modus mit gefilterter Fotoauswahl, Diashow, Vollbild und Tast-/Wischsteuerung
- Festes dunkles Ember-Design und aufgeräumtes Hauptmenü mit eigener Datenverwaltung

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
2. `data-service.js` lädt Chilis und Bestellungen ohne Anmeldung.
3. `app.js` verknüpft gleiche Sorten über Jahre und rendert die aktive Ansicht.
4. Änderungen werden zuerst in Supabase gespeichert und danach lokal dargestellt.

## Migrationen und Ausrollen

- Seit 8. September 2026 im produktiven Einsatz: Papa wurde eingewiesen und lädt
  reale Sortenfotos hoch, alle Daten liegen dauerhaft in Supabase.
- Foto-Uploads bekommen je Datei einen zufälligen Dateinamen unter
  `chili-fotos/<chiliId>/<uid>.jpg` (siehe `uploadChiliPhoto` und der
  Upload-Handler in `app.js`). Dadurch überschreibt kein neuer Upload ein
  bestehendes Foto, und jedes Foto bleibt fest am jeweiligen Chili-Eintrag
  (und damit an dessen Sorte) hängen.
- `20260907090000_add_growing_metrics.sql` ergänzt Aussaat, Keimung und Erntegewicht.
- Die App bleibt bewusst ohne Anmeldung und mit öffentlichem Supabase-Zugriff.
- Die Entscheidung ist vertretbar, solange keine personenbezogenen oder vertraulichen
  Daten gespeichert werden und ein aktuelles Backup vorhanden ist.

## Bekannte Grenzen

- `app.js` enthält noch mehrere Funktionsbereiche und soll bei künftigen Änderungen
  schrittweise weiter in thematische Module zerlegt werden.
- Das Manifest macht die App installierbar, ein vollständiger Offline-Service-Worker fehlt noch.
- Der Foto-Bucket ist für bestehende öffentliche Bild-URLs weiterhin öffentlich lesbar.
- Daten können aufgrund des bewusst öffentlichen Zugriffs auch von Dritten verändert
  werden. Vor größeren Änderungen und regelmäßig im Betrieb ein JSON-Backup erstellen.
- Der Tabellenersatz beim JSON-Import ist nicht transaktional; deshalb wird unmittelbar
  davor automatisch ein lokales JSON-Backup erzeugt.

## Schnellprüfung

```bash
node --test
node --check app.js
for file in src/*.js; do node --check "$file"; done
git diff --check
```
