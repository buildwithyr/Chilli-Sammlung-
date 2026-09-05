const STORAGE_KEY = "chiliSammlung";

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

function loadChilis() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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

function populateStatusFilter() {
  for (const status of STATUS_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = status;
    opt.textContent = status;
    statusFilter.appendChild(opt);
  }
}

function starEmoji(n) {
  n = Number(n) || 0;
  return n > 0 ? "🌶️".repeat(n) : "–";
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const statusQuery = statusFilter.value;

  const filtered = chilis.filter((c) => {
    const matchesQuery =
      !query ||
      c.name.toLowerCase().includes(query) ||
      (c.herkunft || "").toLowerCase().includes(query) ||
      (c.sorte || "").toLowerCase().includes(query);
    const matchesStatus = !statusQuery || c.status === statusQuery;
    return matchesQuery && matchesStatus;
  });

  grid.innerHTML = "";
  emptyState.hidden = chilis.length > 0;

  for (const c of filtered) {
    const card = document.createElement("div");
    card.className = "chili-card";
    card.addEventListener("click", () => openModal(c.id));

    const photo = c.fotos && c.fotos[0];
    if (photo) {
      const img = document.createElement("img");
      img.className = "card-photo";
      img.src = photo;
      img.alt = c.name;
      card.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "card-photo-placeholder";
      placeholder.textContent = "🌶️";
      card.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <h3>${escapeHtml(c.name)}</h3>
      <span class="card-meta">${escapeHtml(c.herkunft || "Herkunft unbekannt")}</span>
      <div class="card-badges">
        <span class="badge">${starEmoji(c.sterne)}</span>
        <span class="badge badge-status">${escapeHtml(c.status || "Aussaat")}</span>
      </div>
    `;
    card.appendChild(body);
    grid.appendChild(card);
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
const photoPreview = document.getElementById("photoPreview");
const photoPlaceholder = document.getElementById("photoPlaceholder");
const photoThumbs = document.getElementById("photoThumbs");

function openModal(id) {
  const chili = id ? chilis.find((c) => c.id === id) : null;

  document.getElementById("chiliId").value = chili ? chili.id : "";
  document.getElementById("fieldName").value = chili?.name || "";
  document.getElementById("fieldSorte").value = chili?.sorte || "";
  document.getElementById("fieldHerkunft").value = chili?.herkunft || "";
  document.getElementById("fieldSterne").value = chili?.sterne || 0;
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
    name: document.getElementById("fieldName").value.trim(),
    sorte: document.getElementById("fieldSorte").value.trim(),
    herkunft: document.getElementById("fieldHerkunft").value.trim(),
    sterne: Number(document.getElementById("fieldSterne").value),
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

// --- Init ---

populateStatusFilter();
render();
