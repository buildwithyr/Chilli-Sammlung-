# Opa Reiters Chili Sammlung

Kleine Web-App, um eine Chili-Sammlung zu verwalten: alle Pflanzen als Karten,
mit Foto, Schärfegrad, Herkunft, Erntestand und eigenen Notizen. Responsive
für Handy und Desktop.

## Nutzen

`index.html` im Browser öffnen (Doppelklick reicht, kein Server nötig).

- **+ Neue Chili** (runder Button unten rechts): Karte anlegen, Foto(s)
  hochladen, Felder ausfüllen.
- Auf eine Karte klicken, um Angaben zu bearbeiten oder zu löschen.
- Suche und Status-Filter oben, um die Sammlung zu durchsuchen.
- Umschalter oben rechts (▦ / ☰): Kacheln mit Fotos oder kompakte Liste nur
  mit Namen zum schnellen Scrollen. Die Wahl wird gemerkt.
- Sortierung nach Katalog-Nr. (Standard), Schärfe (schärfste/mildeste
  zuerst) oder Name.
- Jahres-Reiter unter dem Kopfbereich (Alle Jahre / 2024 / 2025 / 2026 / 2027):
  filtert die Sammlung nach Anbau-Jahr, damit auch vergangene Saisons
  festgehalten werden können.

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

## Wichtig: Datenspeicherung

Alle Daten (inkl. Fotos) liegen **nur im localStorage deines Browsers** –
nicht im Git-Repository. Das heißt:

- Andere Browser/Geräte sehen deine Daten nicht.
- Browser-Daten löschen (z.B. "Website-Daten leeren") löscht auch die Sammlung.

Deshalb: regelmäßig auf **„Daten exportieren (JSON)"** klicken und die Datei
sichern. Mit **„Daten importieren"** kann die Sammlung wiederhergestellt oder
auf ein anderes Gerät übertragen werden.

Updates an der App (neues Design, neue Funktionen) fassen deinen
gespeicherten Bestand nie an: Die Startliste wird nur beim allerersten
Öffnen geladen, jedes spätere Update ändert nur Code und Optik. Eigene
Chilis, Fotos und Notizen bleiben über Versionen hinweg erhalten.

## Später: eigenes Backend

Aktuell ist das bewusst eine einfache, serverlose Version. Falls die
Sammlung geräteübergreifend synchron sein soll (z.B. Handy + PC), kann
später eine echte Datenbank (z.B. Supabase) angebunden werden.
