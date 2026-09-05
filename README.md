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

Beim allerersten Öffnen ist die Sammlung bereits mit den 58 Chilis aus dem
„Chili 2026"-Buch vorbefüllt (`data/seed-chilis.js`), inklusive Katalog-Nummer
und Schärfegrad. Herkunft, Fotos und Notizen fehlen noch – die trägst du
nach und nach über die Karten nach.

## Felder pro Chili

- Katalog-Nr., Name, Sorte/Art, Herkunft
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

## Später: eigenes Backend

Aktuell ist das bewusst eine einfache, serverlose Version. Falls die
Sammlung geräteübergreifend synchron sein soll (z.B. Handy + PC), kann
später eine echte Datenbank (z.B. Supabase) angebunden werden.
