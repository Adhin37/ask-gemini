#!/usr/bin/env node
/**
 * build.mjs — esbuild bundler for Ask Gemini Chrome Extension
 *
 * Usage:
 *   node build.mjs           → minified production build → dist/
 *   node build.mjs --dev     → unminified dev build with inline source maps
 *
 * What it does:
 *   1. Cleans dist/
 *   2. Bundles each JS entry point (constants.js inlined into every consumer)
 *   3. Minifies each CSS file
 *   4. Copies HTML files, stripping the now-redundant constants.js <script> tag
 */

import * as esbuild from "esbuild";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

const dev  = process.argv.includes("--dev");
const DIST = "dist";

// ── 1. Clean ────────────────────────────────────────────────────────
await rm(DIST, { recursive: true, force: true });
console.log(`Building Ask Gemini → ${DIST}/  [${dev ? "dev" : "production"}]\n`);

// ── 2. JS bundles ───────────────────────────────────────────────────
// esbuild resolves the ES-module imports and outputs a self-contained IIFE
// per entry point — no runtime overhead, no loader injected.
await esbuild.build({
  entryPoints: {
    "background/background": "src/background/background.js",
    "content/content":       "src/content/content.js",
    "popup/popup":           "src/popup/popup.js",
    "options/options":       "src/options/options.js",
    "welcome/welcome":       "src/welcome/welcome.js",
  },
  bundle:    true,
  minify:    !dev,
  sourcemap: dev ? "inline" : false,
  outdir:    DIST,
  format:    "iife",
  platform:  "browser",
  target:    ["chrome120"],
  logLevel:  "info",
});

// ── 3. CSS bundles ──────────────────────────────────────────────────
await esbuild.build({
  entryPoints: {
    "popup/popup":     "src/popup/popup.css",
    "options/options": "src/options/options.css",
    "welcome/welcome": "src/welcome/welcome.css",
  },
  bundle:   true,
  minify:   !dev,
  outdir:   DIST,
  logLevel: "info",
});

// ── 4. HTML files ───────────────────────────────────────────────────
// Copy HTML into dist/, removing the now-unnecessary constants.js <script> tag
// (constants are inlined into each JS bundle by esbuild).
// All other relative paths (popup.js, popup.css, etc.) remain valid because
// the HTML files land in the same subdirectory as their bundled assets.
const CONSTANTS_TAG_RE = /[ \t]*<script src="\.\.\/shared\/constants\.js"><\/script>\n?/g;

const HTML_FILES = [
  ["src/popup/popup.html",     `${DIST}/popup/popup.html`],
  ["src/options/options.html", `${DIST}/options/options.html`],
  ["src/welcome/welcome.html", `${DIST}/welcome/welcome.html`],
];

for (const [src, dst] of HTML_FILES) {
  const html = (await readFile(src, "utf8")).replace(CONSTANTS_TAG_RE, "");
  await mkdir(path.dirname(dst), { recursive: true });
  await writeFile(dst, html);
  console.log(`  copied  ${dst}`);
}

console.log(`\nDone.`);
