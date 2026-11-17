// =============================================================================
//  Ambient effects: particle sky, cursor glow, sparkle bursts, scroll reveal.
//  All of them are cheap, pause when the tab is hidden, and fall back to a
//  static (or no) effect under prefers-reduced-motion.
// =============================================================================

import { isFinePointer, prefersReducedMotion } from "./utils.js";

// -----------------------------------------------------------------------------
// Sky — soft glowing motes drifting upward, a rare shooting star at night
// -----------------------------------------------------------------------------
export function createSky(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = prefersReducedMotion();
  let mode = "night";
  let w = 0, h = 0, dpr = 1;
  let particles = [];
  let raf = 0;
  let last = 0;
  let shooting = null;
  let nextShootAt = performance.now() + 6000;

  const palettes = {
    night: [[255, 248, 242], [214, 183, 121], [245, 221, 227]],
    day: [[214, 183, 121], [201, 143, 159], [214, 183, 121]],
  };

  // pre-rendered glow sprite (much cheaper than shadowBlur per particle)
  const sprites = {};
  function sprite(rgb) {
    const key = rgb.join(",");
    if (sprites[key]) return sprites[key];
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${key},1)`);
    grad.addColorStop(0.18, `rgba(${key},0.85)`);
    grad.addColorStop(0.45, `rgba(${key},0.18)`);
    grad.addColorStop(1, `rgba(${key},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return (sprites[key] = s);
  }

  function spawn(randomY = true) {
    const pal = palettes[mode];
    const rgb = pal[Math.floor(Math.random() * pal.length)];
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h + 20,
      r: mode === "night" ? 1.5 + Math.random() * 3.5 : 2 + Math.random() * 4,
      vy: -(0.05 + Math.random() * 0.22),
      vx: (Math.random() - 0.5) * 0.08,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
      alpha: mode === "night" ? 0.35 + Math.random() * 0.55 : 0.12 + Math.random() * 0.22,
      img: sprite(rgb),
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(mode === "night" ? 70 : 26, (w * h) / (mode === "night" ? 13000 : 32000)));
    while (particles.length < target) particles.push(spawn(true));
    particles.length = target;
    if (reduced) draw(0);
  }

  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    for (const p of particles) {
      if (!reduced) {
        p.y += p.vy * dt * 0.06;
        p.x += p.vx * dt * 0.06 + Math.sin(t * 0.3 + p.phase) * 0.05;
        if (p.y < -20) Object.assign(p, spawn(false));
      }
      const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(t * p.speed + p.phase);
      ctx.globalAlpha = p.alpha * tw;
      const size = p.r * 6;
      ctx.drawImage(p.img, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    if (!reduced && mode === "night") drawShootingStar();
  }

  function drawShootingStar() {
    const now = performance.now();
    if (!shooting && now > nextShootAt) {
      shooting = { x: w * (0.2 + Math.random() * 0.6), y: h * (0.05 + Math.random() * 0.3), life: 0 };
      nextShootAt = now + 9000 + Math.random() * 12000;
    }
    if (!shooting) return;
    shooting.life += 1;
    const progress = shooting.life / 55;
    const len = 120;
    const x = shooting.x + progress * 260;
    const y = shooting.y + progress * 110;
    const grad = ctx.createLinearGradient(x, y, x - len, y - len * 0.42);
    const a = Math.sin(Math.min(progress, 1) * Math.PI);
    grad.addColorStop(0, `rgba(255,248,242,${0.85 * a})`);
    grad.addColorStop(1, "rgba(255,248,242,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len, y - len * 0.42);
    ctx.stroke();
    if (progress >= 1) shooting = null;
  }

  function loop(now) {
    const dt = Math.min(now - last, 50);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (reduced || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  resize();
  start();

  return {
    setMode(next) {
      if (next === mode) return;
      mode = next;
      particles = [];
      resize();
    },
    stop,
    start,
  };
}

// -----------------------------------------------------------------------------
// Cursor glow (desktop only)
// -----------------------------------------------------------------------------
export function createCursorGlow(node) {
  if (!node || !isFinePointer() || prefersReducedMotion()) return;
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0;
  const tick = () => {
    x += (tx - x) * 0.12;
    y += (ty - y) * 0.12;
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(tick) : 0;
  };
  window.addEventListener("pointermove", (e) => {
    tx = e.clientX;
    ty = e.clientY;
    node.classList.add("is-on");
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener("pointerleave", () => node.classList.remove("is-on"));
}

// -----------------------------------------------------------------------------
// Sparkle burst at a point
// -----------------------------------------------------------------------------
export function sparkle(x, y, count = 8) {
  if (prefersReducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 26 + Math.random() * 34;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    s.style.animationDelay = `${Math.random() * 80}ms`;
    if (Math.random() > 0.5) s.style.background = "#F5DDE3";
    document.body.append(s);
    s.addEventListener("animationend", () => s.remove(), { once: true });
  }
}

// -----------------------------------------------------------------------------
// Reveal on scroll
// -----------------------------------------------------------------------------
let revealObserver = null;
export function observeReveal(root = document) {
  const nodes = root.querySelectorAll("[data-reveal]:not(.is-visible)");
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
    nodes.forEach((n) => n.classList.add("is-visible"));
    return;
  }
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  nodes.forEach((n) => revealObserver.observe(n));
}
