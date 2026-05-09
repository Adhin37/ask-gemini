// ── shared/promptEngine.js ────────────────────────────────────────
// Advanced prompt-engineering engine: score-based context detection,
// multi-variable template expansion, and optional role prefix.
// Pure functions — no Chrome APIs, no DOM.

// ══════════════════════════════════════════════════════════════════
// INTERNAL — signals per rule id (not stored, not user-editable)
// ══════════════════════════════════════════════════════════════════

// Known code-hosting / developer pages
const _CODE_URL_RE = [
  /github\.com/, /gitlab\.com/, /bitbucket\.org/,
  /stackoverflow\.com/, /stackexchange\.com/,
  /codepen\.io/, /jsfiddle\.net/, /replit\.com/,
  /codesandbox\.io/, /npmjs\.com/, /pkg\.go\.dev/,
  /developer\.mozilla\.org/,
];

// Patterns that suggest the text is source code
const _CODE_TEXT_RE = [
  /^\s*(function[\s(]|class\s|def\s|import\s|const\s|let\s|var\s|if\s*\(|for\s*\(|while\s*\(|#include\s|public\s|private\s|<\?php|\bfn\b)/,
  /=>[\s{(]/,
  /[{};]\s*\n.*[{};]/s,
  /\b(return|typeof|instanceof|async|await|yield)\b/,
];

/**
 * @typedef {Object} RuleSignals
 * @property {RegExp[]} [text]          regexes tested against trimmed selection
 * @property {RegExp[]} [url]           regexes tested against page URL
 * @property {[number, number]} [lengthRange]  [minChars, maxChars] inclusive bias
 * @property {number} priority          tie-breaker (higher wins)
 * @property {boolean} [langBonus]      if true, +25 when detected lang ≠ ui lang ≥ 70%
 */

/** @type {Record<string, RuleSignals>} */
const _SIGNALS = {
  url: {
    text: [/^https?:\/\/\S+\s*$/],
    lengthRange: [10, 2048],
    priority: 90,
  },
  error: {
    text: [
      /\b\w*(Error|Exception|Fault|Panic)\b[\s\S]*?[:\n]/,
      /^\s*at\s+[^\s(]+\s*\(/m,
      /\bTraceback\b/i,
      /\b(segfault|fatal error|uncaught exception|unhandled rejection)\b/i,
      /line\s+\d+.*col(umn)?\s+\d+/i,
    ],
    lengthRange: [20, 8000],
    priority: 80,
  },
  diff: {
    text: [
      /^@@\s+-\d+,\d+\s+\+\d+,\d+\s+@@/m,
      /^[+-]{3}\s+[ab]\//m,
    ],
    url: [
      /github\.com.*\/(commit|pull)\//,
      /gitlab\.com/,
    ],
    lengthRange: [40, 8000],
    priority: 75,
  },
  log: {
    text: [
      /^\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/m,
      /\b(INFO|WARN|WARNING|DEBUG|TRACE|ERROR|FATAL)\b/m,
      /^\d{2}:\d{2}:\d{2}[.,]\d{3}/m,
    ],
    lengthRange: [80, 16000],
    priority: 72,
  },
  json: {
    text: [
      /^\s*[\[{]/,
      /[}\]]\s*$/,
      /^\s*"[\w\s-]+"\s*:/m,
    ],
    url: [
      /\/api\//,
      /\.json(\?|$)/i,
    ],
    lengthRange: [10, 8000],
    priority: 70,
  },
  sql: {
    text: [
      /\b(SELECT|INSERT\s+INTO|DELETE\s+FROM|CREATE\s+TABLE|CREATE\s+INDEX)\b/i,
      /\b(JOIN|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|UNION\b)\b/i,
      /\b(SET\s+\w+\s*=|VALUES\s*\(|RETURNING\b|LIMIT\s+\d)\b/i,
    ],
    lengthRange: [15, 4000],
    priority: 70,
  },
  regex: {
    text: [
      /^\/[^\n]*\/[gimsuy]{0,6}$/,
      /(?:\\[bBdDwWsS]|\(\?[:=!<]|\[\^).{0,100}(?:\\[bBdDwWsS]|\(\?[:=!<]|\[\^)/,
    ],
    lengthRange: [5, 200],
    priority: 65,
  },
  code: {
    text: _CODE_TEXT_RE,
    url:  _CODE_URL_RE,
    lengthRange: [10, 8000],
    priority: 60,
  },
  markdown: {
    text: [
      /^#{1,6}\s+\w/m,
      /^\s*[-*+]\s+\S/m,
      /^```\w*$/m,
      /\[[^\]]{1,100}\]\([^)]{1,300}\)/,
    ],
    lengthRange: [40, 100000],
    priority: 58,
  },
  translate: {
    langBonus: true,
    lengthRange: [10, 100000],
    priority: 55,
  },
  question: {
    text: [/\?\s*$/],
    lengthRange: [5, 600],
    priority: 55,
  },
  data: {
    text: [
      /^[\d\s.,;:\-+%$€£¥|/\n\t]+$/,
      /(\n[^\n]*\t[^\n]*){2}/,
    ],
    lengthRange: [15, 4000],
    priority: 50,
  },
  term: {
    lengthRange: [1, 30],
    priority: 40,
  },
  article: {
    text: [/[.!?]\s+[A-Z]/],
    url: [
      /wikipedia\.org/,
      /medium\.com/,
      /substack\.com/,
    ],
    lengthRange: [200, 100000],
    priority: 30,
  },
  default: {
    priority: 0,
  },
};

// Internal cap constants for scoring contributions
const _TEXT_CAP = 20;
const _URL_CAP  = 12;
const _LANG_BONUS = 25;

/**
 * Computes the 2-letter ISO language prefix from a BCP 47 tag.
 * @param {string} tag   e.g. "en-US", "fr", "zh-TW"
 * @returns {string}
 */
function _langPrefix(tag) {
  return (tag || "").toLowerCase().split(/[-_]/)[0];
}

/**
 * Returns the `{length}` bucket string for the selection.
 * @param {string} text
 * @returns {"short"|"medium"|"long"}
 */
function _lengthBucket(text) {
  const len = text.length;
  if (len < 30)  return "short";
  if (len < 600) return "medium";
  return "long";
}

/**
 * Counts how many regex matches fire against `text`, capped at `cap / 10`.
 * @param {RegExp[]} patterns
 * @param {string}   text
 * @param {number}   cap  — maximum total score contribution
 * @returns {number}
 */
function _matchScore(patterns, text, cap) {
  if (!patterns || !patterns.length) return 0;
  let hits = 0;
  for (const re of patterns) {
    // Clone with g-flag removed to avoid stateful lastIndex issues
    const safe = new RegExp(re.source, re.flags.replace("g", ""));
    if (safe.test(text)) hits++;
  }
  return Math.min(hits * 10, cap);
}

// ══════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PEContextInput
 * @property {string} selection
 * @property {string} [pageUrl]
 * @property {string} [pageTitle]
 * @property {string} [uiLang]
 * @property {{ language: string, percentage: number }[]} [detectedLangs]
 *
 * @typedef {Object} PERule
 * @property {string} id
 * @property {string} labelKey
 * @property {string} hintKey
 * @property {string} templateKey
 * @property {boolean} enabled
 * @property {string} template
 * @property {number} [priority]
 *
 * @typedef {Object} PESettings
 * @property {boolean} enabled
 * @property {{ enabled: boolean, text: string }} [role]
 * @property {PERule[]} rules
 */

/**
 * Scores every rule against the input, returning all rule IDs sorted by score
 * descending. Does NOT filter by `enabled` — caller decides.
 * @param {PEContextInput} input
 * @param {PERule[]} rules
 * @returns {{ id: string, score: number }[]}
 */
export function scoreContext(input, rules) {
  // Cap the text passed to regex at 8 KB to prevent catastrophic backtracking
  const text = (input.selection || "").trim().slice(0, 8192);
  const url  = input.pageUrl || "";

  // Detect language mismatch for translate rule
  const uiPrefix = _langPrefix(input.uiLang || "en");
  let hasLangBonus = false;
  if (Array.isArray(input.detectedLangs) && input.detectedLangs.length > 0) {
    const top = input.detectedLangs[0];
    if (top && top.percentage >= 70 && _langPrefix(top.language) !== uiPrefix) {
      hasLangBonus = true;
    }
  }

  const scored = rules.map(rule => {
    const signals = _SIGNALS[rule.id] || { priority: 0 };
    let score = 0;

    score += _matchScore(signals.text, text, _TEXT_CAP);
    score += _matchScore(signals.url,  url,  _URL_CAP);

    if (signals.lengthRange) {
      const [min, max] = signals.lengthRange;
      if (text.length >= min && text.length <= max) score += 4;
    }

    if (signals.langBonus && hasLangBonus) score += _LANG_BONUS;

    return { id: rule.id, score, priority: signals.priority ?? 0 };
  });

  // Sort: score desc, then priority desc as tie-breaker
  scored.sort((a, b) => b.score - a.score || b.priority - a.priority);

  return scored.map(({ id, score }) => ({ id, score }));
}

/**
 * Returns the winning *enabled* rule id. Uses a two-phase approach:
 * Phase 1 — a rule must have a real text/url/lang signal hit (score > 4,
 *   since +4 comes from length alone). Ties broken by priority.
 * Phase 2 — length bucket fallback: term (≤30 chars), otherwise article,
 *   otherwise default.
 * @param {PEContextInput} input
 * @param {PERule[]} rules
 * @returns {string}
 */
export function detectContext(input, rules) {
  const enabledIds = new Set(rules.filter(r => r.enabled !== false).map(r => r.id));
  const sorted = scoreContext(input, rules);

  // Phase 1: winner must have a real text/url/language signal (score > 4 means
  // more than just the length bonus fired).
  const winner = sorted.find(s => s.score > 4 && enabledIds.has(s.id));
  if (winner) return winner.id;

  // Phase 2: length-bucket fallback
  const text = (input.selection || "").trim();
  if (text.length <= 30 && enabledIds.has("term"))    return "term";
  if (enabledIds.has("article"))                      return "article";
  if (enabledIds.has("default"))                      return "default";

  // Last resort: highest-priority enabled rule
  const fallback = rules
    .filter(r => r.enabled !== false)
    .sort((a, b) => ((_SIGNALS[b.id]?.priority ?? 0) - (_SIGNALS[a.id]?.priority ?? 0)));
  return fallback[0]?.id ?? "default";
}

/**
 * Substitutes `{name}` placeholders in a template.
 * Unknown variable names are left as-is (so users notice typos).
 * @param {string}              template
 * @param {Record<string,string>} vars
 * @returns {string}
 */
export function expandVariables(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? (vars[name] ?? "") : match;
  });
}

/**
 * Top-level entry point used by background.js.
 * Picks the matching rule, expands all variables, optionally prepends the
 * global role prefix. Does NOT apply the untrusted-content wrapper — that is
 * the caller's responsibility.
 * @param {PEContextInput} input
 * @param {PESettings}     settings
 * @returns {string}
 */
export function buildPrompt(input, settings) {
  const rules     = (settings && settings.rules) ? settings.rules : [];
  const selection = (input.selection || "").trim();

  const contextId = detectContext(input, rules);
  const rule = rules.find(r => r.id === contextId) || rules.find(r => r.id === "default");

  const template = rule ? rule.template : "{selection}";

  // Build the variable map
  let domain = "";
  try { domain = new URL(input.pageUrl || "").hostname; } catch (_) { /* ok */ }

  const vars = {
    selection: selection,
    url:       input.pageUrl  || "",
    domain:    domain,
    title:     input.pageTitle || "",
    lang:      input.uiLang   || "en",
    length:    _lengthBucket(selection),
  };

  let message = expandVariables(template, vars);

  // Prepend role prefix when enabled and non-empty
  const role = settings && settings.role;
  if (role && role.enabled && role.text && role.text.trim()) {
    message = role.text.trim() + "\n\n" + message;
  }

  return message;
}

if (typeof globalThis !== "undefined" && globalThis.__TEST__) {
  Object.assign(globalThis.__TEST__, {
    _scoreContext:   scoreContext,
    _detectContext:  detectContext,
    _expandVars:     expandVariables,
    _buildPrompt:    buildPrompt,
    _lengthBucket,
    _langPrefix,
  });
}
