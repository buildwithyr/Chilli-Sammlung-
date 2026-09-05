const STORAGE_KEY = "chiliSammlung";
const VIEW_KEY = "chiliViewMode";
const YEAR_KEY = "chiliActiveYear";
const SORT_KEY = "chiliSortMode";

const YEAR_OPTIONS = ["2024", "2025", "2026", "2027"];
const DEFAULT_YEAR = "2026";

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

let chilis = loadChilis();
let currentPhotos = [];

if (localStorage.getItem(STORAGE_KEY) === null) {
  saveChilis();
}

function loadChilis() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Erster Start: mit der Chili-2026-Liste vorbefüllen.
      return typeof SEED_CHILIS !== "undefined" ? [...SEED_CHILIS] : [];
    }
    const parsed = JSON.parse(raw);
    // Migration: Chilis aus einer älteren Version hatten noch kein Jahr.
    return parsed.map((c) => (c.jahr ? c : { ...c, jahr: DEFAULT_YEAR }));
  } catch (e) {
    console.error("Konnte gespeicherte Daten nicht lesen", e);
    return [];
  }
}

function saveChilis() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chilis));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
const bulkDoneBtn = document.getElementById("bulkDoneBtn");
const fab = document.getElementById("addChiliBtn");

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
}

selectModeBtn.addEventListener("click", () => setSelectionMode(!selectionMode));
bulkDoneBtn.addEventListener("click", () => setSelectionMode(false));

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
}

function renderYearTabs() {
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
    default:
      sorted.sort((a, b) => (parseInt(a.nr, 10) || 0) - (parseInt(b.nr, 10) || 0));
  }
  return sorted;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const statusQuery = statusFilter.value;

  const filtered = chilis.filter((c) => {
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

function openModal(id) {
  const chili = id ? chilis.find((c) => c.id === id) : null;

  document.getElementById("chiliId").value = chili ? chili.id : "";
  document.getElementById("fieldNr").value = chili?.nr || "";
  document.getElementById("fieldName").value = chili?.name || "";
  document.getElementById("fieldJahr").value = chili?.jahr || activeYear || DEFAULT_YEAR;
  document.getElementById("fieldSorte").value = chili?.sorte || "";
  document.getElementById("fieldHerkunft").value = chili?.herkunft || "";
  document.getElementById("fieldSg").value = chili?.sg || "";
  document.getElementById("fieldScoville").value = chili?.scoville || "";
  document.getElementById("fieldStatus").value = chili?.status || "Aussaat";
  document.getElementById("fieldPflanzdatum").value = chili?.pflanzdatum || "";
  document.getElementById("fieldErntedatum").value = chili?.erntedatum || "";
  document.getElementById("fieldErntenotizen").value = chili?.erntenotizen || "";
  document.getElementById("fieldGeschmack").value = chili?.geschmack || "";
  document.getElementById("fieldNotizen").value = chili?.notizen || "";

  currentPhotos = chili?.fotos ? [...chili.fotos] : [];
  renderPhotoPreview();

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
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    currentPhotos.push(dataUrl);
  }
  photoInput.value = "";
  renderPhotoPreview();
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const id = document.getElementById("chiliId").value || uid();
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
    pflanzdatum: document.getElementById("fieldPflanzdatum").value,
    erntedatum: document.getElementById("fieldErntedatum").value,
    erntenotizen: document.getElementById("fieldErntenotizen").value.trim(),
    geschmack: document.getElementById("fieldGeschmack").value.trim(),
    notizen: document.getElementById("fieldNotizen").value.trim(),
    fotos: currentPhotos,
  };

  const existingIndex = chilis.findIndex((c) => c.id === id);
  if (existingIndex >= 0) {
    chilis[existingIndex] = data;
  } else {
    chilis.push(data);
  }

  saveChilis();
  closeModal();
  render();
});

deleteBtn.addEventListener("click", () => {
  const id = document.getElementById("chiliId").value;
  if (!id) return;
  if (!confirm("Diese Chili wirklich löschen?")) return;
  chilis = chilis.filter((c) => c.id !== id);
  saveChilis();
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

bulkForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const changes = {};
  if (document.getElementById("bulkUsePflanzdatum").checked) {
    changes.pflanzdatum = document.getElementById("bulkPflanzdatum").value;
  }
  if (document.getElementById("bulkUseErntedatum").checked) {
    changes.erntedatum = document.getElementById("bulkErntedatum").value;
  }
  if (document.getElementById("bulkUseStatus").checked) {
    changes.status = document.getElementById("bulkStatus").value;
  }
  if (document.getElementById("bulkUseJahr").checked) {
    changes.jahr = document.getElementById("bulkJahr").value;
  }

  if (Object.keys(changes).length > 0) {
    chilis = chilis.map((c) => (selectedIds.has(c.id) ? { ...c, ...changes } : c));
    saveChilis();
  }

  closeBulkModal();
  setSelectionMode(false);
});

// --- Export / Import ---

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(chilis, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chili-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Ungültiges Format");
    if (chilis.length > 0 && !confirm("Vorhandene Sammlung durch Import ersetzen?")) return;
    chilis = imported;
    saveChilis();
    render();
  } catch (err) {
    alert("Import fehlgeschlagen: " + err.message);
  }
  importFile.value = "";
});

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

populateStatusFilter();
populateYearSelect();
renderYearTabs();
sortSelect.value = localStorage.getItem(SORT_KEY) || "nr";
viewGridBtn.classList.toggle("active", viewMode === "grid");
viewListBtn.classList.toggle("active", viewMode === "list");
setupPullToRefresh();
render();
