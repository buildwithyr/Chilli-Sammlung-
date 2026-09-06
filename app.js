// Alte localStorage-Keys - werden nur noch für die einmalige Migration
// zu Supabase gelesen, danach ist Supabase die alleinige Datenquelle.
const STORAGE_KEY = "chiliSammlung";
const ORDERS_STORAGE_KEY = "chiliBestellungen";
const MIGRATED_KEY = "chiliMigratedToSupabase";

const VIEW_KEY = "chiliViewMode";
const YEAR_KEY = "chiliActiveYear";
const SORT_KEY = "chiliSortMode";
const APP_TAB_KEY = "chiliAppTab";
const ORDER_YEAR_KEY = "chiliOrderActiveYear";

const YEAR_OPTIONS = ["2022", "2023", "2024", "2025", "2026", "2027"];
const DEFAULT_YEAR = "2026";
const ORDER_YEAR_OPTIONS = ["2020", "2022", "2023", "2024", "2025", "2026", "2027"];

const STATUS_OPTIONS = [
  "Aussaat",
  "Keimling",
  "Wachstum",
  "Blüte",
  "Fruchtansatz",
  "Erntereif",
  "Ernte läuft",
  "Saison beendet",
];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const FOTOS_BUCKET = "chili-fotos";

// --- Hell-/Dunkelmodus ---
// Ohne gespeicherte Wahl folgt die App der Systemeinstellung (siehe CSS
// data-theme-Muster); eine explizite Wahl über den Umschalter überschreibt das.

const THEME_KEY = "chiliTheme";

function getEffectiveTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  applyTheme(stored === "light" || stored === "dark" ? stored : null);
}

function toggleTheme() {
  const next = getEffectiveTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  if (appTab === "statistik") renderStats();
}

initTheme();

let chilis = [];
let orders = [];
let currentPhotos = [];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Bildkompression vor dem Upload ---
// Handyfotos sind oft mehrere MB groß und durch EXIF-Metadaten gedreht.
// compressImage() verkleinert auf max. 800px (längere Kante, kein
// Hochskalieren) und exportiert als JPEG mit sinkender Qualität, bis die
// Datei unter ca. 150 KB liegt (oder Qualität 0.35 erreicht ist).
//
// Zur Drehung: alle relevanten Browser (Safari, Chrome, Firefox) wenden die
// EXIF-Rotation seit Jahren selbst automatisch beim Decodieren an - sowohl
// für <img> als auch für createImageBitmap mit imageOrientation:"from-image"
// (nachgemessen: Chromium ignoriert "none" hier sogar und korrigiert immer).
// Deshalb wird bewusst NICHT manuell anhand der rohen EXIF-Bytes gedreht -
// das würde bei Browsern, die schon selbst korrigieren, zu einer doppelten
// (und damit falschen) Drehung führen.

const IMAGE_MAX_DIMENSION = 800;
const IMAGE_TARGET_BYTES = 150 * 1024;
const IMAGE_MIN_QUALITY = 0.35;
const IMAGE_QUALITY_STEP = 0.05;
const IMAGE_START_QUALITY = 0.6;

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht decodiert werden"));
    };
    img.src = url;
  });
}

async function decodeOrientedImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      // z.B. HEIC in einem Browser, der das per createImageBitmap nicht mag -
      // <img> schafft es in manchen Fällen trotzdem.
    }
  }
  return loadImageElement(file);
}

function intrinsicSize(source) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  return { width: source.naturalWidth, height: source.naturalHeight };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas-Export fehlgeschlagen"))),
      type,
      quality
    );
  });
}

