# Opa Reiters Chili Sammlung

Kleine Web-App, um eine Chili-Sammlung zu verwalten: alle Pflanzen als Karten,
mit Foto, Schärfegrad, Herkunft, Erntestand und eigenen Notizen. Responsive
für Handy und Desktop.

## Bereiche

Zwei Reiter oben unter dem Kopfbereich:

- **🌶️ Sammlung**: die Chili-Pflanzen (siehe unten).
- **📋 Bestellungen**: eigene Liste für gekaufte/bestellte Samen und Pflanzen,
  mit eigenen Jahres-Reitern (2020, 2022–2027) und eigenem Suchfeld (Name,
  „Bestellt bei"). Pro Bestellung: Jahr, Chili/Sorte, Menge, „Bestellt bei",
  Bestelldatum, Preis, Notizen.

## Nutzen

`index.html` im Browser öffnen (Doppelklick reicht, kein Server nötig).

- **+ Neue Chili** (runder Button unten rechts): Karte anlegen, Foto(s)
  hochladen, Felder ausfüllen.
- Auf eine Karte klicken, um Angaben zu bearbeiten oder zu löschen. Im
  Bearbeiten-Fenster oben ein klarer „‹ Zurück"-Button statt eines kleinen
  Kreuzes; bleibt beim Scrollen durch ein langes Formular sichtbar.
- Fotos werden vor dem Hochladen automatisch verkleinert und komprimiert
  (max. 800px Kante, ~100–150 KB), EXIF-Drehung wird korrekt übernommen –
  spart Speicherplatz und Ladezeit, ohne dass man selbst etwas tun muss.
- Suche und Status-Filter oben, um die Sammlung zu durchsuchen.
- Umschalter oben rechts (▦ / ☰): Kacheln mit Fotos oder kompakte Liste nur
  mit Namen zum schnellen Scrollen. Die Wahl wird gemerkt.
- Sortierung nach Katalog-Nr. (Standard), Schärfe (schärfste/mildeste
  zuerst) oder Name.
- Jahres-Reiter unter dem Kopfbereich (Alle Jahre / 2022 / 2023 / 2024 / 2025 /
  2026 / 2027): filtert die Sammlung nach Anbau-Jahr, damit auch vergangene
  Saisons festgehalten werden können. Bleibt beim Scrollen fix unter dem
  Header stehen; auf dem Handy als seitlich wischbarer Streifen statt
  umbrechender Kacheln.
- **Mehrere auswählen** (Button neben den Jahres-Reitern): Chilis anklicken
  statt zu öffnen, dann über „Bearbeiten" Pflanzdatum, Erntedatum, Status
  oder Jahr für alle ausgewählten auf einmal setzen – praktisch, wenn z.B.
  ein ganzer Satz Chilis am selben Tag umgesetzt oder geerntet wurde.
  In diesem Modus auch **„CSV exportieren"**: lädt nur die ausgewählten
  Chilis als CSV-Datei herunter (Semikolon-getrennt, für Excel/Numbers/
  Google Sheets), zum Ausdrucken oder Teilen ohne die App. Fotos sind
  darin nicht enthalten, alle Textfelder schon.

Auf dem Handy kann die App über „Zum Home-Bildschirm hinzufügen" (iOS) bzw.
„App installieren" (Android) mit eigenem Chili-Icon abgelegt werden. In
diesem Modus fehlt iOS die eigene Browser-Leiste und damit auch das native
Pull-to-refresh – die App bringt das selbst mit: oben auf der Seite nach
unten ziehen lädt neu.

Beim allerersten Öffnen ist die Sammlung bereits mit den 58 Chilis aus dem
„Chili 2026"-Buch vorbefüllt (`data/seed-chilis.js`), inklusive Katalog-Nummer
und Schärfegrad. Herkunft, Fotos und Notizen fehlen noch – die trägst du
nach und nach über die Karten nach.

## Felder pro Chili

- Katalog-Nr., Name, Jahr (2024–2027), Sorte/Art, Herkunft
- Schärfegrad (eigene Sg-Skala 1–10(+) aus dem Chili-Buch, optional
  zusätzlich ein Scoville-Wert)
- Status (Aussaat → Ernte läuft → Saison beendet)
- Freitext: Wie läuft die Ernte, Geschmack/Aroma, sonstige Notizen
- Fotos (mehrere pro Pflanze)

## Datenspeicherung: Supabase (geräteübergreifend)

Alle Daten (Chilis, Bestellungen, Fotos) liegen in einer eigenen
Supabase-Datenbank ("Chili Sammlung"-Projekt), nicht mehr nur im Browser.
Das heißt:

- Handy, Tablet und PC zeigen automatisch dieselbe, aktuelle Sammlung.
- Fotos liegen im Supabase-Storage-Bucket `chili-fotos`.
- Zugriff läuft über den öffentlichen "publishable" Key in `config.js` –
  das ist wie ein früherer "anon" Key kein Geheimnis, Schutz kommt über
  Datenbank-Regeln statt Geheimhaltung. Da die App kein eigenes Login hat,
  sind diese Regeln bewusst offen: **jeder mit dem Link kann die Sammlung
  lesen und ändern.** Für eine private Hobby-Seite ohne Nutzerverwaltung
  ein akzeptabler Kompromiss, aber gut zu wissen.
- Beim allerersten Öffnen (pro Browser) werden vorhandene Daten aus dem
  alten localStorage einmalig zu Supabase hochgeladen (inkl. Umwandlung
  alter Foto-Daten in Storage-Uploads). Danach ist Supabase die einzige
  Quelle.

Trotzdem: regelmäßig auf **„Daten exportieren (JSON)"** klicken und die
Datei sichern (z.B. per Mail an dich selbst) – als Backup unabhängig von
Supabase. Mit **„Daten importieren"** lässt sich so ein Export auch wieder
zurückspielen (ersetzt dabei die komplette Supabase-Sammlung).

Updates an der App (neues Design, neue Funktionen) fassen deinen
gespeicherten Bestand nie an: nur der Code/das Aussehen ändert sich,
deine Daten in Supabase bleiben unberührt.
