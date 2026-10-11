// ── shared/thinkingLevel.js ───────────────────────────────────
// Thinking-level helpers, including the translation of settings saved before
// Gemini's "Auto" mode picker (October 2026), which replaced the
// Flash-Lite / Flash / Pro model choice with Low / Medium / High thinking.
// ES module — esbuild inlines each import into its respective bundle.

import { THINKING_LEVELS, DEFAULT_THINKING_LEVEL, LEGACY_MODEL_TO_LEVEL } from "./constants.js";

/**
 * Resolves a stored thinking level, translating the pre-Auto settings
 * (a model id plus "standard"/"extended") to the closest level.
 * @param {string} [level]        stored `askGeminiThinkingLevel`
 * @param {string} [legacyModel]  stored `askGeminiModel`, if any
 * @returns {"low"|"medium"|"high"}
 */
export function resolveThinkingLevel(level, legacyModel) {
  if (THINKING_LEVELS.includes(level)) return level;
  if (level === "extended") return "high";
  return LEGACY_MODEL_TO_LEVEL[legacyModel] || DEFAULT_THINKING_LEVEL;
}

/**
 * Converts stored templates to per-level groups. Accepts the per-level shape,
 * the pre-Auto per-model shape (`flash-lite` / `flash` / `pro`, plus the older
 * `thinking` group) and the original flat array, which belonged to Flash.
 * Groups with nothing stored are left out so callers can seed defaults.
 * @param {string[]|Record<string, string[]>|undefined} stored
 * @returns {Partial<Record<"low"|"medium"|"high", string[]>>}
 */
export function migrateTemplateGroups(stored) {
  if (!stored) return {};
  if (Array.isArray(stored)) return { medium: stored };
  const groups = {
    low:    stored.low    ?? stored["flash-lite"] ?? stored.thinking,
    medium: stored.medium ?? stored.flash,
    high:   stored.high   ?? stored.pro,
  };
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => Array.isArray(v)));
}
