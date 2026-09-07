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

## Ausrollen der Messwertänderungen

1. JSON-Backup der laufenden App exportieren.
2. Migration `20260907090000_add_growing_metrics.sql` ausführen.
3. Branch testen und erst danach in `main` übernehmen.

Die Sammlung enthält bewusst keine Anmeldung. Ihre Supabase-Daten und der
Foto-Bucket sind öffentlich erreichbar und veränderbar. Dieses Zugriffsmodell
ist für die nicht personenbezogene, private Sammlungs-App bewusst akzeptiert.
