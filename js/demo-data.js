// =============================================================================
//  DEMO MODE — local sample data that implements the same API contract as
//  the Google Apps Script backend (see api.js). It exists so the design and
//  every interaction can be tried before the backend is configured.
//
//  • It is only loaded with ?demo (or from the "Explore the design demo" link).
//  • The UI shows a "Demo" ribbon while it is active.
//  • It contains NO real content: images are generated abstract artwork,
//    the music is a synthesized chord, the password is "demo".
// =============================================================================

import { ApiError } from "./api.js";

const DEMO_PASSWORD = "demo";
const latency = (min = 180, max = 520) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

const PHOTOS = [
  { title: "The first evening", caption: "When the city went quiet and it was just us and the lights.", date: "2023-02-14", location: "Old Town", w: 4, h: 5, pal: ["#54263B", "#C98F9F", "#F5DDE3"] },
  { title: "Sunday slowness", caption: "Coffee, a borrowed sweater, nowhere to be.", date: "2023-03-05", location: "", w: 3, h: 2, pal: ["#D6B779", "#F5DDE3", "#FFF8F2"] },
  { title: "Sea air", caption: "You said the waves sounded like applause.", date: "2023-06-18", location: "By the sea", w: 2, h: 3, pal: ["#2f4858", "#86A8B5", "#F5DDE3"] },
  { title: "Golden hour", caption: "", date: "2023-07-02", location: "The hill", w: 1, h: 1, pal: ["#D6B779", "#C98F9F", "#54263B"] },
  { title: "Rainy window", caption: "Counting raindrops instead of minutes.", date: "2023-09-21", location: "", w: 4, h: 5, pal: ["#34252C", "#7A2E45", "#C98F9F"] },
  { title: "Little picnic", caption: "Strawberries, a blanket, and your terrible jokes.", date: "2024-04-27", location: "The park", w: 3, h: 2, pal: ["#7c8b5a", "#F5DDE3", "#FFF8F2"] },
  { title: "Night walk", caption: "", date: "2024-05-10", location: "Along the river", w: 2, h: 3, pal: ["#1d0c14", "#54263B", "#D6B779"] },
  { title: "Our kitchen", caption: "The night we burned the pasta and danced anyway.", date: "2024-08-03", location: "Home", w: 4, h: 5, pal: ["#C98F9F", "#FFF8F2", "#D6B779"] },
  { title: "Snow day", caption: "Cold hands, warm everything else.", date: "2024-12-12", location: "", w: 3, h: 4, pal: ["#e9e4ef", "#C98F9F", "#54263B"] },
  { title: "Anniversary", caption: "Another year of choosing each other.", date: "2025-02-14", location: "Our place", w: 3, h: 2, pal: ["#54263B", "#D6B779", "#F5DDE3"] },
  { title: "", caption: "", date: "2025-05-30", location: "", w: 1, h: 1, pal: ["#F5DDE3", "#C98F9F", "#FFFCFA"] },
  { title: "Somewhere new", caption: "Getting lost on purpose.", date: "2025-08-09", location: "Far away", w: 2, h: 3, pal: ["#b5654a", "#D6B779", "#FFF8F2"] },
];

const CONTENT = {
  mode: "demo",
  settings: {
    siteTitle: "Our Little Universe",
    heroEyebrow: "Just the two of us",
    heroTitle: "Welcome to Our Little Universe",
    heroSubtitle: "A quiet corner of the internet where every photo is a heartbeat and every word is yours.",
    hasHeroImage: true,
    memoriesTitle: "Our Memories",
    memoriesSubtitle: "Little pieces of the days we never want to forget.",
    letterSectionTitle: "A Letter for You",
    letterPrompt: "There's something I want you to read...",
    togetherSince: "2023-02-14",
    footerText: "Made with all my love, only for you.",
  },
  theme: {},
  photos: PHOTOS.map((p, i) => ({
    id: `demo-${i + 1}`,
    title: p.title,
    caption: p.caption,
    date: p.date,
    location: p.location,
    width: p.w * 600,
    height: p.h * 600,
  })),
  letter: {
    title: "My love,",
    content: "I wanted to make you something that lives only between the two of us — a little universe where every memory has a home.\n\nThis is where I keep the moments I replay when I miss you: the quiet mornings, the long walks, the way you laugh before you finish a sentence.\n\nThank you for every ordinary day you made extraordinary.\nI can't wait to fill this place with many more.",
    signature: "Yours, always",
    date: "2025-02-14",
    envelope: { envelopeColor: "#E9C9CF", paperColor: "#FFF8F2", sealColor: "#7A2E45", sealIcon: "heart", animationStyle: "classic", background: "blush" },
  },
  surprises: [
    "You found the secret star. Just like I found you.",
    "Right now, somewhere, I am thinking about you.",
    "Every universe needs a center. Mine is you.",
  ],
  music: { enabled: true, title: "A little melody (demo)", volume: 0.4 },
};

// -----------------------------------------------------------------------------
// Generated artwork (stands in for private photos)
// -----------------------------------------------------------------------------
function seeded(seed) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

