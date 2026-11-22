"use strict";

const NOTES_KEY = "markdownNotes";

const $ = (id) => document.getElementById(id);

const notesListEl = $("notes-list");
const titleInput = $("note-title");
const markdownInput = $("markdown-input");
const previewEl = $("markdown-preview");
const charCount = $("char-count");
const wordCount = $("word-count");
const saveStatus = $("save-status");
let notes = [];
let currentId = null;
let debounceTimer = null;
let statusTimer = null;

function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function sanitizeUrl(url) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }
  return null;
}

function renderInline(text) {
  const codeSpans = [];
  let result = text.replace(/`([^`]+)`/g, (m, code) => {
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000C${codeSpans.length - 1}\u0000`;
  });

  result = escapeHtml(result);

  result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const safe = sanitizeUrl(url);
    return safe ? `<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}" loading="lazy" />` : m;
  });

  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const safe = sanitizeUrl(url);
    return safe
      ? `<a href="${escapeAttr(safe)}" rel="noopener noreferrer">${label}</a>`
      : `${label} (${escapeAttr(url)})`;
  });

  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  result = result.replace(/\u0000C(\d+)\u0000/g, (m, i) => codeSpans[i]);

  return result;
}

function renderMarkdown(src) {
  const lines = (src || "").split(/\r?\n/);
  const out = [];
  let i = 0;

  const isListStart = (line) => /^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const code = escapeHtml(buf.join("\n"));
      out.push(
        lang
          ? `<pre><code class="language-${escapeAttr(lang)}">${code}</code></pre>`
          : `<pre><code>${code}</code></pre>`,
      );
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+\[( |x)\]\s+/i.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+\[( |x)\]\s+/i.test(lines[i])) {
        items.push({ text: lines[i], done: /\[x\]/i.test(lines[i]) });
        i += 1;
      }
      out.push(
        `<ul class="task-list">${items
          .map((item) => {
            const text = item.text.replace(/^\s*[-*]\s+\[( |x)\]\s+/i, "");
            return `<li class="task${item.done ? " done" : ""}">${renderCheckbox(item.done)}${renderInline(text)}</li>`;
          })
          .join("")}</ul>`,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(renderInline(lines[i].replace(/^\s*[-*]\s+/, "")));
        i += 1;
      }
      out.push(`<ul>${items.map((it) => `<li>${it}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(renderInline(lines[i].replace(/^\s*\d+[.)]\s+/, "")));
        i += 1;
      }
      out.push(`<ol>${items.map((it) => `<li>${it}</li>`).join("")}</ol>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      para.push(renderInline(lines[i]));
      i += 1;
    }
    out.push(`<p>${para.join("<br />")}</p>`);
  }

  return out.join("\n");

  function renderCheckbox(done) {
    return `<span class="checkbox" role="img" aria-label="${done ? "fait" : "à faire"}"></span>`;
  }

  function isBlockStart(line) {
    return (
      /^\s*```/.test(line) ||
      /^(#{1,6})\s+/.test(line) ||
      /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
      /^\s*>\s?/.test(line) ||
      isListStart(line)
    );
  }
}

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
selectNote(notes.length > 0 ? [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : null);