/**
 * Komprimiert ein Foto vor dem Upload: auf max. 800px Kantenlänge
 * verkleinern (kein Hochskalieren, EXIF-Drehung übernimmt der Browser
 * beim Decodieren), als JPEG mit absinkender Qualität exportieren bis
 * ~150 KB oder Qualität 0.35.
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
async function compressImage(file) {
  let source;
  try {
    source = await decodeOrientedImage(file);
  } catch (e) {
    throw new Error(
      "Dieses Bild konnte nicht gelesen werden (evtl. ein Format wie HEIC, das dieser Browser nicht unterstützt). Bitte als JPG oder PNG speichern und erneut versuchen."
    );
  }

  const { width, height } = intrinsicSize(source);
  if (!width || !height) {
    throw new Error("Dieses Bild konnte nicht gelesen werden.");
  }

  const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(width, height));
  const outWidth = Math.round(width * scale);
  const outHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, outWidth, outHeight);
  if (typeof source.close === "function") source.close();

  let quality = IMAGE_START_QUALITY;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  while (blob.size > IMAGE_TARGET_BYTES && quality > IMAGE_MIN_QUALITY) {
    quality = Math.max(IMAGE_MIN_QUALITY, quality - IMAGE_QUALITY_STEP);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
  }

  console.log(
    `Bild komprimiert: ${(file.size / 1024).toFixed(0)} KB -> ${(blob.size / 1024).toFixed(0)} KB ` +
      `(Qualität ${quality.toFixed(2)}, ${outWidth}x${outHeight})`
  );

  return blob;
}

async function fetchChilis() {
  const { data, error } = await sb.from("chilis").select("*").order("nr", { ascending: true });
  if (error) {
    console.error("Konnte Chilis nicht laden", error);
    return [];
  }
  return data;
}

async function fetchOrders() {
  const { data, error } = await sb.from("bestellungen").select("*");
  if (error) {
    console.error("Konnte Bestellungen nicht laden", error);
    return [];
  }
  return data;
}

async function upsertChiliRemote(data) {
  const { error } = await sb.from("chilis").upsert(data);
  if (error) alert("Speichern fehlgeschlagen: " + error.message);
  return !error;
}

async function updateLinkedChilisRemote(ids, data) {
  if (ids.length === 0) return true;
  const { error } = await sb.from("chilis").update(data).in("id", ids);
  if (error) alert("Verknüpfte Sorten konnten nicht gespeichert werden: " + error.message);
  return !error;
}

// Angaben zur Sorte gelten unabhaengig vom Anbaujahr. Werden sie bei einem
// Eintrag geaendert, schreiben wir sie deshalb auch in alle gleichnamigen
// Eintraege der anderen Jahre. Die Saison-Felder (Status, Daten, Notizen und
// Fotos) bleiben dagegen beim jeweiligen Jahres-Eintrag.
const SHARED_VARIETY_FIELDS = [
  "name",
  "sorte",
  "herkunft",
  "art",
  "sg",
  "scoville",
  "geschmack",
  "geschmack_tags",
];

function varietyKey(name) {
  return String(name || "")
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function linkSharedVarietyData(list) {
  const newestByVariety = new Map();
  for (const chili of list) {
    const key = varietyKey(chili.name);
    if (!key) continue;
    const current = newestByVariety.get(key);
    if (!current || String(chili.jahr || "").localeCompare(String(current.jahr || "")) > 0) {
      newestByVariety.set(key, chili);
    }
  }

  return list.map((chili) => {
    const source = newestByVariety.get(varietyKey(chili.name));
    if (!source) return chili;
    return { ...chili, ...sharedVarietyOverrides(source) };
  });
}

// Nur tatsaechlich ausgefuellte Felder weitergeben - sonst wuerde z.B. ein
// Import mit nur Nr/Name/Sg schon recherchierte Herkunft/Scoville-Angaben
// anderer Jahre loeschen, sobald der importierte Jahrgang der neueste ist.
function sharedVarietyOverrides(source) {
  const overrides = {};
  for (const field of SHARED_VARIETY_FIELDS) {
    const value = source[field];
    const hasValue = Array.isArray(value) ? value.length > 0 : !!value;
    if (hasValue) overrides[field] = value;
  }
  return overrides;
}

async function deleteChiliRemote(id) {
  const { error } = await sb.from("chilis").delete().eq("id", id);
  if (error) alert("Löschen fehlgeschlagen: " + error.message);
  return !error;
}

async function upsertOrderRemote(data) {
  const { error } = await sb.from("bestellungen").upsert(data);
  if (error) alert("Speichern fehlgeschlagen: " + error.message);
  return !error;
}

async function deleteOrderRemote(id) {
  const { error } = await sb.from("bestellungen").delete().eq("id", id);
  if (error) alert("Löschen fehlgeschlagen: " + error.message);
  return !error;
}

// --- Einmalige Migration: altes localStorage -> Supabase ---
// Läuft nur, solange die Supabase-Tabelle noch leer ist, damit ein
// zweites Gerät mit eigenem (älterem) localStorage nichts überschreibt.

async function uploadDataUrlToStorage(dataUrl, chiliId) {
  try {
    const rawBlob = await (await fetch(dataUrl)).blob();
    const blob = await compressImage(rawBlob).catch(() => rawBlob);
    const path = `${chiliId}/${uid()}.jpg`;
    const { error } = await sb.storage
      .from(FOTOS_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    return sb.storage.from(FOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("Foto-Upload bei Migration fehlgeschlagen", e);
    return null;
  }
}

async function migrateLocalDataIfNeeded() {
  if (localStorage.getItem(MIGRATED_KEY) === "true") return;

  const { count } = await sb.from("chilis").select("id", { count: "exact", head: true });
  if (count && count > 0) {
    // Supabase hat schon Daten (z.B. von einem anderen Gerät migriert) -
    // hier nichts überschreiben.
    localStorage.setItem(MIGRATED_KEY, "true");
    return;
  }

  let localChilis;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localChilis = raw
      ? JSON.parse(raw)
      : typeof SEED_CHILIS !== "undefined"
      ? [...SEED_CHILIS]
      : [];
  } catch (e) {
    localChilis = typeof SEED_CHILIS !== "undefined" ? [...SEED_CHILIS] : [];
  }
  localChilis = localChilis.map((c) => (c.jahr ? c : { ...c, jahr: DEFAULT_YEAR }));

  let localOrders = [];
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    localOrders = raw ? JSON.parse(raw) : [];
  } catch (e) {
    localOrders = [];
  }

  for (const c of localChilis) {
    if (!c.fotos || c.fotos.length === 0) continue;
    const uploaded = [];
    for (const foto of c.fotos) {
      if (typeof foto === "string" && foto.startsWith("data:")) {
        const url = await uploadDataUrlToStorage(foto, c.id);
        if (url) uploaded.push(url);
      } else {
        uploaded.push(foto);
      }
    }
    c.fotos = uploaded;
  }

  if (localChilis.length > 0) {
    const { error } = await sb.from("chilis").upsert(localChilis);
    if (error) console.error("Migration der Chilis fehlgeschlagen", error);
  }
  if (localOrders.length > 0) {
    const { error } = await sb.from("bestellungen").upsert(localOrders);
    if (error) console.error("Migration der Bestellungen fehlgeschlagen", error);
  }

  localStorage.setItem(MIGRATED_KEY, "true");
}

// --- Rendering ---

const grid = document.getElementById("chiliGrid");
const emptyState = document.getElementById("emptyState");
const brandStatsEl = document.getElementById("brandStats");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const sortSelect = document.getElementById("sortSelect");
const viewGridBtn = document.getElementById("viewGridBtn");
const viewListBtn = document.getElementById("viewListBtn");
const yearTabs = document.getElementById("yearTabs");
const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");
const bulkClearBtn = document.getElementById("bulkClearBtn");
const bulkEditBtn = document.getElementById("bulkEditBtn");
const bulkExportCsvBtn = document.getElementById("bulkExportCsvBtn");
const bulkSelectAllBtn = document.getElementById("bulkSelectAllBtn");
const bulkDoneBtn = document.getElementById("bulkDoneBtn");
const fab = document.getElementById("addChiliBtn");

// --- Langer Druck auf eine Karte/Zeile aktiviert die Mehrfachauswahl -
// ersetzt den separaten "Mehrere auswählen"-Button. Funktioniert mit Maus
// UND Touch (Pointer Events), da ein normaler Klick danach sonst noch das
// Bearbeiten-Fenster öffnen würde.

function attachLongPress(el, onLongPress) {
  const THRESHOLD_MS = 500;
  const MOVE_TOLERANCE = 10;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let firedLongPress = false;

  function cancelTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    cancelTimer();
    timer = setTimeout(() => {
      firedLongPress = true;
      onLongPress();
    }, THRESHOLD_MS);
  });
  el.addEventListener("pointermove", (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE) {
      cancelTimer();
    }
  });
  el.addEventListener("pointerup", cancelTimer);
  el.addEventListener("pointercancel", cancelTimer);
  el.addEventListener("pointerleave", cancelTimer);
  el.addEventListener(
    "click",
    (e) => {
      if (firedLongPress) {
        firedLongPress = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}

// --- Menü (⋮): Hell/Dunkel, Statistik, Info - statt einzeln sichtbarer
// Icons im Header sitzt das gebündelt in einem Dropdown.

const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");
const menuThemeBtn = document.getElementById("menuThemeBtn");
const menuThemeLabel = document.getElementById("menuThemeLabel");
const menuStatsBtn = document.getElementById("menuStatsBtn");
const menuInfoBtn = document.getElementById("menuInfoBtn");

function openMenu() {
  menuThemeLabel.textContent = getEffectiveTheme() === "dark" ? "Hellmodus" : "Dunkelmodus";
  menuDropdown.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  menuDropdown.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (menuDropdown.hidden) openMenu(); else closeMenu();
});
document.addEventListener("click", (e) => {
  if (!menuDropdown.hidden && !e.target.closest(".menu-wrap")) closeMenu();
});
menuThemeBtn.addEventListener("click", () => {
  toggleTheme();
  closeMenu();
});
menuStatsBtn.addEventListener("click", () => {
  setAppTab("statistik");
  closeMenu();
});

const infoModal = document.getElementById("infoModal");
const infoModalCloseBtn = document.getElementById("infoModalCloseBtn");
menuInfoBtn.addEventListener("click", () => {
  infoModal.hidden = false;
  closeMenu();
});
infoModalCloseBtn.addEventListener("click", () => {
  infoModal.hidden = true;
});
infoModal.addEventListener("click", (e) => {
  if (e.target === infoModal) infoModal.hidden = true;
});

let viewMode = localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
let activeYear = localStorage.getItem(YEAR_KEY) || "";
let selectionMode = false;
let selectedIds = new Set();

function setSelectionMode(on) {
  selectionMode = on;
  if (!on) selectedIds.clear();
  fab.hidden = on;
  updateBulkBar();
  render();
}

function enterSelectionMode(initialId) {
  selectionMode = true;
  selectedIds.add(initialId);
  fab.hidden = true;
  updateBulkBar();
  render();
}

function toggleSelected(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateBulkBar();
  render();
}

function updateBulkBar() {
  bulkBar.hidden = !selectionMode;
  bulkCount.textContent = `${selectedIds.size} ausgewählt`;
  bulkEditBtn.disabled = selectedIds.size === 0;
  bulkExportCsvBtn.disabled = selectedIds.size === 0;
  bulkQrBtn.disabled = selectedIds.size === 0;
}

bulkDoneBtn.addEventListener("click", () => setSelectionMode(false));
bulkClearBtn.addEventListener("click", () => {
  selectedIds.clear();
  updateBulkBar();
  render();
});
bulkSelectAllBtn.addEventListener("click", () => {
  const filtered = getFilteredChilis();
  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  if (allSelected) {
    selectedIds.clear();
  } else {
    for (const c of filtered) selectedIds.add(c.id);
  }
  updateBulkBar();
  render();
});

// --- Haupt-Reiter: Sammlung / Bestellungen ---

const tabSammlungBtn = document.getElementById("tabSammlungBtn");
const tabBestellungenBtn = document.getElementById("tabBestellungenBtn");
const sammlungFilterBar = document.getElementById("sammlungFilterBar");
const sammlungMain = document.getElementById("sammlungMain");
const orderFilterBar = document.getElementById("orderFilterBar");
const ordersMain = document.getElementById("ordersMain");
const statsMain = document.getElementById("statsMain");
const addOrderBtn = document.getElementById("addOrderBtn");
const sammlungHeaderActions = document.getElementById("sammlungHeaderActions");
const orderHeaderActions = document.getElementById("orderHeaderActions");

// --- Mobil: Haupt-Reiter und Jahres-Leiste als kompakte Dropdowns statt
// Pillen-Reihen, damit der fixierte Kopfbereich am Handy nicht so viel Platz
// braucht. Auf dem Desktop bleiben es ganz normale Reiter (CSS zeigt die
// Toggle-Buttons nur unterhalb von 641px).

const mainTabsToggle = document.getElementById("mainTabsToggle");
const mainTabsToggleLabel = document.getElementById("mainTabsToggleLabel");
const mainTabsNav = mainTabsToggle.closest(".main-tabs");

function closeMainTabsDropdown() {
  mainTabsNav.classList.remove("open");
  mainTabsToggle.setAttribute("aria-expanded", "false");
}

mainTabsToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = mainTabsNav.classList.toggle("open");
  mainTabsToggle.setAttribute("aria-expanded", String(isOpen));
});
document.addEventListener("click", (e) => {
  if (mainTabsNav.classList.contains("open") && !mainTabsNav.contains(e.target)) closeMainTabsDropdown();
});

function closeYearDropdown(bar) {
  const wrap = bar.querySelector(".year-tabs-inner");
  wrap.classList.remove("open");
  wrap.querySelector(".year-tabs-toggle")?.setAttribute("aria-expanded", "false");
}

document.querySelectorAll(".year-tabs-toggle").forEach((toggleBtn) => {
  const wrap = toggleBtn.closest(".year-tabs-inner");
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.toggle("open");
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  });
  document.addEventListener("click", (e) => {
    if (wrap.classList.contains("open") && !wrap.contains(e.target)) {
      wrap.classList.remove("open");
      toggleBtn.setAttribute("aria-expanded", "false");
    }
  });
});

const APP_TABS = ["sammlung", "bestellungen", "statistik"];
let appTab = APP_TABS.includes(localStorage.getItem(APP_TAB_KEY)) ? localStorage.getItem(APP_TAB_KEY) : "sammlung";

function setAppTab(tab) {
  appTab = tab;
  localStorage.setItem(APP_TAB_KEY, tab);

  const showSammlung = tab === "sammlung";
  const showBestellungen = tab === "bestellungen";
  const showStatistik = tab === "statistik";

  tabSammlungBtn.classList.toggle("active", showSammlung);
  tabBestellungenBtn.classList.toggle("active", showBestellungen);
  menuBtn.classList.toggle("active", showStatistik);
  if (showSammlung) mainTabsToggleLabel.textContent = "Sammlung";
  if (showBestellungen) mainTabsToggleLabel.textContent = "Bestellungen";
  closeMainTabsDropdown();

  sammlungHeaderActions.hidden = !showSammlung;
  orderHeaderActions.hidden = !showBestellungen;
  sammlungFilterBar.hidden = !showSammlung;
  sammlungMain.hidden = !showSammlung;
  orderFilterBar.hidden = !showBestellungen;
  ordersMain.hidden = !showBestellungen;
  statsMain.hidden = !showStatistik;
  fab.hidden = !showSammlung || selectionMode;
  addOrderBtn.hidden = !showBestellungen || orderSelectionMode;

  if (!showSammlung && selectionMode) setSelectionMode(false);
  if (!showBestellungen && orderSelectionMode) setOrderSelectionMode(false);
  if (showBestellungen) renderOrders();
  if (showStatistik) renderStats();
}

tabSammlungBtn.addEventListener("click", () => setAppTab("sammlung"));
tabBestellungenBtn.addEventListener("click", () => setAppTab("bestellungen"));

function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem(VIEW_KEY, mode);
  viewGridBtn.classList.toggle("active", mode === "grid");
  viewListBtn.classList.toggle("active", mode === "list");
  render();
}

viewGridBtn.addEventListener("click", () => setViewMode("grid"));
viewListBtn.addEventListener("click", () => setViewMode("list"));

function setActiveYear(year) {
  activeYear = year;
  localStorage.setItem(YEAR_KEY, year);
  renderYearTabs();
  render();
  closeYearDropdown(sammlungFilterBar);
}

function renderYearTabs() {
  sammlungFilterBar.querySelector(".year-tabs-toggle-label").textContent = activeYear || "Alle Jahre";
  yearTabs.innerHTML = "";

  const allTab = document.createElement("button");
  allTab.type = "button";
  allTab.className = "year-tab" + (activeYear === "" ? " active" : "");
  allTab.textContent = "Alle Jahre";
  allTab.addEventListener("click", () => setActiveYear(""));
  yearTabs.appendChild(allTab);

  for (const year of YEAR_OPTIONS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "year-tab" + (activeYear === year ? " active" : "");
    tab.textContent = year;
    tab.addEventListener("click", () => setActiveYear(year));
    yearTabs.appendChild(tab);
  }
}

// --- Bestellungen ---

const orderYearTabs = document.getElementById("orderYearTabs");
const ordersList = document.getElementById("ordersList");
const ordersEmptyState = document.getElementById("ordersEmptyState");
const orderSearchInput = document.getElementById("orderSearchInput");
const haendlerOptions = document.getElementById("haendlerOptions");

orderSearchInput.addEventListener("input", renderOrders);

function populateHaendlerOptions() {
  const names = [...new Set(orders.map((o) => (o.haendler || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "de")
  );
  haendlerOptions.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

// --- Bestellungen: Mehrfachauswahl + CSV-Export (spiegelt die Sammlung) ---

const orderBulkBar = document.getElementById("orderBulkBar");
const orderBulkCount = document.getElementById("orderBulkCount");
const orderBulkClearBtn = document.getElementById("orderBulkClearBtn");
const orderBulkSelectAllBtn = document.getElementById("orderBulkSelectAllBtn");
const orderBulkExportCsvBtn = document.getElementById("orderBulkExportCsvBtn");
const orderBulkDoneBtn = document.getElementById("orderBulkDoneBtn");

let orderSelectionMode = false;
let orderSelectedIds = new Set();

function setOrderSelectionMode(on) {
  orderSelectionMode = on;
  if (!on) orderSelectedIds.clear();
  addOrderBtn.hidden = on || appTab !== "bestellungen";
  updateOrderBulkBar();
  renderOrders();
}

function enterOrderSelectionMode(initialId) {
  orderSelectionMode = true;
  orderSelectedIds.add(initialId);
  addOrderBtn.hidden = true;
  updateOrderBulkBar();
  renderOrders();
}

function toggleOrderSelected(id) {
  if (orderSelectedIds.has(id)) {
    orderSelectedIds.delete(id);
  } else {
    orderSelectedIds.add(id);
  }
  updateOrderBulkBar();
  renderOrders();
}

function updateOrderBulkBar() {
  orderBulkBar.hidden = !orderSelectionMode;
  orderBulkCount.textContent = `${orderSelectedIds.size} ausgewählt`;
  orderBulkExportCsvBtn.disabled = orderSelectedIds.size === 0;
}

orderBulkDoneBtn.addEventListener("click", () => setOrderSelectionMode(false));
orderBulkClearBtn.addEventListener("click", () => {
  orderSelectedIds.clear();
  updateOrderBulkBar();
  renderOrders();
});
orderBulkSelectAllBtn.addEventListener("click", () => {
  const filtered = getFilteredOrders();
  const allSelected = filtered.length > 0 && filtered.every((o) => orderSelectedIds.has(o.id));
  if (allSelected) {
    orderSelectedIds.clear();
  } else {
    for (const o of filtered) orderSelectedIds.add(o.id);
  }
  updateOrderBulkBar();
  renderOrders();
});

let orderActiveYear = localStorage.getItem(ORDER_YEAR_KEY) || "";

function setOrderActiveYear(year) {
  orderActiveYear = year;
  localStorage.setItem(ORDER_YEAR_KEY, year);
  renderOrderYearTabs();
  renderOrders();
  closeYearDropdown(orderFilterBar);
}

function renderOrderYearTabs() {
  orderFilterBar.querySelector(".year-tabs-toggle-label").textContent = orderActiveYear || "Alle Jahre";
  orderYearTabs.innerHTML = "";

  const allTab = document.createElement("button");
  allTab.type = "button";
  allTab.className = "year-tab" + (orderActiveYear === "" ? " active" : "");
  allTab.textContent = "Alle Jahre";
  allTab.addEventListener("click", () => setOrderActiveYear(""));
  orderYearTabs.appendChild(allTab);

  for (const year of ORDER_YEAR_OPTIONS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "year-tab" + (orderActiveYear === year ? " active" : "");
    tab.textContent = year;
    tab.addEventListener("click", () => setOrderActiveYear(year));
    orderYearTabs.appendChild(tab);
  }
}

function getFilteredOrders() {
  const query = orderSearchInput.value.trim().toLowerCase();

  return orders
    .filter((o) => {
      const matchesYear = !orderActiveYear || o.jahr === orderActiveYear;
      const matchesQuery =
        !query ||
        o.name.toLowerCase().includes(query) ||
        (o.haendler || "").toLowerCase().includes(query);
      return matchesYear && matchesQuery;
    })
    .sort((a, b) => (b.datum || "").localeCompare(a.datum || ""));
}

function findChiliNrForOrderName(name) {
  const key = varietyKey(name);
  if (!key) return "";
  const match = chilis.find((c) => varietyKey(c.name) === key && c.nr);
  return match?.nr || "";
}

function renderOrders() {
  const filtered = getFilteredOrders();

  ordersList.innerHTML = "";
  ordersEmptyState.hidden = filtered.length > 0;
  ordersEmptyState.querySelector("p").innerHTML =
    orders.length === 0
      ? 'Noch keine Bestellungen erfasst.<br>Leg mit dem <strong>+</strong>-Button los.'
      : 'Keine Bestellungen für diese Auswahl.<br>Anderes Jahr oder anderen Suchbegriff probieren.';

  for (const o of filtered) {
    ordersList.appendChild(buildOrderRow(o));
  }
}

function buildOrderRow(o) {
  const isSelected = orderSelectedIds.has(o.id);
  const row = document.createElement("div");
  row.className = "chili-row" + (isSelected ? " selected" : "");
  row.addEventListener("click", () => {
    if (orderSelectionMode) {
      toggleOrderSelected(o.id);
    } else {
      openOrderModal(o.id);
    }
  });
  attachLongPress(row, () => {
    if (!orderSelectionMode) enterOrderSelectionMode(o.id);
  });
  const nr = findChiliNrForOrderName(o.name);
  row.innerHTML = `
    ${orderSelectionMode ? `<span class="row-select-checkbox${isSelected ? " checked" : ""}">${isSelected ? "✓" : ""}</span>` : ""}
    <span class="row-nr">${nr ? `Nr. ${escapeHtml(nr)}` : ""}</span>
    <span class="row-name">${escapeHtml(o.name)}</span>
    <div class="row-badges">
      ${o.menge ? `<span class="badge">${escapeHtml(o.menge)}</span>` : ""}
      ${o.haendler ? `<span class="badge">${escapeHtml(o.haendler)}</span>` : ""}
      ${o.preis ? `<span class="badge">${escapeHtml(o.preis)}</span>` : ""}
      <span class="badge badge-status">${escapeHtml(o.jahr)}</span>
    </div>
  `;
  return row;
}

const orderModal = document.getElementById("orderModal");
const orderForm = document.getElementById("orderForm");
const orderDeleteBtn = document.getElementById("orderDeleteBtn");

fillOptions(document.getElementById("orderFieldJahr"), ORDER_YEAR_OPTIONS);

function openOrderModal(id) {
  const order = id ? orders.find((o) => o.id === id) : null;

  document.getElementById("orderId").value = order ? order.id : "";
  document.getElementById("orderFieldJahr").value = order?.jahr || orderActiveYear || DEFAULT_YEAR;
  document.getElementById("orderFieldName").value = order?.name || "";
  document.getElementById("orderFieldMenge").value = order?.menge || "";
  document.getElementById("orderFieldHaendler").value = order?.haendler || "";
  document.getElementById("orderFieldDatum").value = order?.datum || "";
  document.getElementById("orderFieldPreis").value = order?.preis || "";
  document.getElementById("orderFieldNotizen").value = order?.notizen || "";

  document.getElementById("orderModalTitle").textContent = order ? "Bestellung bearbeiten" : "Neue Bestellung";
  orderDeleteBtn.hidden = !order;
  populateHaendlerOptions();
  orderModal.hidden = false;
}

function closeOrderModal() {
  orderModal.hidden = true;
  orderForm.reset();
}

orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("orderId").value || uid();
  const data = {
    id,
    jahr: document.getElementById("orderFieldJahr").value,
    name: document.getElementById("orderFieldName").value.trim(),
    menge: document.getElementById("orderFieldMenge").value.trim(),
    haendler: document.getElementById("orderFieldHaendler").value.trim(),
    datum: document.getElementById("orderFieldDatum").value || null,
    preis: document.getElementById("orderFieldPreis").value.trim(),
    notizen: document.getElementById("orderFieldNotizen").value.trim(),
  };

  const ok = await upsertOrderRemote(data);
  if (!ok) return;

  const existingIndex = orders.findIndex((o) => o.id === id);
  if (existingIndex >= 0) {
    orders[existingIndex] = data;
  } else {
    orders.push(data);
  }

  closeOrderModal();
  renderOrders();
});

orderDeleteBtn.addEventListener("click", async () => {
  const id = document.getElementById("orderId").value;
  if (!id) return;
  if (!confirm("Diese Bestellung wirklich löschen?")) return;
  const ok = await deleteOrderRemote(id);
  if (!ok) return;
  orders = orders.filter((o) => o.id !== id);
  closeOrderModal();
  renderOrders();
});

document.getElementById("orderModalCloseBtn").addEventListener("click", closeOrderModal);
addOrderBtn.addEventListener("click", () => openOrderModal(null));
orderModal.addEventListener("click", (e) => {
  if (e.target === orderModal) closeOrderModal();
});

function fillOptions(select, values) {
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
}

function populateStatusFilter() {
  fillOptions(statusFilter, STATUS_OPTIONS);
}

function populateYearSelect() {
  fillOptions(document.getElementById("fieldJahr"), YEAR_OPTIONS);
}

function nextCatalogNr() {
  const highest = chilis.reduce((max, c) => Math.max(max, parseInt(c.nr, 10) || 0), 0);
  return String(highest + 1);
}

function sgValue(sg) {
  return normalizeSg(sg).num;
}

// In der Uebersicht (Karten/Zeilen) auf einen Blick erkennbar statt reinem
// Text, der bei jeder Sorte gleich aussah - der genaue Wert steht weiterhin
// im Bearbeiten-Fenster ("Schärfegrad X").
function sgHeatBar(sg) {
  const norm = normalizeSg(sg);
  const segments = Array.from({ length: 10 }, (_, i) => {
    const filled = norm.plus || i < norm.num;
    return `<span class="sg-heat-seg${filled ? " filled" : ""}"></span>`;
  }).join("");
  const title = norm.display ? `Schärfegrad ${norm.display}` : "Schärfegrad unbekannt";
  return `<span class="sg-heat-bar${norm.plus ? " sg-heat-bar-plus" : ""}" title="${title}">${segments}</span>`;
}

function sortChilis(list) {
  const sorted = [...list];
  switch (sortSelect.value) {
    case "sg-desc":
      sorted.sort((a, b) => sgValue(b.sg) - sgValue(a.sg));
      break;
    case "sg-asc":
      sorted.sort((a, b) => sgValue(a.sg) - sgValue(b.sg));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "de"));
      break;
    case "sorte":
      sorted.sort((a, b) => (a.sorte || "").localeCompare(b.sorte || "", "de"));
      break;
    case "created-desc":
      sorted.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      break;
    default:
      sorted.sort((a, b) => (parseInt(a.nr, 10) || 0) - (parseInt(b.nr, 10) || 0));
  }
  return sorted;
}

// --- Erweiterte Filter: Scoville-Bereich + Geschmacks-Tags ---
// Gab es vorher nicht (kein Filter-Code dafür im Bestand, nur das einzelne
// Scoville-Freitextfeld pro Chili) - deshalb hier komplett neu aufgebaut,
// nicht "repariert".

const advancedFilterToggle = document.getElementById("advancedFilterToggle");
const advancedFilterPanel = document.getElementById("advancedFilterPanel");
const activeFilterChipsEl = document.getElementById("activeFilterChips");
const scovilleMinFilterEl = document.getElementById("scovilleMinFilter");
const scovilleMaxFilterEl = document.getElementById("scovilleMaxFilter");
const scovilleIncludeUnknownEl = document.getElementById("scovilleIncludeUnknown");
const sgMinFilterEl = document.getElementById("sgMinFilter");
const sgIncludeUnknownEl = document.getElementById("sgIncludeUnknown");
const tasteFilterChipsEl = document.getElementById("tasteFilterChips");
const resetAdvancedFiltersBtn = document.getElementById("resetAdvancedFiltersBtn");

let selectedTasteFilterTags = [];

// Scoville steht im Bestand als Freitext ("1.500.000-2.200.000", "30000 SHU",
// leer, ...) - fürs Filtern brauchen wir echte Zahlen daraus.
function getChiliScovilleRange(c) {
  const raw = String(c.scoville || "");
  const nums = raw.match(/\d[\d.,]*/g);
  if (!nums || nums.length === 0) return null;
  const parsed = nums.map((n) => parseInt(n.replace(/[.,]/g, ""), 10)).filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return null;
  return { min: Math.min(...parsed), max: Math.max(...parsed) };
}

