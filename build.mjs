#!/usr/bin/env node
/**
 * build.mjs — esbuild bundler for Ask Gemini Chrome Extension
 *
 * Usage:
 *   node build.mjs           → minified production build → src/**\/*.min.{js,css}
 *   node build.mjs --dev     → unminified dev build with inline source maps
 *
 * What it does:
 *   1. Bundles each JS entry point (constants.js inlined into every consumer)
 *   2. Minifies each CSS file
 *   Output is placed next to each source file as *.min.js / *.min.css.
 *   These generated files are gitignored; the originals are kept for CWS review.
 */

import * as esbuild from "esbuild";

const dev = process.argv.includes("--dev");

console.log(`Building Ask Gemini  [${dev ? "dev" : "production"}]\n`);

// ── JS bundles ──────────────────────────────────────────────────────
// esbuild resolves the ES-module imports and outputs a self-contained IIFE
// per entry point — no runtime overhead, no loader injected.
await esbuild.build({
  entryPoints: [
    { in: "src/background/background.js", out: "src/background/background.min" },
    { in: "src/content/content.js",       out: "src/content/content.min"       },
    { in: "src/popup/popup.js",           out: "src/popup/popup.min"           },
    { in: "src/options/options.js",       out: "src/options/options.min"       },
    { in: "src/welcome/welcome.js",       out: "src/welcome/welcome.min"       },
  ],
  bundle:    true,
  minify:    !dev,
  sourcemap: dev ? "inline" : false,
  outdir:    ".",
  format:    "iife",
  platform:  "browser",
  target:    ["chrome120"],
  logLevel:  "info",
});

// ── CSS bundles ─────────────────────────────────────────────────────
await esbuild.build({
  entryPoints: [
    { in: "src/popup/popup.css",     out: "src/popup/popup.min"     },
    { in: "src/options/options.css", out: "src/options/options.min" },
    { in: "src/welcome/welcome.css", out: "src/welcome/welcome.min" },
  ],
  bundle:   true,
  minify:   !dev,
  outdir:   ".",
  logLevel: "info",
});

console.log("\nDone.");
