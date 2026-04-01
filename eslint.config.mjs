// ESLint flat config (v9+) for Ask Gemini Chrome Extension
import globals from "globals";

const chromeGlobal = { chrome: "readonly" };

export default [
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: ["*.zip", "*.sh"],
  },

  // ── All JS source files ─────────────────────────────────────────
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion:    2022,   // covers ?., ??, numeric separators, top-level await
      sourceType:     "script",
      globals: {
        ...globals.browser,   // window, document, MutationObserver, Event, …
        ...chromeGlobal,
      },
    },
    rules: {
      // ── Hard errors (must fix) ──────────────────────────────────
      "no-eval":          "error",
      "no-implied-eval":  "error",
      "no-var":           "error",
      "no-undef":         "error",
      "no-unused-vars":   ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "eqeqeq":           ["error", "always", { null: "ignore" }],

      // ── Security: flag unsafe patterns in Chrome extensions ─────
      // innerHTML is used with escapeHtml() here — warn rather than error.
      "no-restricted-properties": [
        "warn",
        {
          property: "innerHTML",
          message:  "Ensure value is sanitized via escapeHtml() before assigning to innerHTML. Never pass raw user input.",
        },
      ],

      // ── Style / hygiene (warnings) ──────────────────────────────
      "prefer-const":   "warn",
      "semi":           ["warn", "always"],
      // Double quotes are the majority style (background.js, options.js, content.js).
      // popup.js uses single quotes and will show warnings — fix gradually.
      "quotes":         ["warn", "double", { avoidEscape: true }],
      // Allow all console.* except console.log (too noisy in prod).
      "no-console":     ["warn", { allow: ["warn", "error", "info", "debug"] }],
    },
  },

  // ── Test files ─────────────────────────────────────────────────
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  "module",
      globals: {
        ...globals.node,
        // Vitest globals (globals:true in vitest.config.js)
        describe: "readonly",
        it:       "readonly",
        expect:   "readonly",
        vi:       "readonly",
        beforeAll:  "readonly",
        afterAll:   "readonly",
        beforeEach: "readonly",
        afterEach:  "readonly",
        // jsdom globals available in test files
        document: "readonly",
        window:   "readonly",
        chrome:   "readonly",
      },
    },
    rules: {
      "no-undef":       "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console":     "off",
    },
  },

  // ── Background service worker — no DOM ─────────────────────────
  // background.js runs as a MV3 Service Worker: no window / document.
  // We add serviceworker globals on top of the base browser config.
  {
    files: ["src/background/background.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...chromeGlobal,
      },
    },
  },
];