function renderTasteFilterChips() {
  tasteFilterChipsEl.innerHTML = "";
  TASTE_TAGS.forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-chip" + (selectedTasteFilterTags.includes(tag) ? " active" : "");
    btn.textContent = tag;
    btn.addEventListener("click", () => {
      selectedTasteFilterTags = selectedTasteFilterTags.includes(tag)
        ? selectedTasteFilterTags.filter((t) => t !== tag)
        : [...selectedTasteFilterTags, tag];
      renderTasteFilterChips();
      renderActiveFilterChips();
      render();
    });
    tasteFilterChipsEl.appendChild(btn);
  });
}

function renderActiveFilterChips() {
  activeFilterChipsEl.innerHTML = "";
  const min = scovilleMinFilterEl.value ? parseInt(scovilleMinFilterEl.value, 10) : null;
  const max = scovilleMaxFilterEl.value ? parseInt(scovilleMaxFilterEl.value, 10) : null;

  const chips = [];
  if (min != null || max != null) {
    const label = `Scoville: ${min ?? "0"}–${max ?? "∞"} SHU`;
    chips.push({
      label,
      onRemove: () => {
        scovilleMinFilterEl.value = "";
        scovilleMaxFilterEl.value = "";
      },
    });
  }
  const sgThreshold = normalizeSg(sgMinFilterEl.value);
  if (sgThreshold.display) {
    chips.push({
      label: `Schärfegrad ab ${sgThreshold.display}`,
      onRemove: () => {
        sgMinFilterEl.value = "";
      },
    });
  }
  selectedTasteFilterTags.forEach((tag) => {
    chips.push({
      label: tag,
      onRemove: () => {
        selectedTasteFilterTags = selectedTasteFilterTags.filter((t) => t !== tag);
        renderTasteFilterChips();
      },
    });
  });

  chips.forEach(({ label, onRemove }) => {
    const chip = document.createElement("span");
    chip.className = "active-filter-chip";
    chip.textContent = label;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Filter „${label}“ entfernen`);
    removeBtn.addEventListener("click", () => {
      onRemove();
      renderActiveFilterChips();
      render();
    });
    chip.appendChild(removeBtn);
    activeFilterChipsEl.appendChild(chip);
  });
}

advancedFilterToggle.addEventListener("click", () => {
  const isOpen = advancedFilterPanel.hidden;
  advancedFilterPanel.hidden = !isOpen;
  advancedFilterToggle.setAttribute("aria-expanded", String(isOpen));
});

[scovilleMinFilterEl, scovilleMaxFilterEl, scovilleIncludeUnknownEl, sgMinFilterEl, sgIncludeUnknownEl].forEach((el) => {
  el.addEventListener("input", () => {
    renderActiveFilterChips();
    render();
  });
});

resetAdvancedFiltersBtn.addEventListener("click", () => {
  scovilleMinFilterEl.value = "";
  scovilleMaxFilterEl.value = "";
  scovilleIncludeUnknownEl.checked = true;
  sgMinFilterEl.value = "";
  sgIncludeUnknownEl.checked = true;
  selectedTasteFilterTags = [];
  renderTasteFilterChips();
  renderActiveFilterChips();
  render();
});

function getFilteredChilis() {
  const query = searchInput.value.trim().toLowerCase();
  const statusQuery = statusFilter.value;
  const scovilleMin = scovilleMinFilterEl.value ? parseInt(scovilleMinFilterEl.value, 10) : null;
  const scovilleMax = scovilleMaxFilterEl.value ? parseInt(scovilleMaxFilterEl.value, 10) : null;
  const includeUnknownScoville = scovilleIncludeUnknownEl.checked;
  const sgThreshold = normalizeSg(sgMinFilterEl.value);
  const includeUnknownSg = sgIncludeUnknownEl.checked;

  return chilis.filter((c) => {
    const matchesQuery =
      !query ||
      c.name.toLowerCase().includes(query) ||
      (c.herkunft || "").toLowerCase().includes(query) ||
      (c.sorte || "").toLowerCase().includes(query) ||
      (c.nr || "").toLowerCase().includes(query);
    const matchesStatus = !statusQuery || c.status === statusQuery;
    const matchesYear = !activeYear || c.jahr === activeYear;

    let matchesScoville = true;
    if (scovilleMin != null || scovilleMax != null) {
      const range = getChiliScovilleRange(c);
      if (!range) {
        matchesScoville = includeUnknownScoville;
      } else {
        const lo = scovilleMin ?? -Infinity;
        const hi = scovilleMax ?? Infinity;
        // Bereichsüberlappung: die Sorten-Spanne muss den Filter-Bereich
        // irgendwo berühren, nicht komplett darin liegen - sonst würden
        // z.B. Sorten mit "30.000-50.000" bei einem Filter "40.000-60.000"
        // fälschlich rausfallen, obwohl sie sich überschneiden.
        matchesScoville = range.min <= hi && range.max >= lo;
      }
    }

    let matchesSg = true;
    if (sgThreshold.display) {
      const chiliSg = normalizeSg(c.sg);
      matchesSg = chiliSg.display ? chiliSg.num >= sgThreshold.num : includeUnknownSg;
    }

    const matchesTasteTags =
      selectedTasteFilterTags.length === 0 ||
      (c.geschmack_tags || []).some((t) => selectedTasteFilterTags.includes(t));

    return matchesQuery && matchesStatus && matchesYear && matchesScoville && matchesSg && matchesTasteTags;
  });
}

function groupChilisByVariety(list) {
  const groups = new Map();
  for (const chili of list) {
    // Ein leerer Name darf nicht alle unvollstaendigen Datensaetze verbinden.
    const key = varietyKey(chili.name) || `id:${chili.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(chili);
  }

  return [...groups.values()].map((entries) => {
    const ordered = [...entries].sort(
      (a, b) => String(b.jahr || "").localeCompare(String(a.jahr || ""))
    );
    const representative = { ...ordered[0] };
    representative._linkedChilis = ordered;
    representative._years = [...new Set(ordered.map((c) => c.jahr).filter(Boolean))].sort((a, b) =>
      String(b).localeCompare(String(a))
    );
    if (!representative.fotos?.length) {
      representative.fotos = ordered.find((c) => c.fotos?.length)?.fotos || [];
    }
    return representative;
  });
}

function renderBrandStats() {
  const total = chilis.length;
  if (total === 0) {
    brandStatsEl.textContent = "Alle Pflanzen, ein Blick";
    return;
  }
  const varieties = new Set(chilis.map((c) => varietyKey(c.name)).filter(Boolean)).size;
  const years = new Set(chilis.map((c) => c.jahr).filter(Boolean)).size;
  const plural = (n, singular, pluralWord) => (n === 1 ? singular : pluralWord);
  brandStatsEl.textContent =
    `${total} ${plural(total, "Pflanze", "Pflanzen")} · ` +
    `${varieties} ${plural(varieties, "Sorte", "Sorten")} · ` +
    `${years} ${plural(years, "Jahr", "Jahre")}`;
}

function render() {
  renderBrandStats();
  const filtered = getFilteredChilis();
  // In "Alle Jahre" wird jede Sorte nur einmal gezeigt. Waehrend der
  // Mehrfachauswahl bleiben die einzelnen Pflanzen sichtbar und waehlbar.
  const visible = !activeYear && !selectionMode ? groupChilisByVariety(filtered) : filtered;
  const sorted = sortChilis(visible);

  grid.innerHTML = "";
  emptyState.hidden = filtered.length > 0;
  emptyState.querySelector("p").innerHTML =
    chilis.length === 0
      ? 'Noch keine Chilis in der Sammlung.<br>Leg mit dem <strong>+</strong>-Button los.'
      : 'Keine Chilis für diese Auswahl.<br>Anderes Jahr oder anderen Filter probieren.';
  grid.className = viewMode === "list" ? "chili-list" : "chili-grid";

  for (const c of sorted) {
    grid.appendChild(viewMode === "list" ? buildRow(c) : buildCard(c));
  }
}

function buildCard(c) {
  const isSelected = selectedIds.has(c.id);
  const card = document.createElement("div");
  card.className = "chili-card" + (isSelected ? " selected" : "");
  card.addEventListener("click", () => {
    if (selectionMode) {
      toggleSelected(c.id);
    } else {
      openModal(c.id);
    }
  });
  attachLongPress(card, () => {
    if (!selectionMode) enterSelectionMode(c.id);
  });

  const photoWrap = document.createElement("div");
  photoWrap.className = "card-photo-wrap";

  const photo = c.fotos && c.fotos[0];
  if (photo) {
    const img = document.createElement("img");
    img.className = "card-photo";
    img.src = photo;
    img.alt = c.name;
    photoWrap.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "card-photo-placeholder";
    placeholder.textContent = "🌶️";
    photoWrap.appendChild(placeholder);
  }
  if (c.nr) {
    const nrBadge = document.createElement("span");
    nrBadge.className = "card-nr";
    nrBadge.textContent = `Nr. ${c.nr}`;
    photoWrap.appendChild(nrBadge);
  }
  if (selectionMode) {
    const checkbox = document.createElement("span");
    checkbox.className = "card-select-checkbox" + (isSelected ? " checked" : "");
    checkbox.textContent = isSelected ? "✓" : "";
    photoWrap.appendChild(checkbox);
  }
  card.appendChild(photoWrap);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <h3>${escapeHtml(c.name)}</h3>
    <span class="card-meta">${escapeHtml(c.herkunft || "Herkunft unbekannt")}</span>
    <div class="card-badges">
      ${sgHeatBar(c.sg)}
      ${c._linkedChilis && c._years.length > 1 ? `<span class="badge badge-status">${c._years.length} Anbaujahre</span>` : `<span class="badge badge-status">${escapeHtml(c.status || "Aussaat")}</span>`}
      ${!c._linkedChilis && activeYear === "" && c.jahr ? `<span class="badge">${escapeHtml(c.jahr)}</span>` : ""}
    </div>
  `;
  appendYearLinks(body.querySelector(".card-badges"), c);
  card.appendChild(body);
  return card;
}

function buildRow(c) {
  const isSelected = selectedIds.has(c.id);
  const row = document.createElement("div");
  row.className = "chili-row" + (isSelected ? " selected" : "");
  row.addEventListener("click", () => {
    if (selectionMode) {
      toggleSelected(c.id);
    } else {
      openModal(c.id);
    }
  });
  attachLongPress(row, () => {
    if (!selectionMode) enterSelectionMode(c.id);
  });
  row.innerHTML = `
    ${selectionMode ? `<span class="row-select-checkbox${isSelected ? " checked" : ""}">${isSelected ? "✓" : ""}</span>` : ""}
    <span class="row-nr">${c.nr ? `Nr. ${escapeHtml(c.nr)}` : ""}</span>
    <span class="row-name">${escapeHtml(c.name)}</span>
    <div class="row-badges">
      ${sgHeatBar(c.sg)}
      ${c._linkedChilis && c._years.length > 1 ? `<span class="badge badge-status">${c._years.length} Anbaujahre</span>` : `<span class="badge badge-status">${escapeHtml(c.status || "Aussaat")}</span>`}
      ${!c._linkedChilis && activeYear === "" && c.jahr ? `<span class="badge">${escapeHtml(c.jahr)}</span>` : ""}
    </div>
  `;
  appendYearLinks(row.querySelector(".row-badges"), c);
  return row;
}

function appendYearLinks(container, chili) {
  if (!chili._linkedChilis || chili._years.length <= 1) return;
  const entriesByYear = new Map();
  for (const entry of chili._linkedChilis) {
    const year = entry.jahr || "ohne Jahr";
    if (!entriesByYear.has(year)) entriesByYear.set(year, entry);
  }
  for (const entry of entriesByYear.values()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "badge year-link";
    button.textContent = entry.jahr || "ohne Jahr";
    button.title = `${entry.name} im Jahr ${entry.jahr || "ohne Jahr"} bearbeiten`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(entry.id);
    });
    container.appendChild(button);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- Modal / Form ---

const modal = document.getElementById("chiliModal");
const form = document.getElementById("chiliForm");
const deleteBtn = document.getElementById("deleteBtn");
const photoInput = document.getElementById("photoInput");
const photoGallery = document.getElementById("photoGallery");
const photoPlaceholder = document.getElementById("photoPlaceholder");
const photoGalleryCounter = document.getElementById("photoGalleryCounter");
const photoPrevBtn = document.getElementById("photoPrevBtn");
const photoNextBtn = document.getElementById("photoNextBtn");
const photoAddLabel = document.getElementById("photoAddLabel");
const photoThumbs = document.getElementById("photoThumbs");

// --- Schärfegrad: anklickbare 1-10-Skala statt Freitext ---
// fieldSg bleibt ein normales (jetzt verstecktes) Input, damit Speichern/
// Laden unverändert bleibt - nur die Bedienung ist jetzt eine Chili-Reihe.

const sgScale = document.getElementById("sgScale");
const sgScaleLabel = document.getElementById("sgScaleLabel");
const fieldSg = document.getElementById("fieldSg");

// normalizeSg(): einheitliche Sicht auf den sg-Wert für Anzeige/Sortierung -
// alte Bestände hatten teils leeren String, teils "0"; "10"/"10+" bleiben
// wie im Bestand erhalten (siehe Migrationshinweis), nur die Auswertung
// (Vergleich, Badges) läuft immer über diese Funktion.
function normalizeSg(value) {
  const str = String(value ?? "").trim();
  if (str === "10+") return { display: "10+", num: 10, plus: true };
  const num = parseInt(str, 10);
  if (!str || Number.isNaN(num)) return { display: "", num: 0, plus: false };
  return { display: str, num, plus: false };
}

function setSgScale(value) {
  const norm = normalizeSg(value);
  fieldSg.value = norm.display;
  sgScaleLabel.textContent = norm.display ? `Schärfegrad ${norm.display}` : "Kein Wert gewählt";
  sgScale.querySelectorAll(".sg-scale-btn").forEach((btn) => {
    if (btn.dataset.value === "10+") {
      btn.classList.toggle("filled", norm.plus);
    } else {
      btn.classList.toggle("filled", !norm.plus && parseInt(btn.dataset.value, 10) <= norm.num);
    }
  });
}

sgScale.addEventListener("click", (e) => {
  const btn = e.target.closest(".sg-scale-btn");
  if (!btn) return;
  const clickedVal = btn.dataset.value;
  setSgScale(clickedVal === fieldSg.value ? "" : clickedVal);
});

// --- Geschmacks-Tags: konfigurierbare Chip-Auswahl statt reinem Freitext ---
// Als eigenes Array, damit später leicht neue Tags ergänzt werden können und
// die Auswahl als Array (geschmack_tags) auswertbar bleibt (z.B. Häufigkeit
// je Tag in einer künftigen Statistik).

const TASTE_TAGS = [
  "fruchtig",
  "rauchig",
  "erdig",
  "süß",
  "scharf-brennend",
  "blumig",
  "nussig",
  "grasig",
  "bitter",
  "sauer/zitrusartig",
];

const geschmackTagsEl = document.getElementById("geschmackTags");
let selectedTasteTags = [];

function renderTasteTagChips() {
  geschmackTagsEl.innerHTML = "";
  TASTE_TAGS.forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-chip" + (selectedTasteTags.includes(tag) ? " active" : "");
    btn.textContent = tag;
    btn.addEventListener("click", () => {
      selectedTasteTags = selectedTasteTags.includes(tag)
        ? selectedTasteTags.filter((t) => t !== tag)
        : [...selectedTasteTags, tag];
      renderTasteTagChips();
    });
    geschmackTagsEl.appendChild(btn);
  });
}

// --- Sorten-Referenzdatenbank: Herkunft/Art/Scoville-Vorschlag beim Namen ---
// Zwei Quellen werden zusammengeführt: die mitgelieferte data/chili-reference.json
// (offline, kein Server nötig) und die Supabase-Tabelle "chili_reference", in
// die Nutzer manuell nachgetragene Sorten zurückschreiben können ("Für
// andere Jahre/Sorten merken") - Supabase-Einträge überschreiben dabei
// gleichnamige statische Einträge, weil sie die aktuellere, von Menschen
// bestätigte Quelle sind. Fuzzy-Match toleriert Groß-/Kleinschreibung,
// Leerzeichen und kleine Tippfehler (z.B. "Numex Twilight" vs. "NuMex
// Twilight", "Glocken rot" vs. "Glocken Rot").

let referenceDb = [];

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeForMatch(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      row[j] =
        a[i - 1] === b[j - 1]
          ? prevRow[j - 1]
          : 1 + Math.min(prevRow[j - 1], prevRow[j], row[j - 1]);
    }
    prevRow = row;
  }
  return prevRow[n];
}

async function loadReferenceDb() {
  let staticEntries = [];
  try {
    const res = await fetch("data/chili-reference.json");
    staticEntries = await res.json();
  } catch (e) {
    console.warn("Statische Referenzdatenbank konnte nicht geladen werden", e);
  }

  let dynamicEntries = [];
  try {
    const { data, error } = await sb.from("chili_reference").select("*");
    if (error) throw error;
    dynamicEntries = data || [];
  } catch (e) {
    console.warn("Supabase-Referenzdatenbank konnte nicht geladen werden", e);
  }

  const merged = new Map();
  for (const e of staticEntries) {
    merged.set(normalizeForMatch(e.name), {
      name: e.name,
      herkunft: e.herkunft || "",
      art: e.art || "",
      scovilleMin: e.scovilleMin || e.scovilleMin === 0 ? e.scovilleMin : null,
      scovilleMax: e.scovilleMax || e.scovilleMax === 0 ? e.scovilleMax : null,
      geschmack: e.geschmack || "",
      geschmackTags: e.geschmack_tags || [],
      quelle: e.quelle || "",
      quelleDetail: e.quelle_detail || "",
    });
  }
  for (const e of dynamicEntries) {
    merged.set(normalizeForMatch(e.name), {
      name: e.name,
      herkunft: e.herkunft || "",
      art: e.art || "",
      scovilleMin: e.scoville_min ?? null,
      scovilleMax: e.scoville_max ?? null,
      geschmack: e.geschmack || "",
      geschmackTags: e.geschmack_tags || [],
      quelle: e.quelle || "",
      quelleDetail: e.quelle_detail || "",
    });
  }
  referenceDb = [...merged.values()];
}

function findReferenceMatch(name) {
  const query = normalizeForMatch(name);
  if (!query || query.length < 3) return null;

  for (const entry of referenceDb) {
    if (normalizeForMatch(entry.name) === query) return entry;
  }

  let best = null;
  let bestDist = Infinity;
  for (const entry of referenceDb) {
    const candidate = normalizeForMatch(entry.name);
    const dist = levenshteinDistance(query, candidate);
    const threshold = Math.max(1, Math.floor(candidate.length * 0.15));
    if (dist <= threshold && dist < bestDist) {
      best = entry;
      bestDist = dist;
    }
  }
  return best;
}

const referenceSuggestion = document.getElementById("referenceSuggestion");
const referenceSuggestionName = document.getElementById("referenceSuggestionName");
const referenceSuggestionDetails = document.getElementById("referenceSuggestionDetails");
const referenceApplyBtn = document.getElementById("referenceApplyBtn");
const referenceDismissBtn = document.getElementById("referenceDismissBtn");
const referenceSaveBackWrap = document.getElementById("referenceSaveBackWrap");
const referenceSaveBackCheckbox = document.getElementById("referenceSaveBackCheckbox");

let currentReferenceMatch = null;

function formatScovilleRange(min, max) {
  if (min == null && max == null) return "";
  if (min != null && max != null) return `${min.toLocaleString("de")}–${max.toLocaleString("de")} SHU`;
  return `${(min ?? max).toLocaleString("de")} SHU`;
}

function updateReferenceSuggestion() {
  const name = document.getElementById("fieldName").value.trim();
  currentReferenceMatch = findReferenceMatch(name);

  if (!currentReferenceMatch) {
    referenceSuggestion.hidden = true;
    // Nur anbieten, in die Referenzdatenbank zurückzuschreiben, wenn
    // überhaupt ein Name eingegeben ist - sonst ergibt der Haken keinen Sinn.
    referenceSaveBackWrap.hidden = !name;
    return;
  }

  referenceSaveBackWrap.hidden = true;

  const hasAnyInfo =
    currentReferenceMatch.herkunft ||
    currentReferenceMatch.art ||
    currentReferenceMatch.scovilleMin != null ||
    currentReferenceMatch.scovilleMax != null ||
    currentReferenceMatch.geschmack ||
    (currentReferenceMatch.geschmackTags && currentReferenceMatch.geschmackTags.length > 0);
  if (!hasAnyInfo) {
    referenceSuggestion.hidden = true;
    // Zwar ein (leerer) Referenz-Eintrag vorhanden (z.B. "keine verlässliche
    // Quelle gefunden"), aber keine brauchbaren Werte - Nutzer soll trotzdem
    // die Möglichkeit haben, selbst Recherchiertes/Gewusstes zu ergänzen.
    referenceSaveBackWrap.hidden = !name;
    return;
  }

  referenceSuggestionName.textContent = currentReferenceMatch.name;
  referenceSuggestionDetails.innerHTML = "";
  const rows = [];
  if (currentReferenceMatch.herkunft) rows.push(`Herkunft: ${escapeHtml(currentReferenceMatch.herkunft)}`);
  if (currentReferenceMatch.art) rows.push(`Botanische Art: ${escapeHtml(currentReferenceMatch.art)}`);
  const scovilleText = formatScovilleRange(currentReferenceMatch.scovilleMin, currentReferenceMatch.scovilleMax);
  if (scovilleText) rows.push(`Scoville: ${escapeHtml(scovilleText)}`);
  if (currentReferenceMatch.geschmackTags && currentReferenceMatch.geschmackTags.length > 0) {
    rows.push(`Geschmack: ${escapeHtml(currentReferenceMatch.geschmackTags.join(", "))}`);
  }
  if (currentReferenceMatch.geschmack) rows.push(`Notiz: ${escapeHtml(currentReferenceMatch.geschmack)}`);
  if (currentReferenceMatch.quelle) {
    const detail = currentReferenceMatch.quelleDetail ? ` (${currentReferenceMatch.quelleDetail})` : "";
    rows.push(`<em>Quelle: ${escapeHtml(currentReferenceMatch.quelle)}${escapeHtml(detail)}</em>`);
  }
  referenceSuggestionDetails.innerHTML = rows.map((r) => `<li>${r}</li>`).join("");

  referenceSuggestion.hidden = false;
}

document.getElementById("fieldName").addEventListener("input", updateReferenceSuggestion);

referenceApplyBtn.addEventListener("click", () => {
  if (!currentReferenceMatch) return;
  if (currentReferenceMatch.herkunft) document.getElementById("fieldHerkunft").value = currentReferenceMatch.herkunft;
  if (currentReferenceMatch.art) document.getElementById("fieldArt").value = currentReferenceMatch.art;
  const scovilleText = formatScovilleRange(currentReferenceMatch.scovilleMin, currentReferenceMatch.scovilleMax);
  if (scovilleText) document.getElementById("fieldScoville").value = scovilleText;
  if (currentReferenceMatch.geschmackTags && currentReferenceMatch.geschmackTags.length > 0) {
    selectedTasteTags = [...new Set([...selectedTasteTags, ...currentReferenceMatch.geschmackTags])];
    renderTasteTagChips();
  }
  referenceSuggestion.hidden = true;
});

referenceDismissBtn.addEventListener("click", () => {
  referenceSuggestion.hidden = true;
});

async function saveReferenceEntryIfRequested() {
  if (!referenceSaveBackCheckbox.checked) return;
  const name = document.getElementById("fieldName").value.trim();
  if (!name) return;

  const herkunft = document.getElementById("fieldHerkunft").value.trim();
  const art = document.getElementById("fieldArt").value.trim();
  const scovilleRaw = document.getElementById("fieldScoville").value.trim();
  const scovilleNums = scovilleRaw.match(/\d[\d.,]*/g) || [];
  const parseScovilleNum = (s) => parseInt(s.replace(/[.,]/g, ""), 10);
  const scovilleMin = scovilleNums.length > 0 ? parseScovilleNum(scovilleNums[0]) : null;
  const scovilleMax = scovilleNums.length > 1 ? parseScovilleNum(scovilleNums[1]) : scovilleMin;

  const row = {
    name,
    herkunft: herkunft || null,
    art: art || null,
    scoville_min: Number.isFinite(scovilleMin) ? scovilleMin : null,
    scoville_max: Number.isFinite(scovilleMax) ? scovilleMax : null,
    geschmack: document.getElementById("fieldGeschmack").value.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from("chili_reference").upsert(row);
  if (error) {
    console.warn("Konnte Referenzdatenbank nicht aktualisieren", error);
    return;
  }
  await loadReferenceDb();
}

function openModal(id) {
  const chili = id ? chilis.find((c) => c.id === id) : null;

  // Neue Chili bekommt sofort eine feste ID, damit Fotos schon während des
  // Ausfüllens in den richtigen Storage-Ordner hochgeladen werden können.
  document.getElementById("chiliId").value = chili ? chili.id : uid();
  document.getElementById("fieldNr").value = chili?.nr || (chili === null ? nextCatalogNr() : "");
  document.getElementById("fieldName").value = chili?.name || "";
  document.getElementById("fieldJahr").value = chili?.jahr || activeYear || DEFAULT_YEAR;
  document.getElementById("fieldSorte").value = chili?.sorte || "";
  document.getElementById("fieldHerkunft").value = chili?.herkunft || "";
  document.getElementById("fieldArt").value = chili?.art || "";
  setSgScale(chili?.sg || "");
  document.getElementById("fieldScoville").value = chili?.scoville || "";
  document.getElementById("fieldStatus").value = chili?.status || "Aussaat";
  document.getElementById("fieldPflanzdatum").value = chili?.pflanzdatum || "";
  document.getElementById("fieldErntedatum").value = chili?.erntedatum || "";
  document.getElementById("fieldErntenotizen").value = chili?.erntenotizen || "";
  document.getElementById("fieldGeschmack").value = chili?.geschmack || "";
  document.getElementById("fieldNotizen").value = chili?.notizen || "";

  selectedTasteTags = chili?.geschmack_tags ? [...chili.geschmack_tags] : [];
  renderTasteTagChips();

  referenceSaveBackCheckbox.checked = false;
  referenceSuggestion.hidden = true;
  updateReferenceSuggestion();

  currentPhotos = chili?.fotos ? [...chili.fotos] : [];
  renderPhotoPreview();

  document.getElementById("chiliModalTitle").textContent = chili ? "Chili bearbeiten" : "Neue Chili";
  deleteBtn.hidden = !chili;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  form.reset();
  currentPhotos = [];
  ocrResult.hidden = true;
  ocrStatus.hidden = true;
  ocrRawText.value = "";
  ocrSuggestions.innerHTML = "";
}

// --- QR-Etiketten fürs Topf (Desktop) ---
// Kodiert je Chili einen Link zurück auf genau diese (?chili=<id>), damit
// man nach dem Scannen direkt in den Details landet statt nur auf der
// Startseite. Ein einziges gemeinsames Modal für "eine Chili" (Button im
// Bearbeiten-Fenster) und "mehrere markierte" (Button in der Auswahl-
// Leiste) - mehrere Etiketten passen nebeneinander auf ein Blatt, statt
// pro QR-Code eine eigene Seite zu verschwenden.

const qrPrintBtn = document.getElementById("qrPrintBtn");
const bulkQrBtn = document.getElementById("bulkQrBtn");
const qrLabelsModal = document.getElementById("qrLabelsModal");
const qrLabelsCloseBtn = document.getElementById("qrLabelsCloseBtn");
const qrPrintArea = document.getElementById("qrPrintArea");
const qrDoPrintBtn = document.getElementById("qrDoPrintBtn");
const qrClosePreviewBtn = document.getElementById("qrClosePreviewBtn");

function chiliDeepLink(id) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("chili", id);
  return url.toString();
}

function buildQrLabel(chili) {
  const qr = qrcode(0, "M");
  qr.addData(chiliDeepLink(chili.id));
  qr.make();

  const label = document.createElement("div");
  label.className = "qr-label";

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "qr-code-canvas";
  canvasWrap.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2 });
  label.appendChild(canvasWrap);

  const nameEl = document.createElement("div");
  nameEl.className = "qr-print-name";
  nameEl.textContent = chili.name || "Chili";
  label.appendChild(nameEl);

  if (chili.nr) {
    const nrEl = document.createElement("div");
    nrEl.className = "qr-print-nr";
    nrEl.textContent = `Katalog-Nr. ${chili.nr}`;
    label.appendChild(nrEl);
  }

  return label;
}

function openQrLabelsModal(chiliList) {
  qrPrintArea.innerHTML = "";
  chiliList.forEach((c) => qrPrintArea.appendChild(buildQrLabel(c)));
  qrLabelsModal.hidden = false;
}

function closeQrLabelsModal() {
  qrLabelsModal.hidden = true;
}

qrPrintBtn.addEventListener("click", () => {
  const id = document.getElementById("chiliId").value;
  const chili = chilis.find((c) => c.id === id);
  if (!chili) {
    alert("Bitte diese Chili zuerst speichern - danach hat sie eine feste Adresse für den QR-Code.");
    return;
  }
  openQrLabelsModal([chili]);
});

bulkQrBtn.addEventListener("click", () => {
  const selected = chilis.filter((c) => selectedIds.has(c.id));
  if (selected.length === 0) return;
  openQrLabelsModal(selected);
});

qrLabelsCloseBtn.addEventListener("click", closeQrLabelsModal);
qrClosePreviewBtn.addEventListener("click", closeQrLabelsModal);
qrLabelsModal.addEventListener("click", (e) => {
  if (e.target === qrLabelsModal) closeQrLabelsModal();
});

qrDoPrintBtn.addEventListener("click", () => {
  document.body.classList.add("qr-print-mode");
  window.print();
});

window.addEventListener("afterprint", () => {
  document.body.classList.remove("qr-print-mode");
});

// --- QR-Code-Scanner (Kamera in der Suchleiste) ---
// Liest den QR-Code direkt vom Topf-Etikett über die Handy-/Webcam ein und
// springt bei einem Treffer sofort zu dieser Chili - ohne Umweg über eine
// externe Kamera-App.

const scanQrBtn = document.getElementById("scanQrBtn");
const qrScanModal = document.getElementById("qrScanModal");
const qrScanCloseBtn = document.getElementById("qrScanCloseBtn");
const qrScanVideo = document.getElementById("qrScanVideo");
const qrScanMessage = document.getElementById("qrScanMessage");
const qrScanCanvas = document.createElement("canvas");
const qrScanCtx = qrScanCanvas.getContext("2d", { willReadFrequently: true });

let qrScanStream = null;
let qrScanRafId = null;

function setQrScanMessage(text, isError) {
  qrScanMessage.textContent = text || "";
  qrScanMessage.hidden = !text;
  qrScanMessage.classList.toggle("qr-scan-error", !!isError);
}

function extractChiliIdFromScan(text) {
  try {
    const url = new URL(text);
    return url.searchParams.get("chili");
  } catch {
    return null;
  }
}

function scanQrFrame() {
  if (!qrScanStream) return;
  if (qrScanVideo.readyState === qrScanVideo.HAVE_ENOUGH_DATA) {
    qrScanCanvas.width = qrScanVideo.videoWidth;
    qrScanCanvas.height = qrScanVideo.videoHeight;
    qrScanCtx.drawImage(qrScanVideo, 0, 0, qrScanCanvas.width, qrScanCanvas.height);
    const imageData = qrScanCtx.getImageData(0, 0, qrScanCanvas.width, qrScanCanvas.height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (result) {
      const chiliId = extractChiliIdFromScan(result.data);
      const chili = chiliId ? chilis.find((c) => c.id === chiliId) : null;
      if (chili) {
        closeQrScanModal();
        setAppTab("sammlung");
        openModal(chili.id);
        return;
      }
      setQrScanMessage("QR-Code erkannt, aber keine passende Chili dazu gefunden.", true);
    }
  }
  qrScanRafId = requestAnimationFrame(scanQrFrame);
}

async function openQrScanModal() {
  qrScanModal.hidden = false;
  setQrScanMessage("");
  try {
    qrScanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    qrScanVideo.srcObject = qrScanStream;
    await qrScanVideo.play();
    qrScanRafId = requestAnimationFrame(scanQrFrame);
  } catch (err) {
    setQrScanMessage("Kamera konnte nicht geöffnet werden: " + err.message, true);
  }
}

function closeQrScanModal() {
  qrScanModal.hidden = true;
  if (qrScanRafId) cancelAnimationFrame(qrScanRafId);
  qrScanRafId = null;
  if (qrScanStream) {
    qrScanStream.getTracks().forEach((track) => track.stop());
    qrScanStream = null;
  }
  qrScanVideo.srcObject = null;
}

scanQrBtn.addEventListener("click", openQrScanModal);
qrScanCloseBtn.addEventListener("click", closeQrScanModal);
qrScanModal.addEventListener("click", (e) => {
  if (e.target === qrScanModal) closeQrScanModal();
});

function renderPhotoPreview() {
  photoGallery.innerHTML = "";

  if (currentPhotos.length > 0) {
    photoGallery.hidden = false;
    photoPlaceholder.hidden = true;
    currentPhotos.forEach((src) => {
      const img = document.createElement("img");
      img.className = "photo-gallery-slide";
      img.src = src;
      img.alt = "Foto";
      photoGallery.appendChild(img);
    });
  } else {
    photoGallery.hidden = true;
    photoPlaceholder.hidden = false;
  }

  photoPrevBtn.hidden = currentPhotos.length <= 1;
  photoNextBtn.hidden = currentPhotos.length <= 1;
  updatePhotoGalleryCounter();

  photoThumbs.innerHTML = "";
  currentPhotos.forEach((src, index) => {
    const thumb = document.createElement("div");
    thumb.className = "photo-thumb";
    const img = document.createElement("img");
    img.src = src;
    img.addEventListener("click", () => scrollPhotoGalleryTo(index));
    thumb.appendChild(img);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentPhotos.splice(index, 1);
      renderPhotoPreview();
    });
    thumb.appendChild(removeBtn);
    photoThumbs.appendChild(thumb);
  });
}

function currentPhotoGalleryIndex() {
  if (photoGallery.clientWidth === 0) return 0;
  return Math.round(photoGallery.scrollLeft / photoGallery.clientWidth);
}

function updatePhotoGalleryCounter() {
  if (currentPhotos.length <= 1) {
    photoGalleryCounter.hidden = true;
    return;
  }
  photoGalleryCounter.hidden = false;
  const index = Math.min(currentPhotoGalleryIndex(), currentPhotos.length - 1);
  photoGalleryCounter.textContent = `${index + 1} / ${currentPhotos.length}`;
  photoThumbs.querySelectorAll(".photo-thumb").forEach((thumb, i) => {
    thumb.classList.toggle("active", i === index);
  });
}

function scrollPhotoGalleryTo(index) {
  const slide = photoGallery.children[index];
  if (slide) slide.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
}

let photoGalleryScrollTimer = null;
photoGallery.addEventListener("scroll", () => {
  clearTimeout(photoGalleryScrollTimer);
  photoGalleryScrollTimer = setTimeout(updatePhotoGalleryCounter, 80);
});
photoPrevBtn.addEventListener("click", () => {
  scrollPhotoGalleryTo(Math.max(0, currentPhotoGalleryIndex() - 1));
});
photoNextBtn.addEventListener("click", () => {
  scrollPhotoGalleryTo(Math.min(currentPhotos.length - 1, currentPhotoGalleryIndex() + 1));
});

photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files || []);
  const chiliId = document.getElementById("chiliId").value;
  photoInput.disabled = true;
  photoAddLabel.textContent = "⏳ Wird hochgeladen ...";

  for (const file of files) {
    let compressed;
    try {
      compressed = await compressImage(file);
    } catch (e) {
      alert(e.message);
      continue;
    }

    const path = `${chiliId}/${uid()}.jpg`;
    const { error } = await sb.storage
      .from(FOTOS_BUCKET)
      .upload(path, compressed, { contentType: "image/jpeg" });
    if (error) {
      alert("Foto-Upload fehlgeschlagen: " + error.message);
      continue;
    }
    const url = sb.storage.from(FOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
    currentPhotos.push(url);
  }

  photoInput.disabled = false;
  photoAddLabel.textContent = "Foto(s) hinzufügen";
  photoInput.value = "";
  renderPhotoPreview();
});

// --- OCR: Samentütchen fotografieren + clientseitige Texterkennung ---
// Tesseract.js (Kernbibliothek + Worker lokal vendored) läuft komplett im
// Browser, kein eigener Server/API-Key nötig. Die Sprachdaten (deu+eng, ein
// paar MB) und der wasm-Kern lädt Tesseract selbst von einem CDN nach -
// das ist bei der Dateigröße Standard (niemand vendort 10+MB Sprachdaten
// pro Sprache in ein Git-Repo) und funktioniert auf GitHub Pages wie jede
// andere Internetverbindung der App auch (z.B. zu Supabase). Erkannte
// Werte werden nie automatisch übernommen, nur als Vorschlag mit eigenem
// "Übernehmen"-Button pro Feld.

const ocrPhotoInput = document.getElementById("ocrPhotoInput");
const ocrStatus = document.getElementById("ocrStatus");
const ocrStatusText = document.getElementById("ocrStatusText");
const ocrResult = document.getElementById("ocrResult");
const ocrSuggestions = document.getElementById("ocrSuggestions");
const ocrRawText = document.getElementById("ocrRawText");

async function uploadChiliPhoto(chiliId, file) {
  let compressed;
  try {
    compressed = await compressImage(file);
  } catch (e) {
    alert(e.message);
    return null;
  }
  const path = `${chiliId}/${uid()}.jpg`;
  const { error } = await sb.storage.from(FOTOS_BUCKET).upload(path, compressed, { contentType: "image/jpeg" });
  if (error) {
    alert("Foto-Upload fehlgeschlagen: " + error.message);
    return null;
  }
  return sb.storage.from(FOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

function extractOcrSuggestions(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const suggestions = {};

  if (lines.length > 0 && lines[0].length <= 60) {
    suggestions.name = lines[0];
  }

  const originMatch = text.match(/(?:hersteller|herkunft|origin|produced by|made in)[:\s]+([^\n]{2,60})/i);
  if (originMatch) suggestions.herkunft = originMatch[1].trim();

  const scovilleMatch = text.match(/([\d.,]{2,})\s*(?:-|–|to)?\s*([\d.,]{2,})?\s*(?:shu|scoville)/i);
  if (scovilleMatch) {
    const nums = [scovilleMatch[1], scovilleMatch[2]].filter(Boolean).map((s) => s.replace(/[.,]/g, ""));
    if (nums.every((n) => /^\d+$/.test(n))) {
      suggestions.scoville = `${nums.join("–")} SHU`;
    }
  }

  return suggestions;
}

const OCR_FIELD_MAP = {
  name: { label: "Sortenname", targetId: "fieldName" },
  herkunft: { label: "Herkunft/Hersteller", targetId: "fieldHerkunft" },
  scoville: { label: "Scoville", targetId: "fieldScoville" },
};

function renderOcrSuggestions(suggestions) {
  ocrSuggestions.innerHTML = "";
  const keys = Object.keys(suggestions).filter((k) => suggestions[k]);
  if (keys.length === 0) {
    ocrSuggestions.innerHTML = '<p class="ocr-result-hint">Keine eindeutigen Vorschläge erkannt - Text unten prüfen.</p>';
    return;
  }
  keys.forEach((key) => {
    const { label, targetId } = OCR_FIELD_MAP[key];
    const row = document.createElement("div");
    row.className = "ocr-suggestion-row";
    row.innerHTML = `<span>${escapeHtml(label)}: ${escapeHtml(suggestions[key])}</span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Übernehmen";
    btn.addEventListener("click", () => {
      document.getElementById(targetId).value = suggestions[key];
      if (targetId === "fieldName") updateReferenceSuggestion();
      btn.disabled = true;
      btn.textContent = "Übernommen";
    });
    row.appendChild(btn);
    ocrSuggestions.appendChild(row);
  });
}

