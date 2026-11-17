// =============================================================================
//  Theme: colours + fonts chosen in the admin dashboard.
//  Everything is validated against a whitelist before it touches CSS, so a
//  stored value can never inject styles or load arbitrary URLs.
// =============================================================================

import { safeHex } from "./utils.js";

export const DEFAULT_COLORS = Object.freeze({
  burgundy: "#54263B",
  rose: "#C98F9F",
  pink: "#F5DDE3",
  cream: "#FFF8F2",
  warm: "#FFFCFA",
  gold: "#D6B779",
  ink: "#34252C",
});

export const COLOR_LABELS = {
  burgundy: "Deep burgundy",
  rose: "Dusty rose",
  pink: "Soft pink",
  cream: "Cream",
  warm: "Warm white",
  gold: "Muted gold",
  ink: "Dark text",
};

// name → Google Fonts css2 family spec + CSS fallback stack
export const FONT_OPTIONS = {
  heading: {
    "Cormorant Garamond": ["Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500", "Georgia, serif"],
    "Playfair Display": ["Playfair+Display:ital,wght@0,400;0,500;0,600;1,400", "Georgia, serif"],
    "EB Garamond": ["EB+Garamond:ital,wght@0,400;0,500;0,600;1,400", "Georgia, serif"],
    "Bodoni Moda": ["Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;1,6..96,400", "Didot, Georgia, serif"],
    "Gilda Display": ["Gilda+Display", "Georgia, serif"],
  },
  body: {
    "Manrope": ["Manrope:wght@400;500;600", "system-ui, sans-serif"],
    "Jost": ["Jost:wght@400;500;600", "system-ui, sans-serif"],
    "Inter": ["Inter:wght@400;500;600", "system-ui, sans-serif"],
    "DM Sans": ["DM+Sans:wght@400;500;600", "system-ui, sans-serif"],
    "Lato": ["Lato:wght@400;700", "system-ui, sans-serif"],
  },
  script: {
    "Pinyon Script": ["Pinyon+Script", "cursive"],
    "Great Vibes": ["Great+Vibes", "cursive"],
    "Parisienne": ["Parisienne", "cursive"],
    "Allura": ["Allura", "cursive"],
    "Mrs Saint Delafield": ["Mrs+Saint+Delafield", "cursive"],
  },
};

export const DEFAULT_FONTS = Object.freeze({
  heading: "Cormorant Garamond",
  body: "Manrope",
  script: "Pinyon Script",
});

// Already requested by index.html / admin.html
const PRELOADED = new Set(["Cormorant Garamond", "Manrope", "Pinyon Script"]);
const loaded = new Set(PRELOADED);

export function normalizeTheme(raw) {
  const colors = { ...DEFAULT_COLORS };
  const fonts = { ...DEFAULT_FONTS };
  const src = raw && typeof raw === "object" ? raw : {};
  for (const key of Object.keys(DEFAULT_COLORS)) colors[key] = safeHex(src.colors?.[key], DEFAULT_COLORS[key]);
  for (const role of Object.keys(DEFAULT_FONTS)) {
    const name = src.fonts?.[role];
    if (typeof name === "string" && Object.hasOwn(FONT_OPTIONS[role], name)) fonts[role] = name;
  }
  return { colors, fonts };
}

function ensureFont(name, spec) {
  if (loaded.has(name)) return;
  loaded.add(name);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.append(link);
}

export function applyTheme(raw, root = document.documentElement) {
  const theme = normalizeTheme(raw);
  for (const [key, value] of Object.entries(theme.colors)) root.style.setProperty(`--c-${key}`, value);
  for (const [role, name] of Object.entries(theme.fonts)) {
    const [spec, fallback] = FONT_OPTIONS[role][name];
    ensureFont(name, spec);
    root.style.setProperty(`--f-${role}`, `"${name}", ${fallback}`);
  }
  return theme;
}
