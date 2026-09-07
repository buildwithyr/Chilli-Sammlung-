# Entwicklungsregeln für KI-Agenten

Diese Regeln gelten für das gesamte Repository. Vor Änderungen zuerst
`APP-UEBERSICHT.md` lesen. Öffne danach nur die Dateien, die für die konkrete
Aufgabe notwendig sind.

## Architektur

- Keine neue Fachlogik direkt in `index.html` schreiben.
- `app.js` ist Übergangscode und darf nicht weiter zu einer Sammeldatei wachsen.
- Neue Funktionen als kleine, thematisch benannte Datei unter `src/` anlegen.
- Supabase-Zugriffe gehören ausschließlich in `src/data-service.js` oder einen
  klar benannten Service unter `src/`.
- Wiederverwendbare Hilfsfunktionen gehören in `src/core.js`.
- Große Spezialbibliotheken über `src/lazy-load.js` erst bei Bedarf laden.
- Keine Bibliothek doppelt einbinden und keine neue Abhängigkeit ohne konkreten Nutzen hinzufügen.
- Wiederholte UI- oder Downloadlogik in eine gemeinsame Funktion auslagern.
- Neue Jahreswerte niemals als feste Liste eintragen; Jahre dynamisch erzeugen.

## Daten und Supabase

- Niemals Secret- oder Service-Role-Keys in Browsercode oder Git schreiben.
- Jede Schemaänderung als nachvollziehbare SQL-Datei unter `supabase/migrations/` ablegen.
- Produktionsmigrationen nicht allein wegen einer Codeänderung automatisch ausführen.
- Das aktuelle öffentliche Zugriffsmodell ist eine bewusste Produktentscheidung.
  Keine Anmeldung oder Besitzerverwaltung ohne ausdrücklichen Auftrag ergänzen.
- Werden später personenbezogene oder vertrauliche Daten gespeichert, muss das
  Zugriffsmodell vor der Umsetzung neu bewertet werden.
- Löschende oder ersetzende Importe brauchen vorab ein wiederherstellbares Backup.
- Neue Zahlenfelder müssen auf plausible, nicht negative Werte geprüft werden.
- Bestehende Exporte und ältere Datensätze nach Möglichkeit abwärtskompatibel halten.

## Qualität

- Änderungen klein und thematisch halten; keine unzusammenhängenden Umbauten nebenbei.
- Benennungen in der Oberfläche auf Deutsch, technische Bezeichner konsistent halten.
- Benutzerdaten vor Ausgabe in HTML escapen; bevorzugt DOM-APIs und `textContent` verwenden.
- Fehler beim Laden und Speichern sichtbar behandeln, nicht still verschlucken.
- Für neue Berechnungen und Datenumwandlungen Tests unter `tests/` ergänzen.
- Vor Commit mindestens `node --test`, `node --check` für geänderte JS-Dateien und
  `git diff --check` ausführen.

## Dokumentation

- Wenn Funktionen, Dateien, Datenfelder, Migrationen oder externe Bibliotheken geändert
  werden, muss `APP-UEBERSICHT.md` im selben Commit aktualisiert werden.
- Die Übersicht kurz halten. Keine Quelltexte hineinkopieren; auf zuständige Dateien verweisen.
- Offene Risiken und notwendige Ausrollschritte dürfen nicht entfernt werden, solange sie gelten.
