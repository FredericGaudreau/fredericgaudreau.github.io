"use strict";

const NOTES_KEY = "markdownNotes";
const MAP_POINTS_KEY = "mapPoints";

const $ = (id) => document.getElementById(id);

const notesListEl = $("notes-list");
const titleInput = $("note-title");
const markdownInput = $("markdown-input");
const previewEl = $("markdown-preview");
const charCount = $("char-count");
const wordCount = $("word-count");
const saveStatus = $("save-status");
let notes = [];
let linkedPoint = null;
let currentId = null;
let debounceTimer = null;
let statusTimer = null;

function slugify(str) {
  return (
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .substring(0, 60) || "note"
  );
}

function loadNotes() {
  try {
    const saved = localStorage.getItem(NOTES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        notes = parsed.filter(
          (n) => n && typeof n.content === "string" && typeof n.updatedAt === "number",
        );
      }
    }
  } catch (error) {
    console.warn("Impossible de charger les notes:", error);
    notes = [];
  }
}

function persist() {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch (error) {
    console.warn("Impossible de sauvegarder les notes:", error);
    setStatus("Échec de sauvegarde", "error");
  }
}

function readLinkedPointHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const [lat, lng] = (params.get("point") || "").split(",").map(parseFloat);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function loadMapPoints() {
  try {
    const saved = localStorage.getItem(MAP_POINTS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Impossible de charger les points:", error);
    return [];
  }
}

function findMapPoint(lat, lng) {
  return loadMapPoints().find(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      p.lat.toFixed(5) === lat.toFixed(5) &&
      p.lng.toFixed(5) === lng.toFixed(5),
  );
}

function saveLinkedPointNote(content) {
  try {
    const all = loadMapPoints();
    const pt = all.find(
      (p) =>
        p.lat.toFixed(5) === linkedPoint.lat.toFixed(5) &&
        p.lng.toFixed(5) === linkedPoint.lng.toFixed(5),
    );
    if (!pt) return false;
    pt.note = content.substring(0, 1000);
    localStorage.setItem(MAP_POINTS_KEY, JSON.stringify(all));
    return true;
  } catch (error) {
    console.warn("Impossible de sauvegarder le point:", error);
    return false;
  }
}

function enterLinkedMode(point) {
  linkedPoint = point;
  document.body.classList.add("linked-mode");
  $("linked-point-name").textContent = point.name || "Sans nom";
  $("linked-banner").hidden = false;
  titleInput.value = point.name || "";
  titleInput.readOnly = true;
  $("new-note").disabled = true;
  $("delete-btn").disabled = true;
  markdownInput.value = point.note || "";
  currentId = null;
  renderPreview();
  updateCounts();
}

function initLinkedMode() {
  const target = readLinkedPointHash();
  if (!target) return false;
  const pt = findMapPoint(target.lat, target.lng);
  if (!pt) return false;
  enterLinkedMode(pt);
  return true;
}

function currentNote() {
  return notes.find((n) => n.id === currentId) || null;
}

function setStatus(message, type = "ok") {
  clearTimeout(statusTimer);
  saveStatus.textContent = message;
  saveStatus.dataset.type = type;
  statusTimer = setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
}

function noteTitle(note) {
  return note.title.trim() || "Sans titre";
}

function renderNotesList() {
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  notesListEl.innerHTML = "";

  sorted.forEach((note) => {
    const li = document.createElement("li");
    li.className = "note-item";
    li.dataset.id = note.id;
    if (note.id === currentId) {
      li.classList.add("active");
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-select";
    button.innerHTML = `<span class="note-item-title">${escapeHtml(noteTitle(note))}</span><span class="note-item-date">${new Date(
      note.updatedAt,
    ).toLocaleDateString("fr-CA")}</span>`;
    li.appendChild(button);
    notesListEl.appendChild(li);
  });

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "note-item-empty";
    empty.textContent = "Aucune note. Créez-en une !";
    notesListEl.appendChild(empty);
  }
}

function renderPreview() {
  previewEl.innerHTML = renderMarkdown(markdownInput.value);
}

function updateCounts() {
  const text = markdownInput.value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  charCount.textContent = `${chars} caractère${chars > 1 ? "s" : ""}`;
  wordCount.textContent = `${words} mot${words > 1 ? "s" : ""}`;
}

function renderEditor() {
  const note = currentNote();
  titleInput.value = note ? note.title : "";
  markdownInput.value = note ? note.content : "";
  renderPreview();
  updateCounts();
}

function selectNote(id) {
  currentId = id;
  renderNotesList();
  renderEditor();
  if (window.innerWidth <= 768) {
    document.body.classList.remove("show-sidebar");
    $("toggle-sidebar").setAttribute("aria-expanded", "false");
  }
}

function createNote() {
  const note = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: "",
    content: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes.push(note);
  persist();
  selectNote(note.id);
  titleInput.focus();
}

function saveCurrent() {
  if (linkedPoint) {
    if (markdownInput.value !== (linkedPoint.note || "")) {
      linkedPoint.note = markdownInput.value.substring(0, 1000);
      const ok = saveLinkedPointNote(linkedPoint.note);
      setStatus(ok ? "Enregistré sur la carte" : "Échec de sauvegarde", ok ? "ok" : "error");
    }
    return;
  }
  const note = currentNote();
  if (!note) return;
  let changed = false;
  if (note.title !== titleInput.value) {
    note.title = titleInput.value.substring(0, 120);
    changed = true;
  }
  if (note.content !== markdownInput.value) {
    note.content = markdownInput.value.substring(0, 100000);
    changed = true;
  }
  if (changed) {
    note.updatedAt = Date.now();
    persist();
    setStatus("Enregistré");
    renderNotesList();
  }
}

function scheduleSave() {
  clearTimeout(debounceTimer);
  setStatus("Modification…");
  debounceTimer = setTimeout(saveCurrent, 500);
}

function deleteCurrent() {
  const note = currentNote();
  if (!note) return;
  if (!confirm(`Supprimer la note "${noteTitle(note)}" ?`)) return;

  notes = notes.filter((n) => n.id !== currentId);
  persist();
  currentId = notes.length > 0 ? notes[0].id : null;
  renderNotesList();
  renderEditor();
  setStatus("Note supprimée");
}

function copyMarkdown() {
  if (!currentNote()) return;
  navigator.clipboard
    .writeText(markdownInput.value)
    .then(() => setStatus("Markdown copié"))
    .catch(() => setStatus("Copie impossible", "error"));
}

function exportNote() {
  const note = currentNote();
  if (!note) return;

  const blob = new Blob([markdownInput.value], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(noteTitle(note))}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Téléchargement lancé");
}

function toggleFullscreen() {
  const icon = $("fullscreen-btn").querySelector("i");
  if (!document.fullscreenElement) {
    $("notes-app")
      .requestFullscreen?.()
      .catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
  icon.classList.toggle("fa-expand");
  icon.classList.toggle("fa-compress");
}

notesListEl.addEventListener("click", (e) => {
  const select = e.target.closest(".note-select");
  if (!select) return;
  const li = select.closest(".note-item");
  if (li?.dataset.id) {
    saveCurrent();
    selectNote(li.dataset.id);
  }
});

markdownInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  scheduleSave();
  renderPreview();
  updateCounts();
});

titleInput.addEventListener("input", scheduleSave);

$("new-note").addEventListener("click", createNote);
$("delete-btn").addEventListener("click", deleteCurrent);
$("copy-btn").addEventListener("click", copyMarkdown);
$("export-btn").addEventListener("click", exportNote);
$("fullscreen-btn").addEventListener("click", toggleFullscreen);

$("toggle-preview").addEventListener("click", () => {
  const panes = $("editor-panes");
  const showPreview = panes.classList.toggle("show-preview");
  $("toggle-preview").setAttribute("aria-pressed", String(showPreview));
});

$("toggle-sidebar").addEventListener("click", () => {
  const visible = document.body.classList.toggle("show-sidebar");
  $("toggle-sidebar").setAttribute("aria-expanded", String(visible));
});

loadNotes();
if (!initLinkedMode()) {
  selectNote(notes.length > 0 ? [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : null);
}
