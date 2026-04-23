/**
 * Scenario 06 — Real Gemini (live page, no mock)
 *
 * Verifies that content.js selectors and model-switching logic work against
 * the live Gemini UI — catching DOM regressions that mocks cannot detect.
 *
 * Prerequisite: the e2e Chrome profile must be signed in to a Google account.
 *   Option A — point to your existing Chrome profile:
 *     CHROME_PROFILE="$HOME/.config/google-chrome/Default" npx playwright test ...
 *   Option B — sign in once interactively then re-run:
 *     npx playwright test --config=e2e/playwright.config.js e2e/scenarios/06-real-gemini.spec.js
 *
 * These tests do NOT inject or submit messages to the Gemini AI.
 * They verify only the model-picker DOM structure and label round-trip.
 */
import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";

const GEMINI_URL = "https://gemini.google.com/app";

// Mirrors the selectors used by content.js so a DOM regression breaks
// both this test and the extension at the same place.
const MODEL_BTN  = '[data-test-id="bard-mode-menu-button"]';
const OPTION_SEL = '[role="option"], [role="menuitem"], [role="listitem"], li[data-value], [class*="model-item" i]';

let context;

test.beforeAll(async ({ playwright }) => {
  ({ context } = await launchExtension(playwright.chromium, { slowMo: 400 }));
});

test.afterAll(async () => {
  await context.close();
});

/**
 * Opens https://gemini.google.com/app, accepting the Google cookie-consent
 * overlay if it appears (background.js also handles this when pendingMessage
 * is set, but the test handles it directly since we don't set storage here).
 * Returns the settled page.
 */
async function openGeminiPage() {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" });

  // Accept cookie consent if it appears (consent.google.com redirect or inline)
  const acceptBtn = page.getByRole("button", { name: /accept all/i });
  try {
    await acceptBtn.waitFor({ state: "visible", timeout: 6_000 });
    await acceptBtn.click();
    await page.waitForURL(/gemini\.google\.com/, { timeout: 15_000 });
  } catch { /* already accepted or not shown */ }

  return page;
}

/**
 * Skips the running test when the browser landed on a login/account page
 * instead of Gemini (i.e. the Chrome profile has no Google session).
 * @param {import("@playwright/test").Page} page
 */
function skipIfLoginWall(page) {
  if (!page.url().includes("gemini.google.com")) {
    test.skip(
      true,
      "Not signed in to Google — set CHROME_PROFILE to a logged-in Chrome profile, " +
      "or run once in headed mode and sign in to the e2e profile."
    );
  }
}

// ── Test 1: smoke ──────────────────────────────────────────────────────────

test("real Gemini — consent clears and model-picker trigger is reachable", async () => {
  const page = await openGeminiPage();
  skipIfLoginWall(page);

  await expect(page.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });

  await page.close();
});

// ── Test 2: option discovery ───────────────────────────────────────────────

test("real Gemini — picker dropdown contains Fast / Thinking / Pro", async () => {
  const page = await openGeminiPage();
  skipIfLoginWall(page);

  const modelBtn = page.locator(MODEL_BTN);
  await expect(modelBtn).toBeVisible({ timeout: 20_000 });

  await modelBtn.click();

  const options = page.locator(OPTION_SEL);
  await expect(options.first()).toBeVisible({ timeout: 6_000 });

  // Use the same keyword set as content.js classifyModelText / matchesTarget
  // so any rename in Gemini's UI surfaces here rather than silently in the extension.
  await expect(options.filter({ hasText: /fast/i }).first()).toBeVisible();
  await expect(options.filter({ hasText: /think/i }).first()).toBeVisible();
  await expect(options.filter({ hasText: /\bpro\b/i }).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await page.close();
});

// ── Test 3: label round-trip ───────────────────────────────────────────────

test("real Gemini — model switch Fast → Pro → Thinking updates trigger label", async () => {
  const page = await openGeminiPage();
  skipIfLoginWall(page);

  const modelBtn = page.locator(MODEL_BTN);
  await expect(modelBtn).toBeVisible({ timeout: 20_000 });

  const options = page.locator(OPTION_SEL);

  // ── Reset to Fast ──────────────────────────────────────────────────────
  await modelBtn.click();
  await options.filter({ hasText: /fast/i }).first().waitFor({ timeout: 5_000 });
  await options.filter({ hasText: /fast/i }).first().click();
  await expect(modelBtn).toContainText(/fast/i, { timeout: 8_000 });

  // ── Switch to Pro ──────────────────────────────────────────────────────
  await modelBtn.click();
  await options.filter({ hasText: /\bpro\b/i }).first().waitFor({ timeout: 5_000 });
  await options.filter({ hasText: /\bpro\b/i }).first().click();
  await expect(modelBtn).toContainText(/pro/i, { timeout: 8_000 });

  // ── Switch to Thinking ─────────────────────────────────────────────────
  await modelBtn.click();
  await options.filter({ hasText: /think/i }).first().waitFor({ timeout: 5_000 });
  await options.filter({ hasText: /think/i }).first().click();
  await expect(modelBtn).toContainText(/think/i, { timeout: 8_000 });

  await page.close();
});