ocrPhotoInput.addEventListener("change", async () => {
  const file = ocrPhotoInput.files?.[0];
  if (!file) return;

  ocrPhotoInput.disabled = true;
  ocrResult.hidden = true;
  ocrStatus.hidden = false;
  ocrStatusText.textContent = "Texterkennung läuft ...";

  try {
    if (typeof Tesseract === "undefined") {
      throw new Error("Tesseract.js konnte nicht geladen werden (keine Internetverbindung?).");
    }
    const { data } = await Tesseract.recognize(file, "deu+eng", {
      workerPath: "vendor/tesseract-worker.min.js",
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          ocrStatusText.textContent = `Texterkennung läuft ... ${Math.round(m.progress * 100)}%`;
        }
      },
    });

    ocrRawText.value = (data.text || "").trim();
    renderOcrSuggestions(extractOcrSuggestions(data.text || ""));
    ocrResult.hidden = false;
  } catch (err) {
    ocrRawText.value = "";
    ocrSuggestions.innerHTML = `<p class="ocr-result-hint">Texterkennung fehlgeschlagen: ${escapeHtml(err.message)}</p>`;
    ocrResult.hidden = false;
  }

  ocrStatus.hidden = true;

  // Foto trotzdem wie gewohnt komprimiert im fotos-Array speichern, auch
  // wenn die Texterkennung fehlschlägt.
  const chiliId = document.getElementById("chiliId").value;
  const url = await uploadChiliPhoto(chiliId, file);
  if (url) {
    currentPhotos.push(url);
    renderPhotoPreview();
  }

  ocrPhotoInput.disabled = false;
  ocrPhotoInput.value = "";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("chiliId").value;
  const data = {
    id,
    nr: document.getElementById("fieldNr").value.trim(),
    name: document.getElementById("fieldName").value.trim(),
    jahr: document.getElementById("fieldJahr").value,
    sorte: document.getElementById("fieldSorte").value.trim(),
    herkunft: document.getElementById("fieldHerkunft").value.trim(),
    art: document.getElementById("fieldArt").value.trim(),
    sg: document.getElementById("fieldSg").value.trim(),
    scoville: document.getElementById("fieldScoville").value.trim(),
    status: document.getElementById("fieldStatus").value,
    pflanzdatum: document.getElementById("fieldPflanzdatum").value || null,
    erntedatum: document.getElementById("fieldErntedatum").value || null,
    erntenotizen: document.getElementById("fieldErntenotizen").value.trim(),
    geschmack: document.getElementById("fieldGeschmack").value.trim(),
    geschmack_tags: selectedTasteTags,
    notizen: document.getElementById("fieldNotizen").value.trim(),
    fotos: currentPhotos,
  };

  const existing = chilis.find((c) => c.id === id);
  const oldKey = varietyKey(existing?.name);
  const newKey = varietyKey(data.name);
  const linked = chilis.filter((c) => {
    const key = varietyKey(c.name);
    return c.id !== id && key && (key === oldKey || key === newKey);
  });
  const sharedValues = sharedVarietyOverrides(data);
  const linkedUpdates = linked.map((c) => ({ ...c, ...sharedValues }));

  // Den aktuellen Datensatz separat speichern. Bei einem Array-Upsert ergänzt
  // PostgREST die Spalten aller Objekte auf dieselbe Form. Weil bestehende
  // Einträge `created_at` enthalten, wurde dieses Feld bei einer neuen Chili
  // dadurch als NULL gesendet, statt den Datenbank-Standard zu verwenden.
  const ok = await upsertChiliRemote(data);
  if (!ok) return;

  // Für die verknüpften Jahre nur die tatsächlich gemeinsamen Felder ändern.
  // Dadurch bleiben `created_at` und sämtliche Saison-Daten unangetastet.
  const linkedOk = await updateLinkedChilisRemote(
    linked.map((c) => c.id),
    sharedValues
  );
  if (!linkedOk) return;

  await saveReferenceEntryIfRequested();

  for (const updated of linkedUpdates) {
    const index = chilis.findIndex((c) => c.id === updated.id);
    if (index >= 0) chilis[index] = updated;
  }

  const existingIndex = chilis.findIndex((c) => c.id === id);
  if (existingIndex >= 0) {
    chilis[existingIndex] = data;
  } else {
    chilis.push(data);
  }

  closeModal();
  render();
});