function paint(index, longEdge) {
  const spec = index === "hero"
    ? { w: 16, h: 10, pal: ["#1d0c14", "#54263B", "#C98F9F"] }
    : PHOTOS[index];
  const scale = longEdge / Math.max(spec.w, spec.h);
  const W = Math.round(spec.w * scale), H = Math.round(spec.h * scale);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const rand = seeded(typeof index === "number" ? index + 3 : 99);
  const [a, b, d] = spec.pal;

  const bg = g.createLinearGradient(0, 0, W * 0.3, H);
  bg.addColorStop(0, a); bg.addColorStop(0.6, b); bg.addColorStop(1, d);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  // soft bokeh
  for (let i = 0; i < 26; i++) {
    const x = rand() * W, y = rand() * H * 0.8, r = (0.03 + rand() * 0.12) * Math.max(W, H);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,248,242,${0.08 + rand() * 0.22})`);
    rg.addColorStop(1, "rgba(255,248,242,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // horizon hills
  g.fillStyle = "rgba(29,12,20,0.28)";
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += W / 12) g.lineTo(x, H * (0.72 + Math.sin(x / W * 5 + rand()) * 0.05));
  g.lineTo(W, H); g.fill();
  // two figures, very abstract
  g.fillStyle = "rgba(29,12,20,0.45)";
  const cx = W * (0.38 + rand() * 0.2), base = H * 0.78, s = Math.min(W, H) * 0.07;
  for (const off of [-0.7, 0.7]) {
    g.beginPath(); g.ellipse(cx + off * s, base - s * 2.6, s * 0.45, s * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + off * s, base - s * 1.1, s * 0.65, s * 1.2, 0, 0, Math.PI * 2); g.fill();
  }
  // grain + vignette
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(20,6,12,0.35)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // sample mark
  g.fillStyle = "rgba(255,248,242,0.55)";
  g.font = `${Math.round(Math.max(11, W * 0.028))}px sans-serif`;
  g.textAlign = "right";
  g.fillText("SAMPLE", W - W * 0.04, H - W * 0.04);

  let url = c.toDataURL("image/webp", 0.82);
  if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", 0.85);
  const [head, data] = url.split(",");
  return { mime: head.slice(5, head.indexOf(";")), data };
}

// -----------------------------------------------------------------------------
// Synthesized "song": a slow, soft chord progression as a WAV
// -----------------------------------------------------------------------------
let wavBase64 = null;
function synthWav() {
  if (wavBase64) return wavBase64;
  const rate = 22050, seconds = 16, n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  const chords = [[261.6, 329.6, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6], [196.0, 246.9, 293.7]];
  for (let i = 0; i < n; i++) {
    const t = i / rate, ci = Math.floor(t / 4) % 4, local = t % 4;
    const env = Math.min(1, local / 1.2) * Math.min(1, (4 - local) / 1.2);
    let s = 0;
    for (const f of chords[ci]) s += Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env * 0.12)) * 32767, true);
  }
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (wavBase64 = btoa(bin));
}

// -----------------------------------------------------------------------------
export class DemoApi {
  constructor() {
    this.isDemo = true;
    this.fails = 0;
  }

  async getPublicConfig() {
    await latency(60, 160);
    return { siteTitle: CONTENT.settings.siteTitle, gateTitle: "A Little World Just for Us", gateSubtitle: "Some memories are too special to be shared with everyone.", theme: {}, isVisible: true };
  }

  /** Demo of the ONE login: only the visitor role exists in demo mode (there is no demo admin). */
  async login(password) {
    await latency(400, 800);
    if (this.fails >= 6) throw new ApiError("too_many_attempts", "Too many attempts", { retryAfter: 900 });
    if (password !== DEMO_PASSWORD) {
      this.fails++;
      throw new ApiError("invalid_password", "Wrong password");
    }
    this.fails = 0;
    return { role: "visitor", token: `demo.${Date.now()}`, expiresAt: new Date(Date.now() + 2 * 3600_000).toISOString() };
  }

  async checkSession(token) {
    await latency(60, 120);
    return { valid: typeof token === "string" && token.startsWith("demo.") };
  }

  async getContent(token) {
    await latency(250, 600);
    if (!String(token).startsWith("demo.")) throw new ApiError("session_invalid", "Session expired");
    return structuredClone(CONTENT);
  }

  async getMedia(token, ids, size) {
    await latency(200, 700);
    const items = {};
    for (const id of ids) {
      const index = id === "hero" ? "hero" : Number(String(id).replace("demo-", "")) - 1;
      if (index !== "hero" && !PHOTOS[index]) continue;
      items[id] = paint(index, size === "display" ? (index === "hero" ? 1800 : 1500) : 640);
    }
    return { items };
  }

  async getAudioChunk(token, index) {
    await latency(150, 400);
    const all = synthWav();
    const size = Math.ceil(all.length / 2 / 4) * 4; // two chunks, base64-aligned
    return { mime: "audio/wav", chunks: 2, index, data: all.slice(index * size, (index + 1) * size) };
  }
}
