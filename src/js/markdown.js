"use strict";

function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
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

  const isBlockStart = (line) =>
    /^\s*```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
    /^\s*>\s?/.test(line) ||
    isListStart(line);

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
            const box = `<span class="checkbox" role="img" aria-label="${item.done ? "fait" : "à faire"}"></span>`;
            return `<li class="task${item.done ? " done" : ""}">${box}${renderInline(text)}</li>`;
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
}
