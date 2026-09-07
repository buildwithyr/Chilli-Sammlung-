const test = require("node:test");
const assert = require("node:assert/strict");
const { buildYearOptions, nonNegativeNumber, calculateGrowingMetrics } = require("../src/core.js");

test("Jahresoptionen sind lückenlos", () => {
  const years = buildYearOptions(2022);
  assert.equal(years[0], "2022");
  assert.equal(years.at(-1), String(new Date().getFullYear() + 1));
});

test("ungültige Messwerte werden als null behandelt", () => {
  assert.equal(nonNegativeNumber(-1), 0);
  assert.equal(nonNegativeNumber("unbekannt"), 0);
});

test("Keimquote und Erntegewicht werden über Pflanzen summiert", () => {
  const result = calculateGrowingMetrics([
    { ausgesaet: 10, gekeimt: 7, ernte_gewicht_g: 850 },
    { ausgesaet: 5, gekeimt: 5, ernte_gewicht_g: 250 },
  ]);
  assert.deepEqual(result, { sown: 15, germinated: 12, harvestGrams: 1100, germinationRate: 80 });
});
