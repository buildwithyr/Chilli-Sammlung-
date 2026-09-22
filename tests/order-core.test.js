const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalisiereMenge,
  sammleBestellpositionen,
  istGueltigeKontaktanfrage,
} = require("../src/order-core.js");

test("ungültige Mengen werden zu 0", () => {
  assert.equal(normalisiereMenge(-1), 0);
  assert.equal(normalisiereMenge("viel"), 0);
  assert.equal(normalisiereMenge(0), 0);
  assert.equal(normalisiereMenge(3.7), 3);
  assert.equal(normalisiereMenge(500), 99);
});

test("nur Positionen mit Menge > 0 werden übernommen", () => {
  const positionen = sammleBestellpositionen({ a: 2, b: 0, c: "x", d: 1 });
  assert.deepEqual(positionen, [
    { chiliId: "a", menge: 2 },
    { chiliId: "d", menge: 1 },
  ]);
});

test("Anfrage braucht Name, Kontakt und mindestens eine Position", () => {
  assert.equal(istGueltigeKontaktanfrage({ name: "Anna", kontakt: "a@b.de", positionen: [{ chiliId: "a", menge: 1 }] }), true);
  assert.equal(istGueltigeKontaktanfrage({ name: "", kontakt: "a@b.de", positionen: [{ chiliId: "a", menge: 1 }] }), false);
  assert.equal(istGueltigeKontaktanfrage({ name: "Anna", kontakt: "", positionen: [{ chiliId: "a", menge: 1 }] }), false);
  assert.equal(istGueltigeKontaktanfrage({ name: "Anna", kontakt: "a@b.de", positionen: [] }), false);
});
