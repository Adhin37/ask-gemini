/**
 * Scenario 06 — Real Gemini (live page, no mock)
 *
 * Verifies that content.js selectors and model-switching logic work against
 * the live Gemini UI — catching DOM regressions that mocks cannot detect.
 *
 * These tests adapt to whatever models the current account can select:
 *   - Free accounts: only "Fast" is typically interactive.
 *   - AI Premium / Google One accounts: Fast + Thinking + Pro.
 *
 * Prerequisite: the e2e Chrome profile must be signed in to a Google account.
 *   Option A — point to your existing Chrome profile:
 *     CHROME_PROFILE="$HOME/.config/google-chrome/Default" npx playwright test ...
 *   Option B — sign in once interactively then re-run:
 *     npx playwright test --config=e2e/playwright.config.js e2e/scenarios/06-real-gemini.spec.js
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";

const GEMINI_URL = "https://gemini.google.com/app";

// Mirrors the selectors used by content.js — same selector = same regression.
// Primary model button selector (data-test-id is the most stable attribute).
const MODEL_BTN  = '[data-test-id="bard-mode-menu-button"], button.input-area-switch';
// Gemini renders options inside a .mat-mdc-menu-panel overlay appended to <body>.
// The selector list mirrors OPTION_SELECTORS in content.js, primary first.
const OPTION_SEL = [
  "button.mat-mdc-menu-item",
  '[role="menuitem"]',
  '[role="option"]',
  '[role="listitem"]',
  "li[data-value]",
  '[class*="model-item" i]',
].join(", ");

// Models to probe, in the order we attempt them.
const PROBE_MODELS = [
  { label: "Fast",     pattern: /fast/i },
  { label: "Pro",      pattern: /\bpro\b/i },
  { label: "Thinking", pattern: /think/i },
];

let context;

test.beforeAll(async ({ playwright }) => {
  ({ context } = await launchExtension(playwright.chromium, { slowMo: 400 }));
});

test.afterAll(async () => {
  await context.close();
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Opens https://gemini.google.com/app, handling the Google cookie-consent
 * redirect transparently. Returns the settled page.
 * @param {import("@playwright/test").BrowserContext} ctx
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function openGeminiPage(ctx) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" });

  // Handle consent overlay: wait briefly so a real user could make their own
  // choice, then fall back to "Accept all" only if still on the consent page.
  const acceptBtn = page.getByRole("button", { name: /accept all/i });
  try {
    await acceptBtn.waitFor({ state: "visible", timeout: 6_000 });
    // Mirror the 3 s grace period from background.js — give the user a moment.
    await page.waitForTimeout(3_000);
    // If the user (or a prior test run) already navigated to Gemini, skip.
    if (page.url().includes("consent.google.com")) {
      await acceptBtn.click();
      await page.waitForURL(/gemini\.google\.com/, { timeout: 15_000 });
    }
  } catch { /* consent page not shown or already past it */ }

  return page;
}

/**
 * Skips the current test if the page landed outside gemini.google.com OR if
 * the model-picker trigger is not visible within 15 s (e.g. login modal
 * obscures the UI while the URL still contains the Gemini domain).
 * @param {import("@playwright/test").Page} page
 */
async function skipIfNotReady(page) {
  if (!page.url().includes("gemini.google.com")) {
    test.skip(
      true,
      "Not signed in to Google — set CHROME_PROFILE to a logged-in Chrome profile."
    );
  }
  const visible = await page.locator(MODEL_BTN).isVisible().catch(() => false);
  if (!visible) {
    test.skip(
      true,
      "Model picker trigger not visible — the account may not be signed in, or Gemini changed its layout."
    );
  }
}

/**
 * Opens the picker, attempts to click the given option, waits for the trigger
 * button label to reflect the change, then returns whether the switch succeeded.
 *
 * A failed switch (timeout, locked option, paywall) returns false without
 * throwing, so callers can decide whether to skip or fail.
 *
 * @param {import("@playwright/test").Page} page
 * @param {RegExp} pattern  — matched against option text content
 * @param {number} [switchTimeout=7_000]
 * @returns {Promise<boolean>}
 */
async function tryModelSwitch(page, pattern, switchTimeout = 7_000) {
  const modelBtn = page.locator(MODEL_BTN);

  // Open the picker
  await modelBtn.click();

  const options = page.locator(OPTION_SEL);
  const target  = options.filter({ hasText: pattern }).first();

  try {
    await target.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    // Option not in the picker at all
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }

  await target.click();

  // Wait for the trigger label to reflect the switch
  try {
    await expect(modelBtn).toContainText(pattern, { timeout: switchTimeout });
    return true;
  } catch {
    // Label did not update — option is locked, disabled, or requires upgrade
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}

// ── Test 1: smoke ──────────────────────────────────────────────────────────

test("real Gemini — model-picker trigger is reachable after consent", async () => {
  const page = await openGeminiPage(context);

  if (!page.url().includes("gemini.google.com")) {
    test.skip(true, "Not signed in to Google.");
  }

  await expect(page.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });
  await page.close();
});

// ── Test 2: option discovery ───────────────────────────────────────────────

test("real Gemini — picker opens and shows at least one model option", async () => {
  const page = await openGeminiPage(context);
  await skipIfNotReady(page);

  const modelBtn = page.locator(MODEL_BTN);
  await expect(modelBtn).toBeVisible({ timeout: 20_000 });

  await modelBtn.click();

  const options = page.locator(OPTION_SEL);
  await expect(options.first()).toBeVisible({ timeout: 6_000 });

  // "Fast" must always be present and visible — it's the baseline free-tier model.
  await expect(options.filter({ hasText: /fast/i }).first()).toBeVisible();

  // Log which premium models the picker exposes (informational, not a hard assertion).
  const count = await options.count();
  const labels = [];
  for (let i = 0; i < count; i++) {
    const text = (await options.nth(i).textContent() ?? "").trim().slice(0, 60);
    if (text) labels.push(text.replace(/\s+/g, " "));
  }
  console.info("[06] picker options found:", labels);

  await page.keyboard.press("Escape");
  await page.close();
});

// ── Test 3: adaptive label round-trip ─────────────────────────────────────

test("real Gemini — model switches update the trigger label (skips locked models)", async () => {
  const page = await openGeminiPage(context);
  await skipIfNotReady(page);

  await expect(page.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });

  const results = {};

  for (const { label, pattern } of PROBE_MODELS) {
    const ok = await tryModelSwitch(page, pattern);
    results[label] = ok;
    console.info(`[06] model switch "${label}": ${ok ? "✓ success" : "✗ skipped (locked or unavailable)"}`);
  }

  // "Fast" must always be switchable — it is the baseline model for all accounts.
  if (!results["Fast"]) {
    throw new Error(
      "Could not switch to the Fast model. This indicates a selector regression, " +
      "not a subscription issue. Selectors may need to be updated."
    );
  }

  const premium = ["Pro", "Thinking"].filter(m => results[m]);
  if (premium.length > 0) {
    console.info(`[06] Premium models confirmed working: ${premium.join(", ")}`);
  } else {
    console.warn(
      "[06] Neither Pro nor Thinking was switchable. " +
      "This is expected on free-tier accounts. " +
      "Run with a Google AI Premium profile to verify premium model switching."
    );
  }

  await page.close();
});