deleteBtn.addEventListener("click", async () => {
  const id = document.getElementById("chiliId").value;
  if (!id) return;
  if (!confirm("Diese Chili wirklich löschen?")) return;
  const ok = await deleteChiliRemote(id);
  if (!ok) return;
  chilis = chilis.filter((c) => c.id !== id);
  closeModal();
  render();
});

document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("addChiliBtn").addEventListener("click", () => openModal(null));
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);
sortSelect.addEventListener("change", () => {
  localStorage.setItem(SORT_KEY, sortSelect.value);
  render();
});

// --- Sammel-Bearbeiten ---

const bulkModal = document.getElementById("bulkModal");
const bulkForm = document.getElementById("bulkForm");
const bulkModalCount = document.getElementById("bulkModalCount");

const bulkFieldPairs = [
  ["bulkUsePflanzdatum", "bulkPflanzdatum"],
  ["bulkUseErntedatum", "bulkErntedatum"],
  ["bulkUseStatus", "bulkStatus"],
  ["bulkUseJahr", "bulkJahr"],
];

fillOptions(document.getElementById("bulkStatus"), STATUS_OPTIONS);
fillOptions(document.getElementById("bulkJahr"), YEAR_OPTIONS);

for (const [checkboxId, inputId] of bulkFieldPairs) {
  document.getElementById(checkboxId).addEventListener("change", (e) => {
    document.getElementById(inputId).disabled = !e.target.checked;
  });
}

