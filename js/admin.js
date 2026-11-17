// =============================================================================
//  Admin editor. There is NO login form here: everybody signs in on the one shared
//  login page (index.html), where the SERVER decides the role from the password.
//  This page only opens with an admin session the server issued there; without one
//  it sends the browser back to the login page. Every action is re-authorised on the
//  server. All server text is inserted with textContent / .value (never innerHTML).
//  The admin session token lives in sessionStorage (this tab only).
// =============================================================================

import { createApi, readConfig, ApiError } from "./api.js";
import { adminSession, clearSession, setNotice } from "./auth.js";
import { $, $$, el } from "./utils.js";


const SETTINGS_FIELDS = [
  ["siteTitle", "Site title", "text", 120],
  ["gateTitle", "Gate title", "text", 160],
  ["gateSubtitle", "Gate subtitle", "textarea", 300],
  ["heroEyebrow", "Hero eyebrow", "text", 120],
  ["heroTitle", "Hero title", "text", 160],
  ["heroSubtitle", "Hero subtitle", "textarea", 400],
  ["memoriesTitle", "Memories title", "text", 120],
  ["memoriesSubtitle", "Memories subtitle", "textarea", 300],
  ["letterSectionTitle", "Letter section title", "text", 120],
  ["letterPrompt", "Letter prompt", "text", 200],
  ["togetherSince", "Together since", "date"],
  ["footerText", "Footer text", "text", 200],
  ["visitorSessionHours", "Visitor session (hours, 1–168)", "number", null, { min: 1, max: 168, step: 1 }],
  ["adminSessionHours", "Admin session (hours, 0.25–8)", "number", null, { min: 0.25, max: 8, step: 0.25 }],
  ["isVisible", "Site is open for visitors", "checkbox"],
];

const state = { api: null, token: null, content: null };

// ----------------------------------------------------------------- helpers

let toastTimer;
function toast(message, isError = false) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.toggle("is-error", isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 6000 : 3000);
}

function messageFor(err) {
  if (!(err instanceof ApiError)) return "Something went wrong.";
  if (err.code === "too_many_attempts") return `Too many attempts. Try again in ${Math.ceil((err.retryAfter || 60) / 60)} min.`;
  if (err.code === "network" || err.code === "timeout") return "Could not reach the server. Check the connection and try again.";
  return err.message || "Something went wrong.";
}

const SESSION_ENDED = new Set(["admin_session_invalid", "admin_session_expired"]);

/** Call an admin action; if the session ended, go back to the sign-in screen. */
async function adminCall(fn) {
  try {
    return await fn(state.token);
  } catch (err) {
    if (err instanceof ApiError && SESSION_ENDED.has(err.code)) {
      signedOut(err.code === "admin_session_expired" ? "Your admin session ended. Please sign in again." : "Please sign in again.");
      throw err;
    }
    toast(messageFor(err), true);
    throw err;
  }
}

async function withBusy(button, fn) {
  if (button) button.disabled = true;
  try { return await fn(); } catch { return undefined; } finally { if (button) button.disabled = false; }
}

// ----------------------------------------------------------------- views
function show(view) {
  for (const id of ["config-view", "app-view"]) $("#" + id).hidden = id !== view;
}

/**
 * Leave the editor for the one login page. Also removes the read-only site preview token that the login
 * gave the admin on this device, so an ended admin session never leaves the site open behind it.
 */
function signedOut(message) {
  state.token = null;
  state.content = null;
  adminSession.clear();
  clearSession("live");
  if (message) setNotice(message);
  window.location.replace("./");
}

