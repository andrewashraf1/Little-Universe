// =============================================================================
//  Our Little Universe — visitor app
//
//  gate → backend password check → signed session → private content →
//  render → reveal. Private content only ever enters the page after the
//  backend accepts the session, and is wiped from the DOM again on lock.
// =============================================================================

import { createApi } from "./api.js";
import { clearSession, getSession, login, takeNotice } from "./auth.js";
import { createCursorGlow, createSky, observeReveal, sparkle } from "./effects.js";
import { createGallery } from "./gallery.js";
import { createEnvelope } from "./letter.js";
import { MediaLoader } from "./media.js";
import { createMusic, loadChunkedAudio } from "./music.js";
import { applyTheme } from "./theme.js";
import { $, $$, daysSince, el, formatNumber, prefersReducedMotion, storage, trapFocus, wait } from "./utils.js";

const SESSION_ERRORS = new Set(["session_invalid", "session_expired", "session_revoked"]);
const GATE_CACHE_KEY = "olu.gate";

const params = new URLSearchParams(location.search);
const wantsDemo = params.has("demo") || window.OLU_DEMO === true;

const dom = {
  body: document.body,
  gate: $("#gate"),
  form: $("#gate-form"),
  input: $("#gate-password"),
  reveal: $("#gate-reveal"),
  submit: $("#gate-submit"),
  message: $("#gate-message"),
  setup: $("#gate-setup"),
  demoNote: $("#gate-demo-note"),
  bloom: $("#bloom"),
  world: $("#world"),
  nav: $("#site-nav"),
  lockBtn: $("#nav-lock"),
  heroPhoto: $("#hero-photo"),
  heroTitle: $("#hero-title"),
  heroStats: $("#hero-stats"),
  memoriesCount: $("#memories-count"),
  gallery: $("#gallery"),
  envelopeRoot: $("#envelope-root"),
  star: $("#surprise-star"),
  surprise: $("#surprise-card"),
  surpriseText: $("#surprise-text"),
  surpriseClose: $("#surprise-close"),
  music: $("#music-toggle"),
  musicTitle: $("#music-title"),
};

const state = {
  api: null,
  scope: "live",
  token: null,
  media: null,
  gallery: null,
  envelope: null,
  music: createMusic(dom.music, dom.musicTitle),
  sky: null,
  expiryTimer: 0,
  surprises: [],
  lastSurprise: -1,
};

// -----------------------------------------------------------------------------
// Gate
// -----------------------------------------------------------------------------
function applyGateConfig(cfg) {
  if (!cfg) return;
  for (const node of $$("[data-gate]")) {
    const value = cfg[node.dataset.gate];
    if (typeof value === "string" && value.trim()) node.textContent = value;
  }
  if (cfg.gateTitle) document.title = cfg.gateTitle;
  applyTheme(cfg.theme);
}

function showMessage(text, { error = false } = {}) {
  dom.message.textContent = text;
  dom.message.classList.toggle("is-shown", !!text);
  if (error) {
    dom.gate.classList.remove("is-error");
    void dom.gate.offsetWidth; // restart the shake animation
    dom.gate.classList.add("is-error");
  }
}

function setBusy(busy) {
  dom.gate.classList.toggle("is-busy", busy);
  dom.submit.disabled = busy;
  dom.input.disabled = busy;
}