function resetBulkForm() {
  bulkForm.reset();
  for (const [, inputId] of bulkFieldPairs) {
    document.getElementById(inputId).disabled = true;
  }
}

function closeBulkModal() {
  bulkModal.hidden = true;
  resetBulkForm();
}

bulkEditBtn.addEventListener("click", () => {
  bulkModalCount.textContent = selectedIds.size;
  bulkModal.hidden = false;
});

document.getElementById("bulkModalCloseBtn").addEventListener("click", closeBulkModal);
document.getElementById("bulkCancelBtn").addEventListener("click", closeBulkModal);
bulkModal.addEventListener("click", (e) => {
  if (e.target === bulkModal) closeBulkModal();
});

bulkForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const changes = {};
  if (document.getElementById("bulkUsePflanzdatum").checked) {
    changes.pflanzdatum = document.getElementById("bulkPflanzdatum").value || null;
  }
  if (document.getElementById("bulkUseErntedatum").checked) {
    changes.erntedatum = document.getElementById("bulkErntedatum").value || null;
  }
  if (document.getElementById("bulkUseStatus").checked) {
    changes.status = document.getElementById("bulkStatus").value;
  }
  if (document.getElementById("bulkUseJahr").checked) {
    changes.jahr = document.getElementById("bulkJahr").value;
  }

  if (Object.keys(changes).length > 0) {
    const { error } = await sb.from("chilis").update(changes).in("id", Array.from(selectedIds));
    if (error) {
      alert("Sammel-Änderung fehlgeschlagen: " + error.message);
      return;
    }
    chilis = chilis.map((c) => (selectedIds.has(c.id) ? { ...c, ...changes } : c));
  }

  closeBulkModal();
  setSelectionMode(false);
});

