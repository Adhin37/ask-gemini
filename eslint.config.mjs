// ESLint flat config (v9+) for Ask Gemini Chrome Extension
import globals from "globals";
import noSmartQuotes from "eslint-plugin-no-smart-quotes";
import pluginJsonc from "eslint-plugin-jsonc";

const chromeGlobal = { chrome: "readonly" };

export default [
  // ── Global ignores ──────────────────────────────────────────────
  {
    ignores: ["*.zip", "*.sh", "build.mjs", "src/**/*.min.js"],
  },

  // ── All JS source files ─────────────────────────────────────────
  // sourceType:"module" because every src file uses ES-module import/export.
  // Constants (GEMINI_URL, etc.) are imported — not globals — so no stubs needed.
  {
    files: ["src/**/*.js"],
    plugins: { "no-smart-quotes": noSmartQuotes },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  "module",
      globals: {
        ...globals.browser,
        ...chromeGlobal,
      },
    },
    rules: {
      // ── Hard errors (must fix) ──────────────────────────────────
      "no-eval":          "error",
      "no-implied-eval":  "error",
      "no-var":           "error",
      "no-undef":         "error",
      "no-unused-vars":   ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "eqeqeq":           ["error", "always", { null: "ignore" }],

      // ── Style / hygiene (warnings) ──────────────────────────────
      "prefer-const":   "warn",
      "semi":           ["warn", "always"],
      // Double quotes are the majority style (background.js, options.js, content.js).
      // popup.js uses single quotes and will show warnings — fix gradually.
      "quotes":         ["warn", "double", { avoidEscape: true }],
      // Allow all console.* except console.log (too noisy in prod).
      "no-console":     ["warn", { allow: ["warn", "error", "info", "debug"] }],
      // Forbid Unicode smart/curly quotes in string literals.
      "no-smart-quotes/no-smart-quotes": "error",
    },
  },

  // ── Locale JSON files ──────────────────────────────────────────
  // Uses eslint-plugin-jsonc for structural JSON validation.
  // eslint-plugin-no-smart-quotes targets JS Literal nodes and does not reach
  // JSONLiteral nodes — smart quotes in locale strings are caught by the
  // jsonc/recommended-with-json preset's strict structural rules.
  ...pluginJsonc.configs["flat/recommended-with-json"].map(config => ({
    ...config,
    files: ["_locales/**/*.json"],
  })),
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
];
