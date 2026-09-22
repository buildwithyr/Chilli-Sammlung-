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

if (typeof module !== "undefined") {
  module.exports = {
    BESTELL_STATUS,
    BESTELL_STATUS_LABELS,
    normalisiereMenge,
    sammleBestellpositionen,
    istGueltigeKontaktanfrage,
  };
}
