// =============================================================================
//  The interactive envelope + love letter.
//
//  Sequence on tap:  seal breaks → flap swings open (3D) → letter rises →
//  letter flies forward and unfolds into a readable sheet. "Fold the letter"
//  reverses everything back to the sealed envelope.
//
//  Exported so the admin dashboard can reuse the exact same component for its
//  live preview: createEnvelope(), renderLetterPaper(), normalizeEnvelope().
// =============================================================================

import { appendMultiline, el, formatDate, lockScroll, nextFrame, prefersReducedMotion, safeHex, svg, textToParagraphs, trapFocus, unlockScroll, wait } from "./utils.js";

export const SEAL_ICONS = {
  heart: '<svg viewBox="0 0 24 24" class="seal-icon" aria-hidden="true"><path d="M12 20.3C6.6 16.6 3.5 13.6 3.5 9.9 3.5 7.4 5.4 5.5 7.8 5.5c1.7 0 3.2.9 4.2 2.3 1-1.4 2.5-2.3 4.2-2.3 2.4 0 4.3 1.9 4.3 4.4 0 3.7-3.1 6.7-8.5 10.4z" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="seal-icon" aria-hidden="true"><path d="M12 2.5c.7 5 3.5 7.8 8.5 8.5-5 .7-7.8 3.5-8.5 8.5-.7-5-3.5-7.8-8.5-8.5 5-.7 7.8-3.5 8.5-8.5z" fill="currentColor"/></svg>',
  moon: '<svg viewBox="0 0 24 24" class="seal-icon" aria-hidden="true"><path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.9A7 7 0 0 1 15.5 3.5z" fill="currentColor"/></svg>',
  flower: '<svg viewBox="0 0 24 24" class="seal-icon" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="6.2" r="3.4"/><circle cx="17.5" cy="10.2" r="3.4"/><circle cx="15.4" cy="16.8" r="3.4"/><circle cx="8.6" cy="16.8" r="3.4"/><circle cx="6.5" cy="10.2" r="3.4"/></g><circle cx="12" cy="12" r="2.6" fill="rgba(255,255,255,.35)"/></svg>',
};

export const ANIMATION_STYLES = { classic: 1, gentle: 1.6, swift: 0.6 };
export const LETTER_BACKGROUNDS = ["blush", "cream", "dusk", "night"];

export const DEFAULT_ENVELOPE = Object.freeze({
  envelopeColor: "#E9C9CF",
  paperColor: "#FFF8F2",
  sealColor: "#7A2E45",
  sealIcon: "heart",
  sealInitials: "",
  animationStyle: "classic",
  background: "blush",
});

const ORNAMENT = '<svg class="letter-ornament" viewBox="0 0 120 16" aria-hidden="true"><path d="M2 8h44M74 8h44" stroke="currentColor" stroke-width=".8" stroke-linecap="round"/><path d="M60 13.5c-4.2-2.9-6.8-5.3-6.8-8 0-1.9 1.5-3.4 3.4-3.4 1.4 0 2.6.8 3.4 1.9.8-1.1 2-1.9 3.4-1.9 1.9 0 3.4 1.5 3.4 3.4 0 2.7-2.6 5.1-6.8 8z" fill="none" stroke="currentColor" stroke-width=".9"/><circle cx="50" cy="8" r="1" fill="currentColor"/><circle cx="70" cy="8" r="1" fill="currentColor"/></svg>';

export function normalizeEnvelope(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    envelopeColor: safeHex(src.envelopeColor, DEFAULT_ENVELOPE.envelopeColor),
    paperColor: safeHex(src.paperColor, DEFAULT_ENVELOPE.paperColor),
    sealColor: safeHex(src.sealColor, DEFAULT_ENVELOPE.sealColor),
    sealIcon: Object.hasOwn(SEAL_ICONS, src.sealIcon) || src.sealIcon === "initials" ? src.sealIcon : "heart",
    sealInitials: String(src.sealInitials ?? "").replace(/[^\p{L}\p{N}&.+ ]/gu, "").trim().slice(0, 3),
    animationStyle: Object.hasOwn(ANIMATION_STYLES, src.animationStyle) ? src.animationStyle : "classic",
    background: LETTER_BACKGROUNDS.includes(src.background) ? src.background : "blush",
  };
}

