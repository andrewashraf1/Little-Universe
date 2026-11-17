// =============================================================================
//  API client for the Google Apps Script Web App.
//
//  Transport (chosen for Apps Script's quirks — see google-apps-script/README.md):
//   • Every call is a POST to the /exec URL with Content-Type text/plain and a
//     JSON body. That is a CORS "simple request": no preflight (Apps Script
//     cannot answer OPTIONS), and the 302 redirect to googleusercontent.com
//     that Apps Script always issues is followed by fetch automatically.
//   • No custom headers, no cookies. Session tokens travel inside the body.
//   • Responses are JSON: { ok: true, data } or { ok: false, error: { code, message } }.
//   • Apps Script can only return text, so media comes back as base64 inside
//     JSON and is turned into Blob URLs in the browser (see media.js).
//
//  The DemoApi below implements the same contract with local sample data so the
//  interface can be explored before the Google backend is set up. It is only
//  used when no config.js is present or ?demo is in the URL, and it says so on
//  screen.
// =============================================================================

export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.code = code;
    Object.assign(this, extra);
  }
}

const REQUEST_TIMEOUT_MS = 45_000;

// Real deployments live on script.google.com. localhost/127.0.0.1 is accepted only so the
// local Apps Script emulator (tests/emulator) can be used during development.
const API_URL_RE = /^(https:\/\/script\.google\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

export function readConfig() {
  const cfg = window.OLU_CONFIG || {};
  const apiUrl = typeof cfg.apiUrl === "string" ? cfg.apiUrl.trim() : "";
  return { apiUrl, configured: API_URL_RE.test(apiUrl) };
}

export class AppsScriptApi {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.isDemo = false;
  }

  async call(action, params = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...params }),
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiError(err?.name === "AbortError" ? "timeout" : "network", "Could not reach the server.");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new ApiError("network", `Server responded ${res.status}`);

    let payload;
    try {
      payload = await res.json();
    } catch {
      // Apps Script returns an HTML page when the deployment is wrong or not public.
      throw new ApiError("bad_response", "The server sent an unexpected response.");
    }
    if (!payload || payload.ok !== true) {
      const e = payload?.error || {};
      throw new ApiError(e.code || "server_error", e.message || "Something went wrong.", { retryAfter: e.retryAfter });
    }
    return payload.data;
  }

  // ---- public / visitor -----------------------------------------------------
  getPublicConfig() { return this.call("public.config"); }
  /**
   * The ONE login for everybody. Only the password is sent; the SERVER checks it against both stored
   * credentials and answers { role: "visitor" | "admin", token, expiresAt, visitor? }. The browser never
   * chooses a role and never compares passwords.
   */
  login(password, deviceId) { return this.call("auth.login", { password, deviceId }); }
  checkSession(token) { return this.call("visitor.session", { token }); }
  getContent(token) { return this.call("visitor.content", { token }); }
  /** ids: photo ids or "hero"; size: "thumb" | "display" → { items: { [id]: { mime, data } } } */
  getMedia(token, ids, size) { return this.call("visitor.media", { token, ids, size }); }
  /** chunked so large audio never exceeds Apps Script response limits */
  getAudioChunk(token, index) { return this.call("visitor.audio", { token, index }); }

  // ---- admin (session from login(); every call re-verified on the server) --
  ping() { return this.call("diag.ping"); }
  adminSession(token) { return this.call("admin.session", { token }); }
  adminLogout(token) { return this.call("admin.logout", { token }); }
  adminLogoutAll(token) { return this.call("admin.logoutAll", { token }); }
  adminEndVisitorSessions(token) { return this.call("admin.endVisitorSessions", { token }); }
  adminLogs(token, limit = 50) { return this.call("admin.logs", { token, limit }); }
  adminContent(token) { return this.call("admin.content", { token }); }
  adminUpdateSettings(token, settings) { return this.call("admin.updateSettings", { token, settings }); }
  adminUpdateLetter(token, letter) { return this.call("admin.updateLetter", { token, letter }); }
  adminSaveMessage(token, { id, message, active }) { return this.call("admin.saveMessage", { token, id, message, active }); }
  adminDeleteMessage(token, id) { return this.call("admin.deleteMessage", { token, id }); }
  adminUpdatePhoto(token, id, photo) { return this.call("admin.updatePhoto", { token, id, photo }); }
  adminUpdateMusic(token, music) { return this.call("admin.updateMusic", { token, music }); }
  adminChangeVisitorPassword(token, newPassword) { return this.call("admin.changeVisitorPassword", { token, newPassword }); }
  adminChangeAdminPassword(token, currentPassword, newPassword) {
    return this.call("admin.changeAdminPassword", { token, currentPassword, newPassword });
  }
}

export async function createApi({ forceDemo = false } = {}) {
  const { apiUrl, configured } = readConfig();
  if (!forceDemo && configured) return new AppsScriptApi(apiUrl);
  if (forceDemo) {
    const { DemoApi } = await import("./demo-data.js");
    return new DemoApi();
  }
  return null; // not configured, demo not requested
}
