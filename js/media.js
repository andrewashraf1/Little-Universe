// =============================================================================
//  MediaLoader — turns "photo id + size" into a displayable Blob URL.
//
//  Private Drive files are never linked directly. The backend checks the
//  session, reads the (pre-compressed) file from Drive and returns it as
//  base64 JSON. This module:
//   • batches requests made in the same moment (one round-trip for a screenful
//     of thumbnails instead of one per image),
//   • keeps payloads small (max BATCH_SIZE images per request),
//   • caches results in memory for the session only — nothing private is
//     written to disk, and everything is released when the world is locked.
// =============================================================================

const BATCH_SIZE = { thumb: 8, display: 2 };
const BATCH_DELAY_MS = 40;

export function base64ToBlob(base64, mime) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export class MediaLoader {
  /** @param fetchBatch (ids: string[], size) => Promise<{ items: { [id]: { mime, data } } }> */
  constructor(fetchBatch) {
    this.fetchBatch = fetchBatch;
    this.cache = new Map();   // key → Promise<string | null>
    this.urls = new Set();
    this.queue = { thumb: new Map(), display: new Map() };
    this.timers = {};
  }

  key(id, size) {
    return `${size}:${id}`;
  }

  /** Resolves to an object URL, or null if the file is unavailable. */
  get(id, size = "thumb") {
    const k = this.key(id, size);
    if (this.cache.has(k)) return this.cache.get(k);
    const promise = new Promise((resolve, reject) => {
      this.queue[size].set(id, { resolve, reject });
      clearTimeout(this.timers[size]);
      this.timers[size] = setTimeout(() => this.flush(size), BATCH_DELAY_MS);
    });
    this.cache.set(k, promise);
    // If it failed, allow a later retry instead of caching the failure forever.
    promise.catch(() => this.cache.delete(k));
    return promise;
  }

  async flush(size) {
    const pending = Array.from(this.queue[size].entries());
    this.queue[size].clear();
    for (let i = 0; i < pending.length; i += BATCH_SIZE[size]) {
      const chunk = pending.slice(i, i + BATCH_SIZE[size]);
      this.runChunk(chunk, size); // chunks run in parallel
    }
  }

  async runChunk(chunk, size) {
    try {
      const result = await this.fetchBatch(chunk.map(([id]) => id), size);
      const items = result?.items || {};
      for (const [id, { resolve }] of chunk) {
        const item = items[id];
        if (!item || !item.data || !item.mime) { resolve(null); continue; }
        const url = URL.createObjectURL(base64ToBlob(item.data, item.mime));
        this.urls.add(url);
        resolve(url);
      }
    } catch (err) {
      for (const [, { reject }] of chunk) reject(err);
    }
  }

  /** Warm the cache without waiting (e.g. neighbours in the lightbox). */
  prefetch(id, size) {
    this.get(id, size).catch(() => {});
  }

  /** Forget everything and free memory (called on lock / session end). */
  dispose() {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.cache.clear();
    for (const size of Object.keys(this.queue)) {
      clearTimeout(this.timers[size]);
      this.queue[size].clear();
    }
  }
}