// --- CSV-Export der Auswahl ---

const CSV_COLUMNS = [
  ["nr", "Katalog-Nr."],
  ["name", "Name"],
  ["jahr", "Jahr"],
  ["sorte", "Sorte/Art"],
  ["herkunft", "Herkunft"],
  ["art", "Botanische Art"],
  ["sg", "Schärfegrad"],
  ["scoville", "Scoville"],
  ["status", "Status"],
  ["pflanzdatum", "Pflanzdatum"],
  ["erntedatum", "Erntedatum"],
  ["erntenotizen", "Wie läuft die Ernte"],
  ["geschmack", "Geschmack/Aroma"],
  ["geschmack_tags", "Geschmacks-Tags"],
  ["notizen", "Notizen"],
];

function csvEscape(value) {
  const str = String(value ?? "");
  // Excel (DE) erwartet Semikolon als Trenner; Felder mit Semikolon,
  // Anführungszeichen oder Zeilenumbruch müssen in Anführungszeichen.
  if (/[;"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function chilisToCsv(list) {
  const header = CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(";");
  const rows = list.map((c) =>
    CSV_COLUMNS.map(([key]) => csvEscape(c[key])).join(";")
  );
  // BOM, damit Excel Umlaute als UTF-8 statt als Kauderwelsch anzeigt.
  return "﻿" + [header, ...rows].join("\r\n");
}

bulkExportCsvBtn.addEventListener("click", () => {
  const selected = chilis.filter((c) => selectedIds.has(c.id));
  if (selected.length === 0) return;

  const csv = chilisToCsv(selected);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chili-auswahl-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- CSV-Export der Bestellungs-Auswahl ---

const ORDER_CSV_COLUMNS = [
  ["jahr", "Jahr"],
  ["name", "Chili/Sorte"],
  ["menge", "Menge"],
  ["haendler", "Bestellung von"],
  ["datum", "Bestelldatum"],
  ["preis", "Preis"],
  ["notizen", "Notizen"],
];

function ordersToCsv(list) {
  const header = ORDER_CSV_COLUMNS.map(([, label]) => csvEscape(label)).join(";");
  const rows = list.map((o) => ORDER_CSV_COLUMNS.map(([key]) => csvEscape(o[key])).join(";"));
  return "﻿" + [header, ...rows].join("\r\n");
}

orderBulkExportCsvBtn.addEventListener("click", () => {
  const selected = orders.filter((o) => orderSelectedIds.has(o.id));
  if (selected.length === 0) return;

  const csv = ordersToCsv(selected);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bestellungen-auswahl-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Export / Import ---

document.getElementById("menuExportBtn").addEventListener("click", () => {
  const payload = { chilis, bestellungen: orders };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chili-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  closeMenu();
});

const importBtn = document.getElementById("menuImportBtn");
const importFile = document.getElementById("importFile");

importBtn.addEventListener("click", () => {
  closeMenu();
  importFile.click();
});
async function replaceRemoteTable(table, rows) {
  const { error: delError } = await sb.from(table).delete().neq("id", "");
  if (delError) throw delError;
  if (rows.length === 0) return;
  const { error: insError } = await sb.from(table).insert(rows);
  if (insError) throw insError;
}

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);

    // Ältere Exporte waren ein reines Chili-Array ohne Bestellungen.
    let importedChilis = Array.isArray(imported) ? imported : imported.chilis;
    const importedOrders = Array.isArray(imported) ? [] : imported.bestellungen || [];
    if (!Array.isArray(importedChilis)) throw new Error("Ungültiges Format");

    if ((chilis.length > 0 || orders.length > 0) && !confirm("Vorhandene Daten durch Import ersetzen?")) return;

    // Ganz alte Exporte (vor Supabase) hatten Fotos noch als Base64 -
    // die müssen erst in den Storage-Bucket hochgeladen werden.
    for (const c of importedChilis) {
      if (!c.fotos || c.fotos.length === 0) continue;
      const uploaded = [];
      for (const foto of c.fotos) {
        if (typeof foto === "string" && foto.startsWith("data:")) {
          const url = await uploadDataUrlToStorage(foto, c.id);
          if (url) uploaded.push(url);
        } else {
          uploaded.push(foto);
        }
      }
      c.fotos = uploaded;
    }
    importedChilis = importedChilis.map((c) => (c.jahr ? c : { ...c, jahr: DEFAULT_YEAR }));

    await replaceRemoteTable("bestellungen", importedOrders);
    await replaceRemoteTable("chilis", importedChilis);

    chilis = linkSharedVarietyData(importedChilis);
    orders = importedOrders;
    render();
    renderOrders();
  } catch (err) {
    alert("Import fehlgeschlagen: " + err.message);
  }
  importFile.value = "";
});

// --- Excelliste importieren ---
// Ergaenzt die Sammlung um Zeilen aus einer Excel-Datei (Spalten Nr/Name/Sg
// plus Jahr), statt wie der JSON-Import alles zu ersetzen. Jede Zeile wird
// ueber Nr+Jahr einer Chili zugeordnet - existiert die schon, werden nur die
// Tabellen-Felder aktualisiert, Saison-Daten (Fotos, Status, Notizen ...)
// bleiben erhalten.

const EXCEL_COLUMN_ALIASES = {
  nr: ["nr", "nr.", "katalog-nr", "katalog-nr.", "katalognr"],
  name: ["name"],
  sg: ["sg", "schärfegrad", "scharfegrad"],
  jahr: ["jahr", "anbaujahr"],
  herkunft: ["herkunft"],
  sorte: ["sorte"],
  art: ["art"],
  scoville: ["scoville", "shu"],
  status: ["status"],
};

let pendingExcelRecords = [];

const menuExcelImportBtn = document.getElementById("menuExcelImportBtn");
const excelImportModal = document.getElementById("excelImportModal");
const excelImportCloseBtn = document.getElementById("excelImportCloseBtn");
const excelTemplateBtn = document.getElementById("excelTemplateBtn");
const excelChooseFileBtn = document.getElementById("excelChooseFileBtn");
const excelImportFile = document.getElementById("excelImportFile");
const excelImportPreview = document.getElementById("excelImportPreview");
const excelImportSummary = document.getElementById("excelImportSummary");
const excelImportErrors = document.getElementById("excelImportErrors");
const excelImportTable = document.getElementById("excelImportTable");
const excelImportConfirmBtn = document.getElementById("excelImportConfirmBtn");
const excelImportCancelBtn = document.getElementById("excelImportCancelBtn");

function openExcelImportModal() {
  closeMenu();
  pendingExcelRecords = [];
  excelImportFile.value = "";
  excelImportPreview.hidden = true;
  excelImportConfirmBtn.disabled = true;
  excelImportModal.hidden = false;
}

function closeExcelImportModal() {
  excelImportModal.hidden = true;
}

function downloadExcelTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nr", "Name", "Sg", "Jahr"],
    [1, "Mustafa", 2, 2025],
    [2, "Carolina Reaper", "10+", 2025],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Chili");
  XLSX.writeFile(wb, "Chili-Import-Vorlage.xlsx");
}

function normalizeExcelHeader(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildExcelColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const norm = normalizeExcelHeader(cell);
    for (const [field, aliases] of Object.entries(EXCEL_COLUMN_ALIASES)) {
      if (!(field in map) && aliases.includes(norm)) map[field] = index;
    }
  });
  return map;
}

