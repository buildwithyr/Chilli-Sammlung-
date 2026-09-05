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
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const sortSelect = document.getElementById("sortSelect");
const viewGridBtn = document.getElementById("viewGridBtn");
const viewListBtn = document.getElementById("viewListBtn");
const yearTabs = document.getElementById("yearTabs");
const selectModeBtn = document.getElementById("selectModeBtn");
const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");
const bulkEditBtn = document.getElementById("bulkEditBtn");
const bulkExportCsvBtn = document.getElementById("bulkExportCsvBtn");
const bulkSelectAllBtn = document.getElementById("bulkSelectAllBtn");
const bulkDoneBtn = document.getElementById("bulkDoneBtn");
const fab = document.getElementById("addChiliBtn");

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
  selectModeBtn.classList.toggle("active", on);
  selectModeBtn.textContent = on ? "Auswahl beenden" : "Mehrere auswählen";
  fab.hidden = on;
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
}

selectModeBtn.addEventListener("click", () => setSelectionMode(!selectionMode));
bulkDoneBtn.addEventListener("click", () => setSelectionMode(false));
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
  if (showSammlung) mainTabsToggleLabel.textContent = "🌶️ Sammlung";
  if (showBestellungen) mainTabsToggleLabel.textContent = "📋 Bestellungen";
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

const orderSelectModeBtn = document.getElementById("orderSelectModeBtn");
const orderBulkBar = document.getElementById("orderBulkBar");
const orderBulkCount = document.getElementById("orderBulkCount");
const orderBulkSelectAllBtn = document.getElementById("orderBulkSelectAllBtn");
const orderBulkExportCsvBtn = document.getElementById("orderBulkExportCsvBtn");
const orderBulkDoneBtn = document.getElementById("orderBulkDoneBtn");

let orderSelectionMode = false;
let orderSelectedIds = new Set();

