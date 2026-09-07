# Opa Reiters Chili Sammlung

Browserbasierte Chili-Verwaltung mit Supabase, QR-Etiketten, Bestellungen,
Import/Export, Fotos und Saisonstatistik.

## Entwicklung

Die App benötigt keinen Build-Schritt. Lokal über einen HTTP-Server starten:

```bash
python3 -m http.server 8080
```

Tests ausführen:

```bash
node --test
```

## Ausrollen der Sicherheits- und Messwertänderungen

1. JSON-Backup der laufenden App exportieren.
2. Migration `20260907090000_add_growing_metrics.sql` ausführen.
3. In Supabase Auth den Redirect der GitHub-Pages-Adresse erlauben.
4. Login per E-Mail erfolgreich testen und die eigene UUID unter Auth → Users kopieren.
5. In `20260907090100_secure_single_user_access.sql` das kommentierte
   `insert` mit dieser UUID einmalig ausführen.
6. Danach die restliche Sicherheitsmigration ausführen.
7. Security Advisor erneut prüfen.

Die zweite Migration entfernt die derzeitigen öffentlichen Schreib- und
Löschrechte. Sie darf nicht vor einem erfolgreichen Login ausgerollt werden.
Der Foto-Bucket bleibt für bestehende öffentliche Bild-URLs lesbar; Schreiben
und Löschen wird auf das angemeldete Konto begrenzt.
