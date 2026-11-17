/*
 * Our Little Universe — runtime configuration (public values only).
 *
 * 1. Copy this file to `config.js` (next to index.html).
 * 2. Paste the Web App URL of your Google Apps Script deployment
 *    (Deploy → Manage deployments → Web app URL, ends with /exec).
 *
 * This URL is not a secret: anyone can call it, and every private
 * endpoint behind it checks a visitor session (read-only) or an admin session
 * (editing), both obtained with passwords that are verified only on the server.
 * Never put passwords, hashes, tokens or folder IDs in this file.
 */
window.OLU_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/YOUR-DEPLOYMENT-ID/exec",
};