function setOrderSelectionMode(on) {
  orderSelectionMode = on;
  if (!on) orderSelectedIds.clear();
  orderSelectModeBtn.classList.toggle("active", on);
  orderSelectModeBtn.textContent = on ? "Auswahl beenden" : "Mehrere auswählen";
  addOrderBtn.hidden = on || appTab !== "bestellungen";
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

orderSelectModeBtn.addEventListener("click", () => setOrderSelectionMode(!orderSelectionMode));
orderBulkDoneBtn.addEventListener("click", () => setOrderSelectionMode(false));
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
  row.innerHTML = `
    ${orderSelectionMode ? `<span class="row-select-checkbox${isSelected ? " checked" : ""}">${isSelected ? "✓" : ""}</span>` : ""}
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
  return parseInt(sg, 10) || 0;
}

function sgBadge(sg) {
  if (!sg) return "–";
  const num = sgValue(sg);
  const peppers = Math.max(1, Math.min(5, Math.ceil(num / 2)));
  return "🌶️".repeat(peppers) + ` Sg ${sg}`;
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

function getFilteredChilis() {
  const query = searchInput.value.trim().toLowerCase();
  const statusQuery = statusFilter.value;

  return chilis.filter((c) => {
    const matchesQuery =
      !query ||
      c.name.toLowerCase().includes(query) ||
      (c.herkunft || "").toLowerCase().includes(query) ||
      (c.sorte || "").toLowerCase().includes(query) ||
      (c.nr || "").toLowerCase().includes(query);
    const matchesStatus = !statusQuery || c.status === statusQuery;
    const matchesYear = !activeYear || c.jahr === activeYear;
    return matchesQuery && matchesStatus && matchesYear;
  });
}

function render() {
  const filtered = getFilteredChilis();
  const sorted = sortChilis(filtered);

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
    nrBadge.textContent = `#${c.nr}`;
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
      <span class="badge">${sgBadge(c.sg)}</span>
      <span class="badge badge-status">${escapeHtml(c.status || "Aussaat")}</span>
      ${activeYear === "" && c.jahr ? `<span class="badge">${escapeHtml(c.jahr)}</span>` : ""}
    </div>
  `;
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
  row.innerHTML = `
    ${selectionMode ? `<span class="row-select-checkbox${isSelected ? " checked" : ""}">${isSelected ? "✓" : ""}</span>` : ""}
    <span class="row-nr">${c.nr ? `#${escapeHtml(c.nr)}` : ""}</span>
    <span class="row-name">${escapeHtml(c.name)}</span>
    <div class="row-badges">
      <span class="badge">${sgBadge(c.sg)}</span>
      <span class="badge badge-status">${escapeHtml(c.status || "Aussaat")}</span>
      ${activeYear === "" && c.jahr ? `<span class="badge">${escapeHtml(c.jahr)}</span>` : ""}
    </div>
  `;
  return row;
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
const photoPreview = document.getElementById("photoPreview");
const photoPlaceholder = document.getElementById("photoPlaceholder");
const photoThumbs = document.getElementById("photoThumbs");

// --- Schärfegrad: anklickbare 1-10-Skala statt Freitext ---
// fieldSg bleibt ein normales (jetzt verstecktes) Input, damit Speichern/
// Laden unverändert bleibt - nur die Bedienung ist jetzt eine Chili-Reihe.

const sgScale = document.getElementById("sgScale");
const sgScaleLabel = document.getElementById("sgScaleLabel");
const fieldSg = document.getElementById("fieldSg");

function setSgScale(value) {
  const num = parseInt(value, 10) || 0;
  fieldSg.value = num > 0 ? String(num) : "";
  sgScaleLabel.textContent = num > 0 ? `Sg ${num}` : "Kein Wert gewählt";
  sgScale.querySelectorAll(".sg-scale-btn").forEach((btn) => {
    btn.classList.toggle("filled", parseInt(btn.dataset.value, 10) <= num);
  });
}

sgScale.addEventListener("click", (e) => {
  const btn = e.target.closest(".sg-scale-btn");
  if (!btn) return;
  const clicked = parseInt(btn.dataset.value, 10);
  const current = parseInt(fieldSg.value, 10) || 0;
  setSgScale(clicked === current ? 0 : clicked);
});

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
  setSgScale(chili?.sg || "");
  document.getElementById("fieldScoville").value = chili?.scoville || "";
  document.getElementById("fieldStatus").value = chili?.status || "Aussaat";
  document.getElementById("fieldPflanzdatum").value = chili?.pflanzdatum || "";
  document.getElementById("fieldErntedatum").value = chili?.erntedatum || "";
  document.getElementById("fieldErntenotizen").value = chili?.erntenotizen || "";
  document.getElementById("fieldGeschmack").value = chili?.geschmack || "";
  document.getElementById("fieldNotizen").value = chili?.notizen || "";

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
}

function renderPhotoPreview() {
  if (currentPhotos.length > 0) {
    photoPreview.src = currentPhotos[0];
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
  } else {
    photoPreview.hidden = true;
    photoPlaceholder.hidden = false;
  }

  photoThumbs.innerHTML = "";
  currentPhotos.forEach((src, index) => {
    const thumb = document.createElement("div");
    thumb.className = "photo-thumb";
    const img = document.createElement("img");
    img.src = src;
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

photoInput.addEventListener("change", async () => {
  const files = Array.from(photoInput.files || []);
  const chiliId = document.getElementById("chiliId").value;
  photoInput.disabled = true;
  photoPlaceholder.textContent = "⏳ Wird hochgeladen ...";

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
  photoPlaceholder.textContent = "📷 Foto(s) hinzufügen";
  photoInput.value = "";
  renderPhotoPreview();
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
    sg: document.getElementById("fieldSg").value.trim(),
    scoville: document.getElementById("fieldScoville").value.trim(),
    status: document.getElementById("fieldStatus").value,
    pflanzdatum: document.getElementById("fieldPflanzdatum").value || null,
    erntedatum: document.getElementById("fieldErntedatum").value || null,
    erntenotizen: document.getElementById("fieldErntenotizen").value.trim(),
    geschmack: document.getElementById("fieldGeschmack").value.trim(),
    notizen: document.getElementById("fieldNotizen").value.trim(),
    fotos: currentPhotos,
  };

  const ok = await upsertChiliRemote(data);
  if (!ok) return;

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
  ["sg", "Schärfegrad (Sg)"],
  ["scoville", "Scoville"],
  ["status", "Status"],
  ["pflanzdatum", "Pflanzdatum"],
  ["erntedatum", "Erntedatum"],
  ["erntenotizen", "Wie läuft die Ernte"],
  ["geschmack", "Geschmack/Aroma"],
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

    chilis = importedChilis;
    orders = importedOrders;
    render();
    renderOrders();
  } catch (err) {
    alert("Import fehlgeschlagen: " + err.message);
  }
  importFile.value = "";
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
  populateYearSelect();
  renderYearTabs();
  renderOrderYearTabs();
  sortSelect.value = localStorage.getItem(SORT_KEY) || "nr";
  viewGridBtn.classList.toggle("active", viewMode === "grid");
  viewListBtn.classList.toggle("active", viewMode === "list");
  setupPullToRefresh();

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
  chilis = await fetchChilis();
  orders = await fetchOrders();
  dataLoaded = true;
  clearTimeout(fallbackTimer);

  setAppTab(appTab);
  render();
})();
