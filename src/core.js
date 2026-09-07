// Gemeinsame, frameworkfreie Hilfsfunktionen der Chili-App.
const DEFAULT_YEAR = String(new Date().getFullYear());

function buildYearOptions(firstYear = 2022) {
  const lastYear = new Date().getFullYear() + 1;
  return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => String(firstYear + index));
}

const YEAR_OPTIONS = buildYearOptions(2022);
const ORDER_YEAR_OPTIONS = buildYearOptions(2020);

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function calculateGrowingMetrics(items) {
  const totals = items.reduce(
    (sum, item) => ({
      sown: sum.sown + nonNegativeNumber(item.ausgesaet),
      germinated: sum.germinated + nonNegativeNumber(item.gekeimt),
      harvestGrams: sum.harvestGrams + nonNegativeNumber(item.ernte_gewicht_g),
    }),
    { sown: 0, germinated: 0, harvestGrams: 0 }
  );
  return {
    ...totals,
    germinationRate: totals.sown > 0 ? Math.round((totals.germinated / totals.sown) * 100) : null,
  };
}

if (typeof module !== "undefined") {
  module.exports = { buildYearOptions, nonNegativeNumber, calculateGrowingMetrics };
}
