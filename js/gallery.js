// =============================================================================
//  "Our Memories" — editorial masonry gallery + fullscreen lightbox.
//
//  Order is preserved left-to-right (each photo goes into the currently
//  shortest column, using its known aspect ratio, so there's no layout jump).
//  Thumbnails load lazily through MediaLoader; the lightbox shows the thumbnail
//  instantly and swaps in the larger display version when it arrives.
// =============================================================================

import { $, el, formatDate, lockScroll, prefersReducedMotion, trapFocus, unlockScroll, wait } from "./utils.js";

function columnsFor(width) {
  if (width < 300) return 1;
  if (width < 860) return 2;
  if (width < 1280) return 3;
  return 4;
}

function metaLine(photo) {
  return [formatDate(photo.date), photo.location].filter(Boolean).join("  ·  ");
}

function aspectOf(photo) {
  const w = Number(photo.width), h = Number(photo.height);
  return w > 0 && h > 0 ? h / w : 1.25;
}

export function createGallery(root, { media, emptyText = "Our first memories are still being written." } = {}) {
  let photos = [];
  let columns = 0;
  const thumbUrls = new Map();
  const cards = new Map();
  const lightbox = createLightbox({ media, thumbUrls, getPhotos: () => photos, getCard: (id) => cards.get(id) });

  const lazy = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        lazy.unobserve(entry.target);
        loadThumb(entry.target);
      }
    }, { rootMargin: "600px 0px" })
    : null;

  function loadThumb(frame) {
    const id = frame.dataset.id;
    const img = frame.querySelector("img");
    media.get(id, "thumb").then((url) => {
      if (!url) { frame.classList.add("is-error"); return; }
      thumbUrls.set(id, url);
      img.addEventListener("load", () => frame.classList.add("is-loaded"), { once: true });
      img.addEventListener("error", () => frame.classList.add("is-error"), { once: true });
      img.src = url;
    }).catch(() => frame.classList.add("is-error"));
  }

  function buildCard(photo, index) {
    const img = el("img", { alt: photo.title || "A memory together", decoding: "async", draggable: "false" });
    const frame = el("div", { class: "photo-frame", dataset: { id: photo.id }, style: { aspectRatio: `1 / ${aspectOf(photo)}` } }, img);

    const caption = el("div", { class: "photo-caption" });
    if (photo.title) caption.append(el("h3", { class: "photo-title", text: photo.title }));
    const meta = metaLine(photo);
    if (meta) caption.append(el("p", { class: "photo-meta", text: meta }));
    if (photo.caption) caption.append(el("p", { class: "photo-text", text: photo.caption }));

    const card = el("button", {
      class: "photo-card",
      type: "button",
      "aria-label": `Open photo${photo.title ? `: ${photo.title}` : ` ${index + 1}`}`,
      "data-reveal": true,
      on: { click: () => lightbox.open(index) },
    }, frame, caption);
    card.style.transitionDelay = `${(index % 4) * 70}ms`;
    cards.set(photo.id, card);
    return card;
  }

  function layout(force = false) {
    const next = columnsFor(root.clientWidth || window.innerWidth);
    if (!force && next === columns) return;
    columns = next;
    root.replaceChildren();

    if (photos.length === 0) {
      root.append(el("p", { class: "gallery-empty", text: emptyText }));
      return;
    }

    const cols = Array.from({ length: columns }, () => ({ node: el("div", { class: "gallery-col" }), h: 0 }));
    photos.forEach((photo, i) => {
      const card = cards.get(photo.id) || buildCard(photo, i);
      const target = cols.reduce((a, b) => (b.h < a.h - 0.01 ? b : a));
      target.node.append(card);
      target.h += aspectOf(photo) + (photo.title || photo.caption ? 0.22 : 0.04);
    });
    root.append(...cols.map((c) => c.node));

    for (const card of cards.values()) {
      const frame = $(".photo-frame", card);
      if (frame.classList.contains("is-loaded") || frame.querySelector("img").src) continue;
      if (lazy) lazy.observe(frame); else loadThumb(frame);
    }
  }

  const ro = "ResizeObserver" in window ? new ResizeObserver(() => { if (photos.length || columns) layout(); }) : null;
  ro?.observe(root);
  if (!ro) window.addEventListener("resize", () => layout(), { passive: true });

  return {
    setPhotos(list) {
      photos = Array.isArray(list) ? list : [];
      cards.clear();
      lazy?.disconnect();
      layout(true);
    },
    /** Remove every photo from the DOM (used when the world is locked). */
    clear() {
      photos = [];
      cards.clear();
      lazy?.disconnect();
      columns = 0;
      root.replaceChildren();
    },
    get count() { return photos.length; },
    closeLightbox: () => lightbox.close(true),
  };
}

