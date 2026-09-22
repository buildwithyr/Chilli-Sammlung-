// Datenzugriff für die neue Bestellfunktion (Kundenanfragen).
// Supabase-Zugriffe für dieses Feature ausschließlich hier, wie in AGENTS.md gefordert.
//
// ORDER_TEST_MODE: Solange true, werden ausschließlich Testdaten aus dem
// localStorage dieses Browsers verwendet. Seit der Migration
// `supabase/migrations/20260922120000_add_customer_orders.sql` auf der
// Live-Datenbank ausgeführt wurde (22.09.2026) und ein echter Login
// angelegt ist, läuft dieses Feature im echten Modus.
const ORDER_TEST_MODE = false;
const ORDER_TEST_ADMIN_PASSWORT = "papa-test"; // NUR für den Testmodus, keine echte Sicherheit.

const orderSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ORDER_TEST_STORE_KEY = "chiliBestellungTestdaten_v1";

function ladeTestStore() {
  try {
    const raw = localStorage.getItem(ORDER_TEST_STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignorieren, Store wird neu angelegt.
  }
  const initial = {
    freigaben: { "test-1": true, "test-2": true, "test-3": false },
    anfragen: [
      {
        id: "test-anfrage-1",
        name: "Maria Beispiel",
        kontakt: "maria@beispiel.de",
        nachricht: "Gerne per Post, danke!",
        status: "angefragt",
        createdAt: new Date().toISOString(),
        entschiedenAm: null,
        positionen: [
          { chiliId: "test-1", chiliName: "Carolina Reaper (Testdaten)", menge: 2 },
          { chiliId: "test-2", chiliName: "Habanero Orange (Testdaten)", menge: 1 },
        ],
      },
    ],
  };
  speichereTestStore(initial);
  return initial;
}

function speichereTestStore(store) {
  localStorage.setItem(ORDER_TEST_STORE_KEY, JSON.stringify(store));
}

const ORDER_TEST_CHILIS = [
  { id: "test-1", name: "Carolina Reaper (Testdaten)", sorte: "Capsicum chinense", sg: 9, jahr: "2026", fotos: [] },
  { id: "test-2", name: "Habanero Orange (Testdaten)", sorte: "Capsicum chinense", sg: 7, jahr: "2026", fotos: [] },
  { id: "test-3", name: "Jalapeño (Testdaten, noch nicht freigegeben)", sorte: "Capsicum annuum", sg: 3, jahr: "2026", fotos: [] },
];

async function fetchFreigegebeneChilis() {
  if (ORDER_TEST_MODE) {
    const store = ladeTestStore();
    return ORDER_TEST_CHILIS.filter((c) => store.freigaben[c.id]);
  }
  const { data: freigaben, error: err1 } = await orderSb
    .from("chili_freigaben")
    .select("chili_id")
    .eq("freigegeben", true);
  if (err1) throw new Error(`Freigaben konnten nicht geladen werden: ${err1.message}`);
  const ids = freigaben.map((f) => f.chili_id);
  if (ids.length === 0) return [];
  const { data: chilis, error: err2 } = await orderSb
    .from("chilis")
    .select("id,name,sorte,sg,jahr,fotos")
    .in("id", ids);
  if (err2) throw new Error(`Chilis konnten nicht geladen werden: ${err2.message}`);
  // Dieselbe Sorte kann über mehrere Jahre je eine eigene Zeile haben -
  // Besuchern nur einmal pro Sorte anzeigen (neuestes Jahr gewinnt).
  return gruppiereNachSorte(chilis);
}

async function submitBestellanfrage({ name, kontakt, nachricht, positionen }) {
  if (ORDER_TEST_MODE) {
    const store = ladeTestStore();
    store.anfragen.unshift({
      id: "test-" + Date.now(),
      name,
      kontakt,
      nachricht: nachricht || "",
      status: "angefragt",
      createdAt: new Date().toISOString(),
      entschiedenAm: null,
      positionen: positionen.map((p) => ({
        chiliId: p.chiliId,
        chiliName: ORDER_TEST_CHILIS.find((c) => c.id === p.chiliId)?.name || p.chiliId,
        menge: p.menge,
      })),
    });
    speichereTestStore(store);
    return true;
  }
  // Anlegen läuft über die RPC submit_bestellanfrage() (siehe Migration):
  // Anonyme dürfen laut Zugriffsregeln nicht direkt aus bestellanfragen
  // lesen, ein Insert mit .select() würde also die neue Zeile nicht
  // zurückbekommen. Die Funktion legt Anfrage + Positionen zudem atomar an.
  const { error } = await orderSb.rpc("submit_bestellanfrage", {
    p_name: name,
    p_kontakt: kontakt,
    p_nachricht: nachricht || null,
    p_positionen: positionen.map((p) => ({ chiliId: p.chiliId, chiliName: p.chiliName, menge: p.menge })),
  });
  if (error) throw new Error(`Bestellanfrage konnte nicht gesendet werden: ${error.message}`);
  return true;
}

async function fetchBestellanfragen() {
  if (ORDER_TEST_MODE) {
    return ladeTestStore().anfragen;
  }
  const { data: anfragen, error: err1 } = await orderSb
    .from("bestellanfragen")
    .select("*")
    .order("created_at", { ascending: false });
  if (err1) throw new Error(`Bestellungen konnten nicht geladen werden: ${err1.message}`);
  const { data: positionen, error: err2 } = await orderSb.from("bestellanfragen_positionen").select("*");
  if (err2) throw new Error(`Bestellpositionen konnten nicht geladen werden: ${err2.message}`);
  return anfragen.map((a) => ({
    id: a.id,
    name: a.name,
    kontakt: a.kontakt,
    nachricht: a.nachricht,
    status: a.status,
    createdAt: a.created_at,
    entschiedenAm: a.entschieden_am,
    positionen: positionen
      .filter((p) => p.anfrage_id === a.id)
      .map((p) => ({ chiliId: p.chili_id, chiliName: p.chili_name, menge: p.menge })),
  }));
}

async function updateAnfrageStatus(id, status) {
  if (ORDER_TEST_MODE) {
    const store = ladeTestStore();
    const anfrage = store.anfragen.find((a) => a.id === id);
    if (anfrage) {
      anfrage.status = status;
      anfrage.entschiedenAm = new Date().toISOString();
      speichereTestStore(store);
    }
    return true;
  }
  const { error } = await orderSb
    .from("bestellanfragen")
    .update({ status, entschieden_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Status konnte nicht gespeichert werden: ${error.message}`);
  return true;
}

async function fetchAlleChilisMitFreigabe() {
  if (ORDER_TEST_MODE) {
    const store = ladeTestStore();
    return ORDER_TEST_CHILIS.map((c) => ({ ...c, ids: [c.id], freigegeben: Boolean(store.freigaben[c.id]) }));
  }
  const { data: chilis, error: err1 } = await orderSb.from("chilis").select("id,name,sorte,jahr").order("nr");
  if (err1) throw new Error(`Chilis konnten nicht geladen werden: ${err1.message}`);
  const { data: freigaben, error: err2 } = await orderSb.from("chili_freigaben").select("chili_id,freigegeben");
  if (err2) throw new Error(`Freigaben konnten nicht geladen werden: ${err2.message}`);
  const freigabeMap = Object.fromEntries(freigaben.map((f) => [f.chili_id, f.freigegeben]));
  // Dieselbe Sorte kann über mehrere Jahre je eine eigene Zeile haben - in
  // der Freigabe-Liste nur einmal zeigen, Freigabe gilt dann für alle Jahre.
  return gruppiereNachSorte(chilis).map((c) => ({
    ...c,
    freigegeben: c.ids.some((id) => freigabeMap[id]),
  }));
}

async function setFreigabe(chiliIds, freigegeben) {
  const ids = Array.isArray(chiliIds) ? chiliIds : [chiliIds];
  if (ORDER_TEST_MODE) {
    const store = ladeTestStore();
    for (const id of ids) store.freigaben[id] = freigegeben;
    speichereTestStore(store);
    return true;
  }
  const jetzt = new Date().toISOString();
  const { error } = await orderSb
    .from("chili_freigaben")
    .upsert(ids.map((chili_id) => ({ chili_id, freigegeben, updated_at: jetzt })));
  if (error) throw new Error(`Freigabe konnte nicht gespeichert werden: ${error.message}`);
  return true;
}

async function papaLogin(email, passwort) {
  if (ORDER_TEST_MODE) {
    const ok = passwort === ORDER_TEST_ADMIN_PASSWORT;
    if (ok) sessionStorage.setItem("orderTestAdminEingeloggt", "1");
    return ok;
  }
  const { error } = await orderSb.auth.signInWithPassword({ email, password: passwort });
  return !error;
}

async function papaLogout() {
  if (ORDER_TEST_MODE) {
    sessionStorage.removeItem("orderTestAdminEingeloggt");
    return;
  }
  await orderSb.auth.signOut();
}

// Benachrichtigt bei neu eingehenden Bestellanfragen, solange die Seite
// geöffnet ist (kein Push, kein E-Mail-Versand). Im Testmodus passiert
// nichts, da es keine echte Datenbank gibt, die sich ändern könnte.
// Gibt eine Funktion zurück, mit der man wieder abbestellen kann.
function watchNeueAnfragen(onNeueAnfrage) {
  if (ORDER_TEST_MODE) return () => {};
  const channel = orderSb
    .channel("bestellanfragen-neu")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "bestellanfragen" }, onNeueAnfrage)
    .subscribe();
  return () => orderSb.removeChannel(channel);
}

async function istPapaEingeloggt() {
  if (ORDER_TEST_MODE) {
    return sessionStorage.getItem("orderTestAdminEingeloggt") === "1";
  }
  const { data } = await orderSb.auth.getSession();
  return Boolean(data.session);
}
