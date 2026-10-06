#!/usr/bin/env node
/**
 * gemini-probe — inspect the live gemini.google.com DOM when selectors break.
 *
 * Copies e2e/.chrome-profile to a throwaway dir (so the real profile is never
 * mutated), opens Gemini, then runs a "steps" module you write ad hoc:
 *
 *   // my-steps.mjs
 *   export default async ({ page, snap, shot, log }) => {
 *     await page.getByRole("button", { name: /upload & tools/i }).click();
 *     await snap(".cdk-overlay-pane");          // ARIA snapshot → stdout
 *     await shot("menu");                        // PNG → e2e/output/probe/menu.png
 *   };
 *
 * Usage:
 *   node e2e/tools/gemini-probe.mjs my-steps.mjs [--ext] [--headed]
 *     --ext     load the built extension (run `npm run build` first)
 *     --headed  show the browser (e2e runs headed; some UI differs headless)
 *
 * Lines logged by content.js ("[Ask Gemini] …") are echoed with a [cs] prefix.
 */

import { chromium } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT  = path.join(ROOT, "e2e/output/probe");
const [stepsArg] = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!stepsArg) {
  console.error("Usage: node e2e/tools/gemini-probe.mjs <steps.mjs> [--ext] [--headed]");
  process.exit(1);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-probe-"));
const source  = process.env.CHROME_PROFILE || path.join(ROOT, "e2e/.chrome-profile");
if (fs.existsSync(source)) fs.cpSync(source, profile, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.includes("--ext")
  ? [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
  : [];
const context = await chromium.launchPersistentContext(profile, {
  headless: !process.argv.includes("--headed"),
  args,
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
page.on("console", m => { if (m.text().includes("[Ask Gemini]")) console.log("  [cs]", m.text()); });

const helpers = {
  context, page,
  log: (...a) => console.log("»", ...a),
  snap: async (selector = "body") => console.log(
    await page.locator(selector).first().ariaSnapshot().catch(e => `ERR ${e.message}`)
  ),
  shot: async (name) => {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log("» screenshot:", path.relative(ROOT, file));
  },
};

try {
  await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5_000);
  helpers.log("URL", page.url());
  const steps = await import(pathToFileURL(path.resolve(stepsArg)).href);
  await steps.default(helpers);
} catch (err) {
  console.error("STEP ERROR:", err.message.split("\n")[0]);
  await helpers.shot("error").catch(() => {});
  process.exitCode = 1;
} finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