// =============================================================================
//  Lightbox
// =============================================================================
function createLightbox({ media, thumbUrls, getPhotos, getCard }) {
  const box = $("#lightbox");
  const stage = $("#lb-stage");
  const img = $("#lb-img");
  const count = $("#lb-count");
  const title = $("#lb-title");
  const meta = $("#lb-meta");
  const text = $("#lb-text");
  const prevBtn = $("#lb-prev");
  const nextBtn = $("#lb-next");
  const reduced = prefersReducedMotion();

  let index = 0;
  let isOpen = false;
  let busy = false;
  let releaseTrap = null;
  let returnFocus = null;
  let loadToken = 0;

  function photo() { return getPhotos()[index]; }

  /** Size the image to fit the stage; returns its final rect. */
  function fit(p = photo()) {
    const cs = getComputedStyle(stage);
    const sw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const sh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const ratio = aspectOf(p); // h / w
    let w = sw, h = sw * ratio;
    if (h > sh) { h = sh; w = sh / ratio; }
    img.style.width = `${Math.round(w)}px`;
    img.style.height = `${Math.round(h)}px`;
    return img.getBoundingClientRect();
  }

  function fillCaption(p) {
    const total = getPhotos().length;
    count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    title.textContent = p.title || "";
    meta.textContent = metaLine(p);
    text.textContent = p.caption || "";
    img.alt = p.title || "A memory together";
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === total - 1;
  }

  function showImage(p) {
    const token = ++loadToken;
    const thumb = thumbUrls.get(p.id);
    if (thumb) img.src = thumb; else img.removeAttribute("src");
    box.classList.add("is-loading");
    media.get(p.id, "display").then((url) => {
      if (token !== loadToken) return;
      if (!url) { box.classList.remove("is-loading"); return; }
      const pre = new Image();
      pre.onload = () => {
        if (token !== loadToken) return;
        img.src = url;
        box.classList.remove("is-loading");
      };
      pre.onerror = () => box.classList.remove("is-loading");
      pre.src = url;
    }).catch(() => token === loadToken && box.classList.remove("is-loading"));

    // warm neighbours
    const list = getPhotos();
    for (const n of [list[index + 1], list[index - 1]]) if (n) media.prefetch(n.id, "display");
  }

  function originRect(p) {
    const frame = getCard(p.id)?.querySelector(".photo-frame");
    if (!frame) return null;
    const r = frame.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.width === 0) return null;
    return r;
  }

  function flipFrom(from, to, duration = 520) {
    if (!from || reduced) return Promise.resolve();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    img.style.transition = "none";
    img.style.transformOrigin = "0 0";
    img.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    img.getBoundingClientRect();
    img.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    img.style.transform = "none";
    return wait(duration);
  }

  async function open(i) {
    const list = getPhotos();
    if (!list[i] || isOpen) return;
    index = i;
    isOpen = true;
    returnFocus = document.activeElement;
    const p = photo();

    box.hidden = false;
    lockScroll();
    fillCaption(p);
    showImage(p);
    img.style.opacity = "1";
    const to = fit(p);
    const from = originRect(p);
    if (!from && !reduced) {
      img.style.transition = "none";
      img.style.opacity = "0";
      img.style.transform = "scale(0.94)";
      img.getBoundingClientRect();
      img.style.transition = "transform 500ms cubic-bezier(0.22,1,0.36,1), opacity 400ms";
      img.style.opacity = "1";
      img.style.transform = "none";
    }
    requestAnimationFrame(() => box.classList.add("is-open"));
    releaseTrap = trapFocus(box);
    $(".lb-close", box).focus({ preventScroll: true });
    await flipFrom(from, to);
  }

  async function close(immediate = false) {
    if (!isOpen) return;
    isOpen = false;
    loadToken++;
    const p = photo();
    box.classList.remove("is-open", "is-loading");
    const from = !immediate && p ? originRect(p) : null;
    if (from && !reduced) {
      const to = img.getBoundingClientRect();
      img.style.transformOrigin = "0 0";
      img.style.transition = "transform 420ms cubic-bezier(0.65,0,0.35,1)";
      img.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
      await wait(420);
    } else if (!immediate && !reduced) {
      img.style.transition = "opacity 300ms, transform 300ms";
      img.style.opacity = "0";
      img.style.transform = "scale(0.96)";
      await wait(300);
    }
    box.hidden = true;
    img.style.transition = "none";
    img.style.transform = "none";
    unlockScroll();
    releaseTrap?.();
    releaseTrap = null;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  }

  async function go(delta) {
    const list = getPhotos();
    const next = index + delta;
    if (busy || !list[next]) { snapBack(); return; }
    busy = true;
    const dir = Math.sign(delta);
    if (!reduced) {
      img.style.transition = "transform 220ms ease-in, opacity 220ms ease-in";
      img.style.transform = `translateX(${-dir * 60}px)`;
      img.style.opacity = "0";
      await wait(220);
    }
    index = next;
    const p = photo();
    fillCaption(p);
    showImage(p);
    fit(p);
    if (!reduced) {
      img.style.transition = "none";
      img.style.transform = `translateX(${dir * 60}px)`;
      img.getBoundingClientRect();
      img.style.transition = "transform 380ms cubic-bezier(0.22,1,0.36,1), opacity 380ms";
    }
    img.style.transform = "none";
    img.style.opacity = "1";
    busy = false;
  }

  function snapBack() {
    img.style.transition = "transform 300ms cubic-bezier(0.22,1,0.36,1), opacity 300ms";
    img.style.transform = "none";
    img.style.opacity = "1";
  }

  // --- pointer / swipe ------------------------------------------------------
  let start = null;
  box.addEventListener("pointerdown", (e) => {
    if (!isOpen || e.target.closest("button") || e.button > 0) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null };
  });
  box.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.axis && Math.hypot(dx, dy) > 8) start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (start.axis === "x") {
      img.style.transition = "none";
      img.style.transform = `translateX(${dx}px)`;
    } else if (start.axis === "y" && dy > 0) {
      img.style.transition = "none";
      img.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy / 1600, 0.12)})`;
      img.style.opacity = String(1 - Math.min(dy / 500, 0.5));
    }
  });
  const endSwipe = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const fast = performance.now() - start.t < 260;
    const axis = start.axis;
    start = null;
    if (axis === "x" && (Math.abs(dx) > 70 || (fast && Math.abs(dx) > 30))) go(dx < 0 ? 1 : -1);
    else if (axis === "y" && (dy > 120 || (fast && dy > 50))) close();
    else if (axis) snapBack();
    else if (e.target === img) { /* tap on image: do nothing */ }
    else if (e.type === "pointerup" && (e.target === box || e.target.closest("[data-lb-close]") || e.target === stage)) close();
  };
  box.addEventListener("pointerup", endSwipe);
  box.addEventListener("pointercancel", () => { start = null; snapBack(); });

  $$("[data-lb-close]", box).forEach((n) => n.addEventListener("click", (e) => { e.stopPropagation(); close(); }));
  prevBtn.addEventListener("click", () => go(-1));
  nextBtn.addEventListener("click", () => go(1));
  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
  });
  window.addEventListener("resize", () => isOpen && fit(), { passive: true });

  return { open, close };
}

function $$(sel, root) { return Array.from(root.querySelectorAll(sel)); }
