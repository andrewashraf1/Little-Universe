// =============================================================================
//  Small DOM + formatting helpers.
//  Rule for the whole project: editable text is ALWAYS inserted with
//  textContent (never innerHTML), so nothing typed in the admin can run code.
// =============================================================================

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * el("p", { class: "x", text: "hi", dataset: { id: 1 }, on: { click: fn } }, child, "text")
 * Strings passed as children become text nodes.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key === "on") for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Parse a trusted, static SVG string (our own icon constants only). */
export function svg(markup) {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isFinePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Plain text → paragraphs (split on blank lines; single newlines kept as line breaks). */
export function textToParagraphs(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Append a paragraph's text, turning single newlines into <br> without innerHTML. */
export function appendMultiline(node, text) {
  String(text).split("\n").forEach((line, i) => {
    if (i > 0) node.append(document.createElement("br"));
    node.append(document.createTextNode(line));
  });
  return node;
}

/** "2024-06-14" → Date at local midnight (avoids the UTC off-by-one). */
export function parseDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value, style = "long") {
  const d = parseDate(value);
  if (!d) return "";
  const opts = style === "short"
    ? { month: "short", year: "numeric" }
    : { day: "numeric", month: "long", year: "numeric" };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

export function daysSince(value) {
  const d = parseDate(value);
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  return ms < 0 ? null : Math.floor(ms / 86_400_000);
}

export function formatNumber(n) {
  return new Intl.NumberFormat().format(n);
}

export function clampString(value, max) {
  return String(value ?? "").slice(0, max);
}

export const HEX_RE = /^#[0-9a-f]{6}$/i;
export function safeHex(value, fallback) {
  return typeof value === "string" && HEX_RE.test(value.trim()) ? value.trim() : fallback;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Lock page scroll (used by dialogs). Counted so nested dialogs behave. */
let lockCount = 0;
export function lockScroll() {
  if (lockCount++ === 0) document.documentElement.classList.add("is-locked");
}
export function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.classList.remove("is-locked");
}

/** Keep Tab focus inside `container` while a dialog is open. Returns a cleanup fn. */
export function trapFocus(container) {
  const handler = (e) => {
    if (e.key !== "Tab") return;
    const focusable = $$('button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])', container)
      .filter((n) => n.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener("keydown", handler);
  return () => container.removeEventListener("keydown", handler);
}

export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
