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
const readTime = $("read-time");
const noteDates = $("note-dates");
const notesStats = $("notes-stats");
const notesSearch = $("notes-search");
const sortNotesSelect = $("sort-notes");
const formatBar = $("format-bar");
const exportMenuBtn = $("export-menu-btn");
const exportMenu = $("export-menu");
const importNotesInput = $("import-notes-input");
const saveStatus = $("save-status");
let notes = [];
let linkedPoint = null;
let currentId = null;
let searchQuery = "";
let sortMode = "recent";
try {
  if (localStorage.getItem("notesSort") === "title") sortMode = "title";
} catch (error) {
  console.warn("localStorage indisponible:", error);
}
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

function exitLinkedMode() {
  linkedPoint = null;
  document.body.classList.remove("linked-mode");
  $("linked-banner").hidden = true;
  titleInput.readOnly = false;
  $("new-note").disabled = false;
  $("duplicate-btn").disabled = false;
  $("delete-btn").disabled = false;
  loadNotes();
  currentId = notes.length > 0 ? [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : null;
  renderNotesList();
  renderEditor();
}

function enterLinkedMode(point) {
  linkedPoint = point;
  document.body.classList.add("linked-mode");
  $("linked-point-name").textContent = point.name || "Sans nom";
  $("linked-banner").hidden = false;
  updateNotesStats();
  titleInput.value = point.name || "";
  titleInput.readOnly = true;
  $("new-note").disabled = true;
  $("duplicate-btn").disabled = true;
  $("delete-btn").disabled = true;
  markdownInput.value = point.note || "";
  currentId = null;
  renderNotesList();
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
  const sorted = [...notes].sort((a, b) =>
    sortMode === "title"
      ? noteTitle(a).localeCompare(noteTitle(b), "fr")
      : b.updatedAt - a.updatedAt,
  );
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? sorted.filter(
        (note) =>
          (note.title || "").toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query),
      )
    : sorted;
  notesListEl.innerHTML = "";

  filtered.forEach((note) => {
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

  updateNotesStats();

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "note-item-empty";
    empty.textContent = query ? "Aucune note ne correspond." : "Aucune note. Créez-en une !";
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
  if (readTime) {
    readTime.textContent =
      words > 0 ? `~${Math.max(1, Math.ceil(words / 200))} min de lecture` : "";
  }
  if (noteDates) {
    if (linkedPoint) {
      noteDates.textContent = "Point de la carte";
    } else {
      const note = currentNote();
      if (note) {
        const updated = new Date(note.updatedAt).toLocaleString("fr-CA");
        const created = new Date(note.createdAt).toLocaleDateString("fr-CA");
        noteDates.textContent = `Modifiée le ${updated} (créée le ${created})`;
      } else {
        noteDates.textContent = "";
      }
    }
  }
}

function updateNotesStats() {
  if (!notesStats) return;
  let words = 0;
  let chars = 0;
  notes.forEach((note) => {
    chars += note.content.length;
    const trimmed = note.content.trim();
    if (trimmed) words += trimmed.split(/\s+/).length;
  });
  if (notes.length === 0) {
    notesStats.textContent = "Aucune note";
    return;
  }
  const noteLabel = notes.length > 1 ? "notes" : "note";
  const wordLabel = words > 1 ? "mots" : "mot";
  const charLabel = chars > 1 ? "caractères" : "caractère";
  notesStats.textContent = `${notes.length} ${noteLabel} · ${words} ${wordLabel} · ${chars} ${charLabel}`;
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

function copyRenderedHtml() {
  if (!currentNote()) return;
  navigator.clipboard
    .writeText(renderMarkdown(markdownInput.value))
    .then(() => setStatus("HTML rendu copié"))
    .catch(() => setStatus("Copie impossible", "error"));
}

function toggleSpellcheck() {
  const enabled = markdownInput.spellcheck;
  markdownInput.spellcheck = !enabled;
  const btn = $("spellcheck-btn");
  btn.setAttribute("aria-pressed", String(!enabled));
  setStatus(!enabled ? "Orthographe activée" : "Orthographe désactivée");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function duplicateCurrent() {
  const note = currentNote();
  if (!note) return;

  const copy = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    title: note.title ? `${note.title} (copie)`.substring(0, 120) : "",
    content: note.content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes.push(copy);
  persist();
  selectNote(copy.id);
  setStatus("Note dupliquée");
}

function exportNote() {
  const note = currentNote();
  if (!note) return;

  downloadFile(markdownInput.value, `${slugify(noteTitle(note))}.md`, "text/markdown");
  setStatus("Téléchargement lancé");
}

function exportAllMarkdown() {
  if (notes.length === 0) {
    setStatus("Aucune note à exporter", "error");
    return;
  }

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  const header = `# Toutes les notes\n\n${sorted.length} note(s) — exportées le ${new Date().toLocaleDateString("fr-CA")}\n\n`;
  const body = sorted.map((n) => `## ${noteTitle(n)}\n\n${n.content.trim()}\n\n---\n`).join("\n");
  downloadFile(
    header + body,
    `notes_${new Date().toISOString().split("T")[0]}.md`,
    "text/markdown",
  );
  setStatus("Téléchargement lancé");
}

function exportNotesJSON() {
  if (notes.length === 0) {
    setStatus("Aucune note à exporter", "error");
    return;
  }

  const payload = JSON.stringify(
    { version: 1, exportDate: new Date().toISOString(), notes },
    null,
    2,
  );
  downloadFile(
    payload,
    `notes_sauvegarde_${new Date().toISOString().split("T")[0]}.json`,
    "application/json",
  );
  setStatus("Sauvegarde téléchargée");
}

function importNotesJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : parsed?.notes;
      if (!Array.isArray(incoming) || incoming.length === 0) {
        setStatus("Fichier invalide", "error");
        return;
      }
      const valid = incoming
        .filter((n) => n && typeof n.content === "string")
        .map((n) => ({
          id:
            typeof n.id === "string"
              ? n.id
              : Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          title: typeof n.title === "string" ? n.title.substring(0, 120) : "",
          content: n.content.substring(0, 100000),
          createdAt: Number.isFinite(n.createdAt) ? n.createdAt : Date.now(),
          updatedAt: Number.isFinite(n.updatedAt) ? n.updatedAt : Date.now(),
        }));
      if (valid.length === 0) {
        setStatus("Aucune note valide dans le fichier", "error");
        return;
      }
      if (!confirm(`Restaurer ${valid.length} note(s) et remplacer celles actuelles ?`)) return;

      notes = valid;
      persist();
      currentId = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
      searchQuery = "";
      notesSearch.value = "";
      renderNotesList();
      renderEditor();
      setStatus(`${valid.length} note(s) restaurée(s)`);
    } catch (error) {
      console.warn("Import impossible:", error);
      setStatus("Fichier JSON invalide", "error");
    }
  };
  reader.readAsText(file);
}

function applyFormat(type) {
  const start = markdownInput.selectionStart;
  const end = markdownInput.selectionEnd;
  const value = markdownInput.value;
  const selected = value.slice(start, end);
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;

  let replacement = selected || "texte";
  let replaceFrom = start;
  let cursorFrom = start;
  let cursorTo = start + replacement.length;

  const blocks = { titre: "## ", liste: "- ", citation: "> " };
  if (blocks[type]) {
    replaceFrom = lineStart;
    replacement = blocks[type] + value.slice(lineStart, end);
    cursorFrom = lineStart + blocks[type].length;
    cursorTo = start + blocks[type].length;
  } else if (type === "gras") {
    replacement = `**${selected || "gras"}**`;
    cursorFrom = start + 2;
    cursorTo = cursorFrom + (selected || "gras").length;
  } else if (type === "italique") {
    replacement = `*${selected || "italique"}*`;
    cursorFrom = start + 1;
    cursorTo = cursorFrom + (selected || "italique").length;
  } else if (type === "code") {
    replacement = `\`${selected || "code"}\``;
    cursorFrom = start + 1;
    cursorTo = cursorFrom + (selected || "code").length;
  } else if (type === "date") {
    replacement = new Date().toLocaleDateString("fr-CA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    cursorFrom = start;
    cursorTo = start + replacement.length;
  } else if (type === "lien") {
    replacement = `[${selected || "texte du lien"}](https://)`;
    cursorFrom = start + 1;
    cursorTo = start + 1 + (selected || "texte du lien").length;
  }

  markdownInput.setRangeText(replacement, replaceFrom, end, "end");
  markdownInput.setSelectionRange(cursorFrom, cursorTo);
  markdownInput.focus();
  renderPreview();
  scheduleSave();
}

defineFormatBar();

function defineFormatBar() {
  formatBar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;
    applyFormat(btn.dataset.format);
  });
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

previewEl.addEventListener("click", (e) => {
  const taskItem = e.target.closest(".task");
  if (!taskItem || linkedPoint) return;

  const tasks = [...previewEl.querySelectorAll(".task")];
  const index = tasks.indexOf(taskItem);
  if (index === -1) return;

  let seen = -1;
  markdownInput.value = markdownInput.value.replace(
    /^(\s*[-*]\s+)\[([ xX])\]\s+/gm,
    (match, prefix, box) => {
      seen += 1;
      if (seen !== index) return match;
      const done = box.trim().toLowerCase() === "x";
      return `${prefix}[${done ? " " : "x"}] `;
    },
  );

  renderPreview();
  updateCounts();
  scheduleSave();
});

titleInput.addEventListener("input", scheduleSave);

function toggleExportMenu(force) {
  const visible = typeof force === "boolean" ? force : exportMenu.hidden;
  exportMenu.hidden = !visible;
  exportMenuBtn.setAttribute("aria-expanded", String(visible));
}

exportMenuBtn.addEventListener("click", () => toggleExportMenu());

document.addEventListener("click", (e) => {
  if (!exportMenu.hidden && !e.target.closest(".toolbar-group")) {
    toggleExportMenu(false);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !exportMenu.hidden) {
    toggleExportMenu(false);
    return;
  }
  if (document.activeElement === markdownInput && (e.ctrlKey || e.metaKey)) {
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      applyFormat("gras");
      return;
    }
    if (key === "i") {
      e.preventDefault();
      applyFormat("italique");
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    clearTimeout(debounceTimer);
    saveCurrent();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    notesSearch.focus();
  }
});

$("export-md-btn").addEventListener("click", () => {
  toggleExportMenu(false);
  exportNote();
});
$("export-all-md-btn").addEventListener("click", () => {
  toggleExportMenu(false);
  exportAllMarkdown();
});
$("export-json-btn").addEventListener("click", () => {
  toggleExportMenu(false);
  exportNotesJSON();
});
$("import-json-btn").addEventListener("click", () => {
  toggleExportMenu(false);
  importNotesInput.click();
});
$("copy-html-btn").addEventListener("click", () => {
  toggleExportMenu(false);
  copyRenderedHtml();
});
$("print-btn").addEventListener("click", () => {
  toggleExportMenu(false);
  window.print();
});
$("spellcheck-btn").addEventListener("click", toggleSpellcheck);
importNotesInput.addEventListener("change", () => {
  const file = importNotesInput.files?.[0];
  importNotesInput.value = "";
  if (file) importNotesJSON(file);
});

if (notesSearch) {
  notesSearch.addEventListener("input", () => {
    searchQuery = notesSearch.value;
    renderNotesList();
  });
}

if (sortNotesSelect) {
  sortNotesSelect.value = sortMode;
  sortNotesSelect.addEventListener("change", () => {
    sortMode = sortNotesSelect.value;
    try {
      localStorage.setItem("notesSort", sortMode);
    } catch (error) {
      console.warn("Préférence de tri non enregistrée:", error);
    }
    renderNotesList();
  });
}

$("new-note").addEventListener("click", () => {
  if (linkedPoint) return;
  createNote();
});
$("duplicate-btn").addEventListener("click", duplicateCurrent);
$("delete-btn").addEventListener("click", deleteCurrent);
$("copy-btn").addEventListener("click", copyMarkdown);
$("fullscreen-btn").addEventListener("click", toggleFullscreen);

function setPreviewMode(show) {
  $("editor-panes").classList.toggle("show-preview", show);
  $("toggle-preview").setAttribute("aria-pressed", String(show));
}

$("toggle-preview").addEventListener("click", () => {
  setPreviewMode(!$("editor-panes").classList.contains("show-preview"));
});

$("close-preview")?.addEventListener("click", () => setPreviewMode(false));

$("toggle-sidebar").addEventListener("click", () => {
  const visible = document.body.classList.toggle("show-sidebar");
  $("toggle-sidebar").setAttribute("aria-expanded", String(visible));
});

window.addEventListener("storage", (e) => {
  if (linkedPoint) {
    if (e.key === MAP_POINTS_KEY) {
      const stillThere = loadMapPoints().find(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          p.lat.toFixed(5) === linkedPoint.lat.toFixed(5) &&
          p.lng.toFixed(5) === linkedPoint.lng.toFixed(5),
      );
      if (!stillThere) {
        linkedPoint.note = "";
        setStatus("Le point a été supprimé", "error");
        exitLinkedMode();
      }
    }
    return;
  }

  if (e.key === NOTES_KEY || e.key === null) {
    saveCurrent();
    loadNotes();
    if (!notes.some((n) => n.id === currentId)) {
      currentId =
        notes.length > 0 ? [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : null;
    }
    renderNotesList();
    renderEditor();
  }
});

loadNotes();
if (!initLinkedMode()) {
  selectNote(notes.length > 0 ? [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : null);
}
