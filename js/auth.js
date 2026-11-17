// =============================================================================
//  Login + session handling (browser side).
//
//  ONE login for everybody: the password is sent to the backend, which checks it
//  against BOTH stored credentials and answers with the verified role. This file
//  never compares passwords and never picks a role — it only stores what the server
//  returned:
//   • visitor → signed, short-lived visitor token in localStorage (a second NFC tap
//     within the session window opens straight away; "Lock" removes it)
//   • admin   → admin session token in sessionStorage (this tab only) + a read-only
//     preview token for the site; the page then opens the editor (admin.html)
//  No token grants anything the server doesn't re-verify on every call.
// =============================================================================

import { ApiError } from "./api.js";
import { storage } from "./utils.js";

const SESSION_KEY = "olu.session";
const DEVICE_KEY = "olu.device";

export function getSession(scope = "live") {
  const s = storage.get(`${SESSION_KEY}.${scope}`);
  if (!s || typeof s.token !== "string" || !s.expiresAt) return null;
  if (new Date(s.expiresAt).getTime() - Date.now() < 30_000) {
    clearSession(scope);
    return null;
  }
  return s;
}

export function saveSession(token, expiresAt, scope = "live") {
  storage.set(`${SESSION_KEY}.${scope}`, { token, expiresAt });
}

export function clearSession(scope = "live") {
  storage.remove(`${SESSION_KEY}.${scope}`);
}

/**
 * A random per-browser id. Apps Script cannot see client IP addresses, so the
 * backend rate-limits failed attempts per device id AND globally (see
 * google-apps-script/Auth.gs). It is not a secret and not an identity.
 */
export function getDeviceId() {
  let id = storage.get(DEVICE_KEY);
  if (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    storage.set(DEVICE_KEY, id);
  }
  return id;
}

const ADMIN_KEY = "olu.admin";
const NOTICE_KEY = "olu.notice";

/** Admin session: sessionStorage (this tab only), never localStorage. */
export const adminSession = {
  get() {
    try {
      const s = JSON.parse(sessionStorage.getItem(ADMIN_KEY) || "null");
      return s && typeof s.token === "string" && typeof s.expiresAt === "string" ? s : null;
    } catch { return null; }
  },
  set(s) { try { sessionStorage.setItem(ADMIN_KEY, JSON.stringify({ token: s.token, expiresAt: s.expiresAt })); } catch { /* private mode */ } },
  clear() { try { sessionStorage.removeItem(ADMIN_KEY); } catch { /* ignore */ } },
};

/** A one-time message for the login page (e.g. "Your admin session ended"). */
export function setNotice(message) { try { sessionStorage.setItem(NOTICE_KEY, String(message)); } catch { /* ignore */ } }
export function takeNotice() {
  try { const m = sessionStorage.getItem(NOTICE_KEY); sessionStorage.removeItem(NOTICE_KEY); return m || ""; } catch { return ""; }
}

/**
 * The ONE login. Sends only the password; stores whatever role the SERVER verified.
 * Returns the server's answer ({ role, ... }).
 */
export async function login(api, password, scope = "live") {
  const result = await api.login(password, getDeviceId());
  if (result?.role === "admin") {
    adminSession.set(result);
    if (result.visitor) saveSession(result.visitor.token, result.visitor.expiresAt, scope);
    else clearSession(scope);
  } else if (result?.role === "visitor") {
    adminSession.clear();
    saveSession(result.token, result.expiresAt, scope);
  } else {
    throw new ApiError("bad_response", "The server sent an unexpected response.");
  }
  return result;
}
