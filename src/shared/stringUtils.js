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
 * Retrieves a localized string from chrome.i18n and substitutes {{name}} placeholders.
 * Falls back to the raw key if chrome.i18n is unavailable (e.g. in tests).
 * @param {string}                    key  Message key from _locales/<lang>/messages.json.
 * @param {Record<string,string|number>} [vars] Named substitutions for {{name}} tokens.
 * @returns {string}
 */
export function t(key, vars) {
  if (typeof chrome === "undefined" || !chrome.i18n) return key;
  const msg = chrome.i18n.getMessage(key);
  if (!msg) return key;
  if (!vars) return msg;
  return msg.replace(/\{\{(\w+)\}\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name] ?? "") : m
  );
}

/**
 * Returns a localized plural form by picking between two message keys based on `n`.
 * chrome.i18n has no plural API, so callers supply separate singular/plural keys.
 * The count `n` is always available as {{count}} in the chosen message.
 * @param {number}                       n        The count that determines singular vs plural.
 * @param {string}                       oneKey   Message key for n === 1.
 * @param {string}                       otherKey Message key for n !== 1.
 * @param {Record<string,string|number>} [vars]   Additional named substitutions.
 * @returns {string}
 */
export function plural(n, oneKey, otherKey, vars) {
  return t(n === 1 ? oneKey : otherKey, { count: n, ...vars });
}

/**
 * Returns the localized display name for a canonical model id.
 * @param {"flash-lite"|"flash"|"pro"|string} canonicalId
 * @returns {string}
 */
export function localizeModelName(canonicalId) {
  switch (canonicalId) {
    case "flash-lite": return t("model_label_flash_lite");
    case "flash":      return t("model_label_flash");
    case "pro":        return t("model_label_pro");
    default:           return canonicalId || "";
  }
}

/**
 * Returns the localized display name for a canonical thinking level.
 * @param {"standard"|"extended"|string} level
 * @returns {string}
 */
export function localizeThinkingLevel(level) {
  switch (level) {
    case "standard": return t("thinking_level_standard");
    case "extended": return t("thinking_level_extended");
    default:         return level || "";
  }
}
