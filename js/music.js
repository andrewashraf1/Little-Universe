// =============================================================================
//  Music toggle. Never autoplays: the track is only downloaded and started
//  after an explicit tap. The audio is fetched through the authenticated
//  backend in chunks (see api.getAudioChunk) and played from a Blob URL.
// =============================================================================

import { base64ToBlob } from "./media.js";

export function createMusic(button, titleNode) {
  const stateNode = button.querySelector(".music-state");
  let audio = null;
  let loader = null;         // () => Promise<string url>
  let loading = null;
  let volume = 0.5;
  let fadeRaf = 0;
  let url = null;

  function render(playing, label) {
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    stateNode.textContent = label ?? (playing ? "Now playing" : "Play our song");
    button.setAttribute("aria-label", playing ? "Pause music" : "Play music");
  }

  function fadeTo(target, ms = 1200) {
    cancelAnimationFrame(fadeRaf);
    const a = audio;
    if (!a) return Promise.resolve();
    const from = a.volume;
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        if (audio !== a) return resolve(); // stopped or replaced mid-fade
        const k = Math.min(1, (now - t0) / ms);
        a.volume = Math.min(1, Math.max(0, from + (target - from) * k)); // float steps can overshoot [0, 1]
        if (k < 1) fadeRaf = requestAnimationFrame(step); else resolve();
      };
      fadeRaf = requestAnimationFrame(step);
    });
  }

  // A 0.1 s silent WAV, played synchronously inside the tap so iOS Safari
  // "unlocks" this audio element before we await the network.
  function silentWav() {
    const n = 2205, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, str) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 22050, true); v.setUint32(28, 44100, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, "data"); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  function createElementInGesture() {
    const a = new Audio();
    a.loop = true;
    a.preload = "auto";
    a.src = silentWav();
    a.play().catch(() => {});
    return a;
  }

  async function ensureSource(a) {
    if (url) return;
    loading ??= (async () => {
      render(false, "Loading…");
      const silent = a.src;
      url = await loader();
      a.pause();
      a.src = url;
      URL.revokeObjectURL(silent);
    })();
    try {
      await loading;
    } finally {
      loading = null;
    }
  }

  async function toggle() {
    if (!loader) return;
    try {
      if (audio && !audio.paused && url) {
        await fadeTo(0, 500);
        audio.pause();
        render(false);
        return;
      }
      audio ??= createElementInGesture(); // must stay synchronous in the click
      await ensureSource(audio);
      audio.volume = 0;
      await audio.play();
      render(true);
      fadeTo(volume);
    } catch (err) {
      console.warn("music failed", err);
      render(false, "Couldn't play");
      setTimeout(() => render(false), 2400);
    }
  }

  button.addEventListener("click", toggle);

  return {
    /** music: { enabled, title, volume }, loadUrl: () => Promise<string> */
    configure(music, loadUrl) {
      if (!music?.enabled || !loadUrl) {
        button.hidden = true;
        return;
      }
      loader = loadUrl;
      volume = Math.min(1, Math.max(0, Number(music.volume) || 0.5));
      titleNode.textContent = music.title || "";
      button.hidden = false;
      render(false);
    },
    stop() {
      cancelAnimationFrame(fadeRaf);
      if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
      if (url) URL.revokeObjectURL(url);
      audio = null;
      url = null;
      loader = null;
      button.hidden = true;
      render(false);
    },
  };
}

/** Assemble a chunked base64 track into one Blob URL. */
export async function loadChunkedAudio(fetchChunk) {
  const first = await fetchChunk(0);
  const parts = [base64ToBlob(first.data, first.mime)];
  for (let i = 1; i < first.chunks; i++) {
    const next = await fetchChunk(i);
    parts.push(base64ToBlob(next.data, first.mime));
  }
  return URL.createObjectURL(new Blob(parts, { type: first.mime }));
}
