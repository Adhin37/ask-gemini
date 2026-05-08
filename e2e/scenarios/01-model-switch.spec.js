/**
 * Scenario 01 — Model switcher (real Gemini)
 *
 * Exercises the live gemini.google.com UI to verify that selectors and model-
 * switching logic in content.js work against the real DOM.
 *
 * Uses the default e2e/.chrome-profile (free Google account, only Fast available).
 * Tests skip gracefully when not signed in via skipIfNotReady().
 * Point CHROME_PROFILE to a premium profile to exercise Pro/Thinking against real Gemini.
 *
 * Free-account behaviour:
 *   - Tests 1–3 verify the picker UI and Fast-model switching (always available).
 *   - Test 4 verifies the full popup → real-Gemini send pipeline using Fast.
 *   - Pro/Thinking switching and locked-model fallback live in
 *     01-model-switch-mock.spec.js (require premium or sessionStorage hooks).
 *
 * Tests covered:
 *   1. Model-picker trigger is reachable after consent
 *   2. Picker opens and shows at least one model option
 *   3. Model switches update the trigger label (Fast hard-asserted; Pro/Thinking soft-warned)
 *   4. Popup with Fast model — message arrives in real Gemini chat
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";
import {
  MODEL_BTN,
  OPTION_SEL,
  PROBE_MODELS,
  openRealGeminiPage,
  skipIfNotReady,
  tryModelSwitch,
  sendViaPopup,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 400 }));
});

test.afterAll(async () => {
  await context.close();
});

// ── Test 1: smoke ──────────────────────────────────────────────────────────

test("real Gemini — model-picker trigger is reachable after consent", async () => {
  const page = await openRealGeminiPage(context);

  if (!page.url().includes("gemini.google.com")) {
    test.skip(true, "Not signed in to Google.");
  }

  await expect(page.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });
  await page.close();
});

// ── Test 2: option discovery ───────────────────────────────────────────────

test("real Gemini — picker opens and shows at least one model option", async () => {
  const page = await openRealGeminiPage(context);
  await skipIfNotReady(page);

  const modelBtn = page.locator(MODEL_BTN);
  await expect(modelBtn).toBeVisible({ timeout: 20_000 });

  await modelBtn.click();

  const options = page.locator(OPTION_SEL);
  await expect(options.first()).toBeVisible({ timeout: 6_000 });

  // "Fast" must always be present — it is the baseline free-tier model.
  await expect(options.filter({ hasText: /fast/i }).first()).toBeVisible();

  const count = await options.count();
  const labels = [];
  for (let i = 0; i < count; i++) {
    const text = (await options.nth(i).textContent() ?? "").trim().slice(0, 60);
    if (text) labels.push(text.replace(/\s+/g, " "));
  }
  console.info("[01] picker options found:", labels);

  await page.keyboard.press("Escape");
  await page.close();
});

// ── Test 3: adaptive label round-trip ─────────────────────────────────────

test("real Gemini — model switches update the trigger label (skips locked models)", async () => {
  const page = await openRealGeminiPage(context);
  await skipIfNotReady(page);

  await expect(page.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });

  const results = {};

  for (const { label, pattern } of PROBE_MODELS) {
    const ok = await tryModelSwitch(page, pattern);
    results[label] = ok;
    console.info(`[01] model switch "${label}": ${ok ? "✓ success" : "✗ skipped (locked or unavailable)"}`);
  }

  // "Fast" must always be switchable — selector regression if it is not.
  if (!results["Fast"]) {
    throw new Error(
      "Could not switch to the Fast model. This indicates a selector regression, " +
      "not a subscription issue. Selectors may need to be updated."
    );
  }

  const premium = ["Pro", "Thinking"].filter(m => results[m]);
  if (premium.length > 0) {
    console.info(`[01] Premium models confirmed working: ${premium.join(", ")}`);
  } else {
    console.warn(
      "[01] Neither Pro nor Thinking was switchable. " +
      "Expected on free-tier accounts. " +
      "Run with a Google AI Premium profile to verify premium model switching."
    );
  }

  await page.close();
});

// ── Test 4: popup with Fast model → message arrives in real Gemini ─────────

test("real Gemini — popup with Fast model sends message to chat", async () => {
  // Tests 1–3 already confirmed Gemini is reachable in this context; no probe needed.
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(800);

  // Ensure Flash is the active model
  await popup.locator(".model-opt[data-model='flash']").click();
  await popup.waitForTimeout(400);

  const message = "Explain what HTTP status codes are.";
  await popup.locator("#questionInput").fill(message);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  // probe.close() already closed the Gemini tab; no existing tabs to clear
  const { geminiPage, logs } = await sendViaPopup(context, popup);
  await skipIfNotReady(geminiPage);

  try {
    await assertMessageOnGemini(geminiPage, message);
  } finally {
    console.info("[01] Fast send — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});
