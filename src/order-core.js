// Reine Hilfsfunktionen für die Bestellfunktion (Kundenanfragen).
// Keine DOM- oder Supabase-Zugriffe, damit sie ohne Browser testbar bleiben.

const BESTELL_STATUS = {
  ANGEFRAGT: "angefragt",
  BESTAETIGT: "bestaetigt",
  STORNIERT: "storniert",
};

const BESTELL_STATUS_LABELS = {
  angefragt: "Angefragt",
  bestaetigt: "Bestätigt",
  storniert: "Storniert",
};

function normalisiereMenge(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(n, 99);
}

function sammleBestellpositionen(mengenByChiliId) {
  return Object.entries(mengenByChiliId)
    .map(([chiliId, menge]) => ({ chiliId, menge: normalisiereMenge(menge) }))
    .filter((pos) => pos.menge > 0);
}

function istGueltigeKontaktanfrage({ name, kontakt, positionen }) {
  return Boolean(name && name.trim() && kontakt && kontakt.trim() && Array.isArray(positionen) && positionen.length > 0);
}

// Gleiche Normalisierung wie varietyKey() in app.js: fasst dieselbe Sorte
// über mehrere Anbaujahre hinweg zu einem Schlüssel zusammen, damit sie in
// der Bestellfunktion nur einmal statt einmal pro Jahr auftaucht.
function varietyKey(name) {
  return String(name || "")
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Fasst Chili-Zeilen (mehrere Jahre derselben Sorte) zu je einem Eintrag
// zusammen. Repräsentant ist die Zeile mit dem neuesten Jahr; ids enthält
// alle zusammengehörigen chili_id-Werte (für Freigabe-Toggles).
function gruppiereNachSorte(chilis) {
  const gruppen = new Map();
  for (const chili of chilis) {
    const key = varietyKey(chili.name) || `id:${chili.id}`;
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(chili);
  }
  return [...gruppen.values()].map((eintraege) => {
    const sortiert = [...eintraege].sort((a, b) => String(b.jahr || "").localeCompare(String(a.jahr || "")));
    return { ...sortiert[0], ids: sortiert.map((c) => c.id) };
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    BESTELL_STATUS,
    BESTELL_STATUS_LABELS,
    normalisiereMenge,
    sammleBestellpositionen,
    istGueltigeKontaktanfrage,
    varietyKey,
    gruppiereNachSorte,
  };
}
