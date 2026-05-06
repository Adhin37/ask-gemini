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