function parseExcelWorkbook(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  if (rows.length < 2) {
    return { records: [], errors: ["Die Datei enthält keine Datenzeilen."] };
  }

  const colMap = buildExcelColumnMap(rows[0]);
  const errors = [];
  if (colMap.name === undefined) errors.push('Spalte "Name" nicht gefunden.');
  if (colMap.jahr === undefined) errors.push('Spalte "Jahr" nicht gefunden.');
  if (errors.length > 0) return { records: [], errors };

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (field) =>
      colMap[field] !== undefined ? String(row[colMap[field]] ?? "").trim() : "";
    const name = get("name");
    const jahr = get("jahr");
    if (!name || !jahr) {
      errors.push(`Zeile ${i + 1}: Name oder Jahr fehlt, übersprungen.`);
      continue;
    }
    records.push({
      nr: get("nr"),
      name,
      jahr,
      sg: get("sg"),
      herkunft: get("herkunft"),
      sorte: get("sorte"),
      art: get("art"),
      scoville: get("scoville"),
      status: get("status"),
    });
  }
  return { records, errors };
}

function renderExcelImportPreview(records, errors) {
  excelImportPreview.hidden = false;

  const years = new Map();
  for (const r of records) years.set(r.jahr, (years.get(r.jahr) || 0) + 1);
  const yearSummary = [...years.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([jahr, count]) => `${jahr} (${count})`)
    .join(", ");
  excelImportSummary.textContent =
    records.length > 0
      ? `${records.length} Zeile${records.length === 1 ? "" : "n"} erkannt für Jahr${years.size === 1 ? "" : "e"}: ${yearSummary}`
      : "Keine gültigen Zeilen gefunden.";

  excelImportErrors.innerHTML = "";
  excelImportErrors.hidden = errors.length === 0;
  for (const err of errors) {
    const li = document.createElement("li");
    li.textContent = err;
    excelImportErrors.appendChild(li);
  }

  const previewRows = records.slice(0, 10);
  excelImportTable.innerHTML = `
    <thead>
      <tr><th>Nr</th><th>Name</th><th>Sg</th><th>Jahr</th></tr>
    </thead>
    <tbody>
      ${previewRows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.nr)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.sg)}</td><td>${escapeHtml(r.jahr)}</td></tr>`
        )
        .join("")}
      ${records.length > previewRows.length ? `<tr><td colspan="4">… und ${records.length - previewRows.length} weitere</td></tr>` : ""}
    </tbody>
  `;

  excelImportConfirmBtn.disabled = records.length === 0;
}

function buildChiliFromExcelRow(row, existing) {
  return {
    id: row.nr ? `${row.jahr}-${row.nr}` : existing?.id || uid(),
    nr: row.nr || existing?.nr || "",
    name: row.name,
    jahr: row.jahr,
    sorte: row.sorte || existing?.sorte || "",
    herkunft: row.herkunft || existing?.herkunft || "",
    art: row.art || existing?.art || "",
    sg: row.sg || existing?.sg || "",
    scoville: row.scoville || existing?.scoville || "",
    status: row.status || existing?.status || "Aussaat",
    pflanzdatum: existing?.pflanzdatum || null,
    erntedatum: existing?.erntedatum || null,
    erntenotizen: existing?.erntenotizen || "",
    geschmack: existing?.geschmack || "",
    geschmack_tags: existing?.geschmack_tags || [],
    notizen: existing?.notizen || "",
    fotos: existing?.fotos || [],
  };
}

menuExcelImportBtn.addEventListener("click", openExcelImportModal);
excelImportCloseBtn.addEventListener("click", closeExcelImportModal);
excelImportCancelBtn.addEventListener("click", closeExcelImportModal);
excelImportModal.addEventListener("click", (e) => {
  if (e.target === excelImportModal) closeExcelImportModal();
});
excelTemplateBtn.addEventListener("click", downloadExcelTemplate);
excelChooseFileBtn.addEventListener("click", () => excelImportFile.click());

excelImportFile.addEventListener("change", async () => {
  const file = excelImportFile.files[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const { records, errors } = parseExcelWorkbook(workbook);
    pendingExcelRecords = records;
    renderExcelImportPreview(records, errors);
  } catch (err) {
    pendingExcelRecords = [];
    renderExcelImportPreview([], ["Datei konnte nicht gelesen werden: " + err.message]);
  }
});

excelImportConfirmBtn.addEventListener("click", async () => {
  if (pendingExcelRecords.length === 0) return;
  excelImportConfirmBtn.disabled = true;

  const existingById = new Map(chilis.map((c) => [c.id, c]));
  const newRecords = pendingExcelRecords.map((row) =>
    buildChiliFromExcelRow(row, row.nr ? existingById.get(`${row.jahr}-${row.nr}`) : null)
  );

  const { error } = await sb.from("chilis").upsert(newRecords);
  if (error) {
    alert("Import fehlgeschlagen: " + error.message);
    excelImportConfirmBtn.disabled = false;
    return;
  }

  for (const rec of newRecords) {
    const index = chilis.findIndex((c) => c.id === rec.id);
    if (index >= 0) chilis[index] = rec;
    else chilis.push(rec);
  }
  chilis = linkSharedVarietyData(chilis);

  for (const rec of newRecords) {
    if (!YEAR_OPTIONS.includes(rec.jahr)) YEAR_OPTIONS.push(rec.jahr);
  }
  YEAR_OPTIONS.sort();
  renderYearTabs();
  render();

  closeExcelImportModal();
  alert(`${newRecords.length} Chili${newRecords.length === 1 ? "" : "s"} importiert.`);
});

// --- Statistik ---
// Zählt bei jedem Aufruf frisch aus den geladenen Chilis (kein eigener
// Supabase-Query nötig, chilis ist ohnehin die aktuelle Quelle), gruppiert
// nach Sorte - fehlt die Sorte, wird der Name verwendet, damit auch
// unvollständig gepflegte Einträge sinnvoll auftauchen.

let sortenChartInstance = null;

function renderStats() {
  const total = chilis.length;
  const counts = new Map();
  for (const c of chilis) {
    const key = (c.sorte && c.sorte.trim()) || c.name || "Unbekannt";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statVarieties").textContent = counts.size;
  document.getElementById("statTop").textContent =
    entries.length > 0 ? `${entries[0][0]} (${entries[0][1]})` : "–";

  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue("--color-text").trim() || "#333333";
  const gridColor = styles.getPropertyValue("--color-border").trim() || "#dddddd";
  const barColor = styles.getPropertyValue("--color-primary").trim() || "#c1440e";

  const canvas = document.getElementById("sortenChart");
  const wrap = canvas.parentElement;
  wrap.style.height = `${Math.max(160, entries.length * 36)}px`;

  if (sortenChartInstance) {
    sortenChartInstance.destroy();
  }
  sortenChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: entries.map(([name]) => name),
      datasets: [
        {
          label: "Anzahl",
          data: entries.map(([, count]) => count),
          backgroundColor: barColor,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: textColor, precision: 0 },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: textColor },
          grid: { color: gridColor },
        },
      },
    },
  });
}

// --- Pull-to-refresh ---
// Als "Zum Home-Bildschirm hinzugefügte" App (display: standalone) hat iOS
// keine eigene Browser-Leiste mehr und damit auch keine native
// Pull-to-refresh-Geste. Das hier holt sie zurück, wenn ganz oben auf der
// Seite nach unten gezogen wird.

function setupPullToRefresh() {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (!isStandalone) return;

  const indicator = document.getElementById("pullIndicator");
  const THRESHOLD = 70;
  const MAX_PULL = 110;
  let startY = null;
  let pulling = false;

  document.addEventListener(
    "touchstart",
    (e) => {
      startY = document.scrollingElement.scrollTop <= 0 ? e.touches[0].clientY : null;
      pulling = false;
      indicator.classList.remove("snap-back", "refreshing");
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (startY === null) return;
      const deltaY = e.touches[0].clientY - startY;
      if (deltaY <= 0) return;

      pulling = true;
      const distance = Math.min(deltaY, MAX_PULL);
      indicator.classList.add("pulling");
      indicator.style.opacity = Math.min(distance / THRESHOLD, 1);
      indicator.style.transform = `translateY(${distance - 34}px)`;
      indicator.classList.toggle("ready", distance >= THRESHOLD);
    },
    { passive: true }
  );

  document.addEventListener("touchend", () => {
    if (!pulling) {
      startY = null;
      return;
    }
    indicator.classList.remove("pulling");
    if (indicator.classList.contains("ready")) {
      indicator.classList.add("refreshing");
      indicator.style.transform = "";
      indicator.style.opacity = "";
      location.reload();
    } else {
      indicator.classList.add("snap-back");
      indicator.style.transform = "";
      indicator.style.opacity = "";
    }
    startY = null;
    pulling = false;
  });
}

// --- Init ---

(async function main() {
  populateStatusFilter();
  renderTasteFilterChips();
  populateYearSelect();
  renderYearTabs();
  renderOrderYearTabs();
  sortSelect.value = localStorage.getItem(SORT_KEY) || "nr";
  viewGridBtn.classList.toggle("active", viewMode === "grid");
  viewListBtn.classList.toggle("active", viewMode === "list");
  setupPullToRefresh();
  loadReferenceDb().catch((e) => console.warn("Referenzdatenbank-Ladefehler", e));

  // Sicherheitsnetz: bei sehr langsamer/fehlender Verbindung soll die Seite
  // trotzdem nutzbar werden statt unbegrenzt leer/eingefroren zu wirken.
  // Sobald die echten Daten doch noch ankommen, wird einfach neu gezeichnet.
  let dataLoaded = false;
  const fallbackTimer = setTimeout(() => {
    if (!dataLoaded) {
      setAppTab(appTab);
      render();
      renderOrders();
    }
  }, 8000);

  await migrateLocalDataIfNeeded();
  chilis = linkSharedVarietyData(await fetchChilis());
  orders = await fetchOrders();
  dataLoaded = true;
  clearTimeout(fallbackTimer);

  setAppTab(appTab);
  render();

  // Deep-Link vom QR-Code-Etikett (?chili=<id>): direkt die Details öffnen
  // statt nur die Startseite zu zeigen.
  const deepLinkId = new URL(location.href).searchParams.get("chili");
  if (deepLinkId && chilis.some((c) => c.id === deepLinkId)) {
    setAppTab("sammlung");
    openModal(deepLinkId);
  }
})();