async function signedIn(token, expiresAt) {
  state.token = token;
  $("#session-info").textContent = `Signed in until ${new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  show("app-view");
  await loadContent();
}

// ----------------------------------------------------------------- sign-out
$("#logout-btn").addEventListener("click", async () => {
  const token = state.token;
  if (token) try { await state.api.adminLogout(token); } catch { /* the server session is gone either way after expiry */ }
  signedOut("You are signed out.");
});

// ----------------------------------------------------------------- tabs
for (const tab of $$(".tabs [data-tab]")) {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
}
function selectTab(name) {
  for (const t of $$(".tabs [data-tab]")) t.setAttribute("aria-selected", String(t.dataset.tab === name));
  for (const p of $$(".panel")) p.hidden = p.dataset.panel !== name;
  if (name === "activity") loadLogs();
}

// ----------------------------------------------------------------- content
async function loadContent() {
  state.content = await adminCall((t) => state.api.adminContent(t));
  renderSettings();
  renderLetter();
  renderMessages();
  renderPhotos();
  renderMusic();
}

function renderSettings() {
  const box = $("#settings-fields");
  box.replaceChildren();
  const s = state.content.settings;
  for (const [key, label, type, max, extra = {}] of SETTINGS_FIELDS) {
    let input;
    if (type === "textarea") input = el("textarea", { name: key, rows: 3, maxlength: max });
    else input = el("input", { name: key, type, maxlength: max || null, ...extra });
    if (type === "checkbox") input.checked = !!s[key];
    else input.value = s[key] ?? "";
    box.append(el("label", { class: "field" + (type === "textarea" ? " wide" : "") + (type === "checkbox" ? " inline" : "") },
      type === "checkbox" ? [input, el("span", { text: label })] : [el("span", { text: label }), input]));
  }
}

$("#settings-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.currentTarget;
  const changed = {};
  for (const [key, , type] of SETTINGS_FIELDS) {
    const input = form.elements[key];
    let v = type === "checkbox" ? input.checked : type === "number" ? Number(input.value) : input.value;
    if (v !== state.content.settings[key]) changed[key] = v;
  }
  if (!Object.keys(changed).length) { toast("Nothing changed."); return; }
  await withBusy(form.querySelector("[type=submit]"), async () => {
    await adminCall((t) => state.api.adminUpdateSettings(t, changed));
    Object.assign(state.content.settings, changed);
    toast("Site settings saved.");
  });
});

function renderLetter() {
  const f = $("#letter-form");
  const l = state.content.letter;
  f.elements.title.value = l.title;
  f.elements.content.value = l.content;
  f.elements.signature.value = l.signature;
  f.elements.date.value = l.date || "";
  const env = l.envelope || {};
  f.elements.envelopeColor.value = /^#[0-9a-f]{6}$/i.test(env.envelopeColor || "") ? env.envelopeColor : "#e9c9cf";
  f.elements.paperColor.value = /^#[0-9a-f]{6}$/i.test(env.paperColor || "") ? env.paperColor : "#fff8f2";
  f.elements.sealColor.value = /^#[0-9a-f]{6}$/i.test(env.sealColor || "") ? env.sealColor : "#7a2e45";
  f.elements.sealInitials.value = env.sealInitials || "";
}

$("#letter-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget;
  const letter = {
    title: f.elements.title.value,
    content: f.elements.content.value,
    signature: f.elements.signature.value,
    date: f.elements.date.value,
    envelope: {
      envelopeColor: f.elements.envelopeColor.value.toUpperCase(),
      paperColor: f.elements.paperColor.value.toUpperCase(),
      sealColor: f.elements.sealColor.value.toUpperCase(),
      sealInitials: f.elements.sealInitials.value,
    },
  };
  await withBusy(f.querySelector("[type=submit]"), async () => {
    await adminCall((t) => state.api.adminUpdateLetter(t, letter));
    toast("Letter saved.");
  });
});

function renderMessages() {
  const list = $("#messages-list");
  list.replaceChildren();
  if (!state.content.messages.length) list.append(el("li", { class: "muted", text: "No surprise messages yet." }));
  for (const m of state.content.messages) {
    const text = el("input", { maxlength: 500, "aria-label": "Surprise message" });
    text.value = m.message;
    const active = el("input", { type: "checkbox", "aria-label": "Shown to visitors" });
    active.checked = m.active;
    const save = el("button", { class: "btn", type: "button", text: "Save" });
    const del = el("button", { class: "btn btn-danger", type: "button", text: "Delete" });
    const li = el("li", { class: "item" + (m.active ? "" : " is-hidden"), dataset: { id: m.id } },
      el("div", { class: "row" }, text),
      el("div", { class: "row spread" }, el("label", { class: "field inline" }, active, el("span", { text: "Shown to visitors" })), el("div", { class: "actions" }, save, del)));
    save.addEventListener("click", () => withBusy(save, async () => {
      await adminCall((t) => state.api.adminSaveMessage(t, { id: m.id, message: text.value, active: active.checked }));
      m.message = text.value; m.active = active.checked;
      li.classList.toggle("is-hidden", !m.active);
      toast("Message saved.");
    }));
    del.addEventListener("click", () => withBusy(del, async () => {
      if (!confirm("Delete this surprise message?")) return;
      await adminCall((t) => state.api.adminDeleteMessage(t, m.id));
      state.content.messages = state.content.messages.filter((x) => x.id !== m.id);
      renderMessages();
      toast("Message deleted.");
    }));
    list.append(li);
  }
}

$("#new-message-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget;
  const message = f.elements.message.value.trim();
  if (!message) return;
  await withBusy(f.querySelector("[type=submit]"), async () => {
    const r = await adminCall((t) => state.api.adminSaveMessage(t, { message, active: true }));
    state.content.messages.push({ id: r.id, message, active: true });
    f.reset();
    renderMessages();
    toast("Surprise added.");
  });
});

function renderPhotos() {
  const box = $("#photos-list");
  box.replaceChildren();
  if (!state.content.photos.length) { box.append(el("p", { class: "muted", text: "No photos yet." })); return; }
  for (const p of state.content.photos) {
    const fields = {
      title: el("input", { maxlength: 160, "aria-label": "Title" }),
      caption: el("textarea", { rows: 2, maxlength: 1000, "aria-label": "Caption" }),
      location: el("input", { maxlength: 160, "aria-label": "Location" }),
      date: el("input", { type: "date", "aria-label": "Date" }),
      order: el("input", { type: "number", min: 0, max: 100000, step: 1, "aria-label": "Order" }),
      active: el("input", { type: "checkbox", "aria-label": "Shown to visitors" }),
    };
    fields.title.value = p.title; fields.caption.value = p.caption; fields.location.value = p.location;
    fields.date.value = p.date || ""; fields.order.value = String(p.order ?? 0); fields.active.checked = p.active;
    const save = el("button", { class: "btn", type: "button", text: "Save photo" });
    const card = el("div", { class: "item" + (p.active ? "" : " is-hidden") },
      el("div", { class: "grid" },
        el("label", { class: "field" }, el("span", { text: "Title" }), fields.title),
        el("label", { class: "field" }, el("span", { text: "Location" }), fields.location),
        el("label", { class: "field wide" }, el("span", { text: "Caption" }), fields.caption),
        el("label", { class: "field" }, el("span", { text: "Date" }), fields.date),
        el("label", { class: "field" }, el("span", { text: "Order" }), fields.order)),
      el("div", { class: "row spread" }, el("label", { class: "field inline" }, fields.active, el("span", { text: "Shown to visitors" })), save));
    save.addEventListener("click", () => withBusy(save, async () => {
      const photo = {
        title: fields.title.value, caption: fields.caption.value, location: fields.location.value,
        date: fields.date.value, order: Number(fields.order.value) || 0, active: fields.active.checked,
      };
      await adminCall((t) => state.api.adminUpdatePhoto(t, p.id, photo));
      Object.assign(p, photo);
      card.classList.toggle("is-hidden", !p.active);
      toast("Photo saved.");
    }));
    box.append(card);
  }
}

function renderMusic() {
  const f = $("#music-form");
  const m = state.content.music;
  f.elements.title.value = m.title;
  f.elements.enabled.checked = m.enabled;
  f.elements.volume.value = String(m.volume);
  $("#volume-out").textContent = Math.round(m.volume * 100) + "%";
  $("#music-file").textContent = m.hasFile ? "A song file is linked in the Media sheet." : "No song file linked yet (see the README: put it in the Audio folder and link it in the Media sheet).";
}
$("#music-form").elements.volume.addEventListener("input", (e) => { $("#volume-out").textContent = Math.round(Number(e.target.value) * 100) + "%"; });
$("#music-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget;
  const music = { title: f.elements.title.value, enabled: f.elements.enabled.checked, volume: Number(f.elements.volume.value) };
  await withBusy(f.querySelector("[type=submit]"), async () => {
    await adminCall((t) => state.api.adminUpdateMusic(t, music));
    Object.assign(state.content.music, music);
    toast("Music saved.");
  });
});

// ----------------------------------------------------------------- security
$("#visitor-pw-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget;
  const pw = f.elements.newPassword.value;
  if (pw !== f.elements.repeat.value) { toast("The two passwords are different.", true); return; }
  if (pw.length < 6) { toast("The visitor password needs at least 6 characters.", true); return; }
  await withBusy(f.querySelector("[type=submit]"), async () => {
    await adminCall((t) => state.api.adminChangeVisitorPassword(t, pw));
    f.reset();
    toast("Visitor password changed. Every visitor needs the new password.");
  });
});

$("#admin-pw-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget;
  const current = f.elements.currentPassword.value;
  const pw = f.elements.newPassword.value;
  if (pw !== f.elements.repeat.value) { toast("The two new passwords are different.", true); return; }
  if (pw.length < 10) { toast("The admin password needs at least 10 characters.", true); return; }
  await withBusy(f.querySelector("[type=submit]"), async () => {
    await adminCall((t) => state.api.adminChangeAdminPassword(t, current, pw));
    f.reset();
    signedOut("Admin password changed. Every admin session was ended — sign in with the new password.");
  });
});

$("#end-visitors-btn").addEventListener("click", (ev) => withBusy(ev.currentTarget, async () => {
  if (!confirm("End every visitor session? Visitors will need the password again.")) return;
  await adminCall((t) => state.api.adminEndVisitorSessions(t));
  toast("All visitor sessions ended.");
}));

$("#logout-all-btn").addEventListener("click", (ev) => withBusy(ev.currentTarget, async () => {
  if (!confirm("Sign out every admin session, including this one?")) return;
  await adminCall((t) => state.api.adminLogoutAll(t));
  signedOut("Every admin session was signed out.");
}));

// ----------------------------------------------------------------- activity
async function loadLogs() {
  const body = $("#logs-body");
  try {
    const r = await adminCall((t) => state.api.adminLogs(t, 100));
    body.replaceChildren(...r.entries.map((e) => el("tr", {},
      el("td", { text: e.time ? new Date(e.time).toLocaleString() : "" }), el("td", { text: e.actor }),
      el("td", { text: e.action }), el("td", { text: e.result }), el("td", { text: e.details }))));
    if (!r.entries.length) body.replaceChildren(el("tr", {}, el("td", { colspan: 5, class: "muted", text: "No activity yet." })));
  } catch { /* toast already shown */ }
}
$("#refresh-logs").addEventListener("click", loadLogs);

// ----------------------------------------------------------------- start
async function start() {
  // Refuse to run inside a frame (GitHub Pages cannot send X-Frame-Options / frame-ancestors).
  document.body.classList.remove("is-loading");
  if (window.top !== window.self) {
    document.body.replaceChildren(el("p", { class: "muted", text: "The admin page cannot be shown inside another page." }));
    return;
  }
  const { configured } = readConfig();
  state.api = configured ? await createApi() : null;
  if (!state.api) { show("config-view"); return; }
  const saved = adminSession.get();
  // Not signed in as admin: go to the one login page WITHOUT touching anything else (a visitor who opens
  // this URL keeps their own visitor session).
  if (!saved) { window.location.replace("./"); return; }
  state.token = saved.token;
  try {
    const s = await state.api.adminSession(saved.token);
    await signedIn(saved.token, s.expiresAt);
  } catch (err) {
    signedOut(err instanceof ApiError && err.code === "admin_session_expired" ? "Your admin session ended. Please sign in again." : "Please sign in again.");
  }
}

start();