function sealContent(env) {
  if (env.sealIcon === "initials" && env.sealInitials) {
    return el("span", { class: "seal-initials", text: env.sealInitials });
  }
  return svg(SEAL_ICONS[env.sealIcon] || SEAL_ICONS.heart);
}

/** Fill a .letter-paper's scroll area with the letter content (safe text only). */
export function renderLetterPaper(scroll, letter = {}) {
  scroll.replaceChildren();
  scroll.append(svg(ORNAMENT));
  scroll.append(el("p", { class: "letter-date", text: formatDate(letter.date) }));
  scroll.append(el("h3", { class: "letter-title", id: "letter-reader-title", text: letter.title || "" }));
  const body = el("div", { class: "letter-body" });
  for (const para of textToParagraphs(letter.content)) body.append(appendMultiline(el("p"), para));
  scroll.append(body);
  scroll.append(el("p", { class: "letter-signature", text: letter.signature || "" }));
}

/**
 * Mount an envelope into `root`.
 * data: { letter: { title, content, signature, date, envelope }, prompt }
 */
export function createEnvelope(root, data, { onOpen, onClose, sparkleAt } = {}) {
  const reduced = prefersReducedMotion();
  let env = normalizeEnvelope(data?.letter?.envelope);
  let letter = data?.letter || {};
  let state = "closed";
  let releaseTrap = null;

  // ---- build DOM -------------------------------------------------------------
  const sealHalves = [
    el("span", { class: "seal-half is-left" }, el("span", { class: "seal-disc" }, sealContent(env))),
    el("span", { class: "seal-half is-right" }, el("span", { class: "seal-disc" }, sealContent(env))),
  ];
  const envLetter = el("span", { class: "env-letter" },
    el("span", { class: "env-letter-inner" },
      el("span", { class: "env-letter-title", text: letter.title || "" }),
      el("span", { class: "env-letter-line" }),
      el("span", { class: "env-letter-line" }),
      el("span", { class: "env-letter-line" }),
      el("span", { class: "env-letter-line" }),
    ),
  );
  const button = el("button", {
    class: "envelope",
    type: "button",
    "aria-label": "Open the letter",
    "aria-expanded": "false",
    "aria-haspopup": "dialog",
  },
  el("span", { class: "env-back" }),
  envLetter,
  el("span", { class: "env-pocket" }, el("span", { class: "env-pocket-shape" })),
  el("span", { class: "env-flap" },
    el("span", { class: "env-flap-face is-front" }),
    el("span", { class: "env-flap-face is-back" }),
  ),
  el("span", { class: "env-seal" }, ...sealHalves),
  );

  const prompt = el("p", { class: "envelope-prompt", text: data?.prompt || "" });
  const hint = el("p", { class: "envelope-hint", text: "Tap to open", "aria-hidden": "true" });
  const stage = el("div", { class: "envelope-stage", dataset: { state } },
    prompt,
    el("div", { class: "envelope-wrap" }, button, el("span", { class: "envelope-shadow" })),
    hint,
  );

  // reader overlay
  const scroll = el("div", { class: "letter-scroll", tabindex: "0" });
  const closeBtn = el("button", { class: "letter-close", type: "button" }, "Fold the letter");
  const paper = el("article", { class: "letter-paper" }, scroll, el("div", { class: "letter-actions" }, closeBtn));
  const overlay = el("div", {
    class: "letter-overlay",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "letter-reader-title",
    hidden: true,
  }, el("div", { class: "letter-backdrop" }), paper);

  root.replaceChildren(stage);
  document.body.append(overlay);

  function applyStyle() {
    const speed = reduced ? 0.01 : ANIMATION_STYLES[env.animationStyle];
    for (const node of [stage, overlay]) {
      node.style.setProperty("--env", env.envelopeColor);
      node.style.setProperty("--paper", env.paperColor);
      node.style.setProperty("--seal", env.sealColor);
      node.style.setProperty("--speed", String(speed));
    }
    paper.style.setProperty("--paper", env.paperColor);
    const section = root.closest(".letter-section");
    if (section) section.dataset.bg = env.background;
  }
  applyStyle();
  renderLetterPaper(scroll, letter);

  const ms = (n) => (reduced ? 0 : n * ANIMATION_STYLES[env.animationStyle]);

  function setState(next) {
    state = next;
    stage.dataset.state = next;
  }

  // ---- open ------------------------------------------------------------------
  async function open() {
    if (state !== "closed") return;
    setState("opening");
    button.setAttribute("aria-expanded", "true");
    onOpen?.();

    const sealRect = stage.querySelector(".env-seal").getBoundingClientRect();
    stage.classList.add("is-seal-broken");
    sparkleAt?.(sealRect.left + sealRect.width / 2, sealRect.top + sealRect.height / 2);
    await wait(ms(420));

    stage.classList.add("is-flap-open");
    await wait(ms(880));

    stage.classList.add("is-flap-behind", "is-letter-out");
    await wait(ms(900));

    await openReader();
    setState("open");
  }

  async function openReader() {
    const from = envLetter.getBoundingClientRect();
    overlay.hidden = false;
    lockScroll();
    scroll.scrollTop = 0;
    await nextFrame();

    const to = paper.getBoundingClientRect();
    if (!reduced) {
      paper.style.transition = "none";
      paper.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
      paper.getBoundingClientRect();
    }
    stage.classList.add("is-reading");
    overlay.classList.add("is-open", "is-unfolding");
    paper.style.transition = `transform ${ms(1100)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    paper.style.transform = "none";
    await wait(ms(700));
    overlay.classList.add("is-readable");
    await wait(ms(400));

    releaseTrap = trapFocus(overlay);
    scroll.focus({ preventScroll: true });
  }

  // ---- close -----------------------------------------------------------------
  async function close() {
    if (state !== "open") return;
    setState("closing");
    releaseTrap?.();
    releaseTrap = null;

    overlay.classList.remove("is-readable");
    await wait(ms(250));
    const to = envLetter.getBoundingClientRect();
    const from = paper.getBoundingClientRect();
    paper.style.transition = `transform ${ms(800)}ms cubic-bezier(0.65, 0, 0.35, 1)`;
    paper.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
    overlay.classList.remove("is-open", "is-unfolding");
    await wait(ms(800));

    stage.classList.remove("is-reading");
    overlay.hidden = true;
    paper.style.transition = "none";
    paper.style.transform = "none";
    unlockScroll();

    stage.classList.remove("is-letter-out");
    await wait(ms(800));
    stage.classList.remove("is-flap-behind");
    await nextFrame();
    stage.classList.remove("is-flap-open");
    await wait(ms(820));
    stage.classList.remove("is-seal-broken");
    await wait(ms(500));

    setState("closed");
    button.setAttribute("aria-expanded", "false");
    button.focus({ preventScroll: true });
    onClose?.();
  }

  button.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.querySelector(".letter-backdrop").addEventListener("click", close);
  const onKey = (e) => { if (e.key === "Escape" && state === "open") close(); };
  document.addEventListener("keydown", onKey);

  return {
    open,
    close,
    get state() { return state; },
    /** Live-update content and look (used by the admin preview). */
    update(next = {}) {
      if (next.letter) {
        letter = next.letter;
        env = normalizeEnvelope(next.letter.envelope);
        envLetter.querySelector(".env-letter-title").textContent = letter.title || "";
        renderLetterPaper(scroll, letter);
        sealHalves.forEach((half) => half.querySelector(".seal-disc").replaceChildren(sealContent(env)));
        applyStyle();
      }
      if (typeof next.prompt === "string") prompt.textContent = next.prompt;
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      if (!overlay.hidden) unlockScroll();
      overlay.remove();
      root.replaceChildren();
    },
  };
}