function messageFor(err) {
  switch (err?.code) {
    case "invalid_password": return "That's not quite it. Try again, love.";
    case "too_many_attempts": {
      const minutes = Math.max(1, Math.ceil((err.retryAfter || 900) / 60));
      return `Too many tries. Please wait ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    case "closed": return "This little world is resting for now.";
    case "no_password_set": return "The door hasn't been set up yet.";
    case "network":
    case "timeout": return "We couldn't reach our little world. Check your connection and try again.";
    case "bad_response": return "The door seems misconfigured. Please check the setup.";
    default: return "Something went wrong. Please try again.";
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const password = dom.input.value;
  if (!password) {
    showMessage("Please enter our secret word.", { error: true });
    dom.input.focus();
    return;
  }
  setBusy(true);
  showMessage("");
  try {
    // The server decides the role from the password; the page only follows its answer.
    const result = await login(state.api, password, state.scope);
    dom.input.value = "";
    if (result.role === "admin") {
      showMessage("Opening the editor…");
      window.location.assign("admin.html");
      return;
    }
    await enter(result.token);
  } catch (err) {
    setBusy(false);
    showMessage(messageFor(err), { error: err?.code === "invalid_password" });
    if (err?.code === "invalid_password") {
      dom.input.select();
      dom.input.focus();
    }
  }
}

// -----------------------------------------------------------------------------
// Enter / render / lock
// -----------------------------------------------------------------------------
async function enter(token, { auto = false } = {}) {
  state.token = token;
  if (auto) {
    setBusy(true);
    showMessage("Opening our little world…");
  }
  let content;
  try {
    content = await state.api.getContent(token);
  } catch (err) {
    setBusy(false);
    if (SESSION_ERRORS.has(err?.code)) {
      clearSession(state.scope);
      showMessage(auto ? "" : "Your visit has ended. Please unlock again.");
    } else {
      showMessage(messageFor(err), { error: !auto });
    }
    state.token = null;
    return;
  }
  render(content);
  showMessage("");
  await revealWorld();
  setBusy(false);
  scheduleExpiry();
}

function scheduleExpiry() {
  clearTimeout(state.expiryTimer);
  const session = getSession(state.scope);
  if (!session) return;
  const ms = new Date(session.expiresAt).getTime() - Date.now();
  state.expiryTimer = setTimeout(() => lock("Your visit has ended. Unlock again to come back in."), Math.max(0, ms));
}

function handleSessionError(err) {
  if (SESSION_ERRORS.has(err?.code)) lock("Your visit has ended. Unlock again to come back in.");
  throw err;
}

function bindText(settings) {
  for (const node of $$("[data-bind]", dom.world)) {
    if (node === dom.heroTitle) continue;
    node.textContent = settings[node.dataset.bind] || "";
  }
  // Editorial touch: the last word of the hero title in italic rose.
  const words = String(settings.heroTitle || "").trim().split(/\s+/).filter(Boolean);
  dom.heroTitle.replaceChildren();
  if (words.length > 2) {
    dom.heroTitle.append(words.slice(0, -1).join(" ") + " ", el("em", { text: words.at(-1) }));
  } else {
    dom.heroTitle.textContent = words.join(" ");
  }
  document.title = settings.siteTitle || "Our Little Universe";
}

function renderStats(photoCount, togetherSince) {
  dom.heroStats.replaceChildren();
  const days = daysSince(togetherSince);
  if (photoCount > 0) dom.heroStats.append(el("span", {}, el("strong", { text: formatNumber(photoCount) }), photoCount === 1 ? "memory" : "memories"));
  if (days != null) dom.heroStats.append(el("span", {}, el("strong", { text: formatNumber(days) }), days === 1 ? "day together" : "days together"));
  dom.memoriesCount.textContent = photoCount > 0 ? `${formatNumber(photoCount)} shared ${photoCount === 1 ? "memory" : "memories"}` : "";
}

function render(content) {
  const settings = content.settings || {};
  applyTheme(content.theme);
  bindText(settings);
  renderStats(content.photos?.length || 0, settings.togetherSince);

  state.media?.dispose();
  state.media = new MediaLoader((ids, size) => state.api.getMedia(state.token, ids, size).catch(handleSessionError));

  // hero background (optional)
  dom.heroPhoto.classList.remove("has-photo");
  dom.heroPhoto.style.backgroundImage = "";
  if (settings.hasHeroImage) {
    state.media.get("hero", "display").then((url) => {
      if (!url) return;
      dom.heroPhoto.style.backgroundImage = `url("${url}")`; // blob: URL created by us
      dom.heroPhoto.classList.add("has-photo");
    }).catch(() => {});
  }

  state.gallery ??= createGallery(dom.gallery, { media: { get: (...a) => state.media.get(...a), prefetch: (...a) => state.media.prefetch(...a) } });
  state.gallery.setPhotos(content.photos || []);

  state.envelope?.destroy();
  state.envelope = createEnvelope(dom.envelopeRoot, { letter: content.letter || {}, prompt: settings.letterPrompt }, { sparkleAt: sparkle });

  state.surprises = (content.surprises || []).filter((s) => typeof s === "string" && s.trim());
  dom.star.hidden = state.surprises.length === 0;

  const token = state.token;
  state.music.configure(content.music, () =>
    loadChunkedAudio((i) => state.api.getAudioChunk(token, i).catch(handleSessionError)));

  observeReveal(dom.world);
}

async function revealWorld() {
  dom.world.hidden = false;
  window.scrollTo(0, 0);
  const reduced = prefersReducedMotion();

  if (!reduced) {
    const heart = $(".gate-emblem", dom.gate).getBoundingClientRect();
    dom.bloom.style.setProperty("--bloom-x", `${heart.left + heart.width / 2}px`);
    dom.bloom.style.setProperty("--bloom-y", `${heart.top + heart.height / 2}px`);
    dom.gate.classList.add("is-unlocking");
    await wait(650);
    dom.bloom.classList.add("is-active");
    await wait(650);
  }
  dom.gate.classList.add("is-gone");
  dom.gate.setAttribute("aria-hidden", "true");
  dom.gate.inert = true;
  dom.body.classList.remove("is-gated");
  dom.world.classList.add("is-entering");
  dom.heroTitle.focus({ preventScroll: true }); // move screen readers into the world, no visible ring
  if (!reduced) {
    await wait(900);
    dom.bloom.classList.remove("is-active");
  }
  setTimeout(() => dom.world.classList.remove("is-entering"), 1600);
}

function lock(message = "") {
  clearTimeout(state.expiryTimer);
  clearSession(state.scope);
  state.token = null;
  state.gallery?.closeLightbox();
  state.envelope?.destroy();
  state.envelope = null;
  state.music.stop();
  state.media?.dispose();
  state.media = null;
  closeSurprise();

  // remove private content from the DOM
  state.gallery?.clear();
  for (const node of $$("[data-bind]", dom.world)) node.textContent = "";
  dom.heroStats.replaceChildren();
  dom.memoriesCount.textContent = "";
  dom.heroPhoto.style.backgroundImage = "";
  dom.heroPhoto.classList.remove("has-photo");

  dom.world.hidden = true;
  dom.body.classList.add("is-gated");
  dom.gate.inert = false;
  dom.gate.removeAttribute("aria-hidden");
  dom.gate.classList.remove("is-gone", "is-unlocking", "is-busy", "is-error");
  setBusy(false);
  showMessage(message);
  state.sky?.setMode("night");
  window.scrollTo(0, 0);
  dom.input.focus({ preventScroll: true });
}

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------
function setupNav() {
  const links = $$("[data-nav]", dom.nav);
  const hero = $("#home");

  const onScroll = () => {
    const threshold = Math.max(80, hero.offsetHeight - 90);
    dom.nav.classList.toggle("is-scrolled", window.scrollY > threshold);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (!("IntersectionObserver" in window)) return;
  const sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.dataset.section;
      links.forEach((a) => {
        const active = a.dataset.nav === id;
        a.classList.toggle("is-active", active);
        if (active) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("[data-section]").forEach((s) => sectionObserver.observe(s));

  // particles: night over the hero, soft gold motes over the cream sections
  const skyObserver = new IntersectionObserver(([entry]) => {
    if (dom.body.classList.contains("is-gated")) return;
    state.sky?.setMode(entry.isIntersecting ? "night" : "day");
  }, { threshold: 0.15 });
  skyObserver.observe(hero);
}

// -----------------------------------------------------------------------------
// Surprise star
// -----------------------------------------------------------------------------
let releaseSurpriseTrap = null;

function openSurprise() {
  if (state.surprises.length === 0) return;
  let i = Math.floor(Math.random() * state.surprises.length);
  if (state.surprises.length > 1 && i === state.lastSurprise) i = (i + 1) % state.surprises.length;
  state.lastSurprise = i;
  dom.surpriseText.textContent = state.surprises[i];
  const r = dom.star.getBoundingClientRect();
  sparkle(r.left + r.width / 2, r.top + r.height / 2, 12);
  dom.surprise.hidden = false;
  requestAnimationFrame(() => dom.surprise.classList.add("is-open"));
  releaseSurpriseTrap = trapFocus(dom.surprise);
  dom.surpriseClose.focus({ preventScroll: true });
}

function closeSurprise() {
  if (dom.surprise.hidden) return;
  dom.surprise.classList.remove("is-open");
  releaseSurpriseTrap?.();
  setTimeout(() => { dom.surprise.hidden = true; }, 450);
  if (!dom.world.hidden) dom.star.focus({ preventScroll: true });
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
async function boot() {
  state.sky = createSky($("#sky"));
  createCursorGlow($("#cursor-glow"));
  applyGateConfig(storage.get(GATE_CACHE_KEY));

  dom.reveal.addEventListener("click", () => {
    const show = dom.input.type === "password";
    dom.input.type = show ? "text" : "password";
    dom.reveal.setAttribute("aria-pressed", String(show));
    dom.reveal.setAttribute("aria-label", show ? "Hide password" : "Show password");
    dom.input.focus();
  });
  dom.lockBtn.addEventListener("click", () => lock("Locked. See you soon."));
  dom.star.addEventListener("click", openSurprise);
  dom.surpriseClose.addEventListener("click", closeSurprise);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSurprise(); });
  document.addEventListener("pointerdown", (e) => {
    if (!dom.surprise.hidden && !dom.surprise.contains(e.target) && e.target !== dom.star && !dom.star.contains(e.target)) closeSurprise();
  });
  setupNav();

  state.api = await createApi({ forceDemo: wantsDemo });
  if (!state.api) {
    dom.form.hidden = true;
    dom.setup.hidden = false;
    return;
  }
  state.scope = state.api.isDemo ? "demo" : "live";
  if (state.api.isDemo) {
    dom.demoNote.hidden = false;
    document.body.append(el("div", { class: "demo-ribbon", text: "Demo" }));
  }

  dom.form.addEventListener("submit", onSubmit);

  state.api.getPublicConfig().then((cfg) => {
    applyGateConfig(cfg);
    if (!state.api.isDemo) storage.set(GATE_CACHE_KEY, { gateTitle: cfg.gateTitle, gateSubtitle: cfg.gateSubtitle, theme: cfg.theme });
    // The form stays usable: the same login also serves the admin, who may enter while it is closed.
    if (cfg.isVisible === false) showMessage("This little world is resting for now.");
  }).catch(() => { /* the gate still works with defaults */ });

  const notice = takeNotice();
  if (notice) showMessage(notice);
  const existing = getSession(state.scope);
  if (existing) await enter(existing.token, { auto: true });
  else if (!matchMedia("(pointer: coarse)").matches) dom.input.focus({ preventScroll: true });
}

boot();
