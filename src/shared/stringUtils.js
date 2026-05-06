// ── shared/stringUtils.js ─────────────────────────────────────
// Generic string helpers shared across background, popup, options, and content.
// ES module — esbuild inlines each import into its respective bundle.

/**
 * Returns `s` with its first character upper-cased.
 * @param {string} s
 * @returns {string}
 */
export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Retrieves a localized string from chrome.i18n.
 * Falls back to the raw key if chrome.i18n is unavailable (e.g. in tests).
 * @param {string}    key  Message key from _locales/<lang>/messages.json.
 * @param {...string} args Positional substitutions mapped to $1, $2, … placeholders.
 * @returns {string}
 */
export function t(key, ...args) {
  if (typeof chrome === "undefined" || !chrome.i18n) return key;
  const msg = chrome.i18n.getMessage(key, args.length ? args.map(String) : undefined);
  return msg || key;
}

/**
 * Returns a localized plural form by picking between two message keys based on `n`.
 * chrome.i18n has no plural API, so callers supply separate singular/plural keys.
 * The count `n` becomes the first substitution ($1) in whichever key is chosen.
 * @param {number}    n        The count that determines singular vs plural.
 * @param {string}    oneKey   Message key for n === 1.
 * @param {string}    otherKey Message key for n !== 1.
 * @param {...string} args     Additional substitutions ($2, $3, …).
 * @returns {string}
 */
export function plural(n, oneKey, otherKey, ...args) {
  return t(n === 1 ? oneKey : otherKey, String(n), ...args);
}

/**
 * Returns the localized display name for a canonical model id.
 * Single source of truth — replaces the five duplicate label maps that existed
 * across popup.html, options.html (×2), options.js (×2), and content.js.
 * @param {"flash"|"thinking"|"pro"|string} canonicalId
 * @returns {string}
 */
export function localizeModelName(canonicalId) {
  switch (canonicalId) {
    case "flash":    return t("model_label_flash");
    case "thinking": return t("model_label_thinking");
    case "pro":      return t("model_label_pro");
    default:         return canonicalId || "";
  }
}
