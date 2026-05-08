/**
 * Scenario 01 — Model switcher (real Gemini)
 *
 * Exercises the live gemini.google.com UI via the full extension pipeline
 * (popup → storage → content.js → Gemini). Every test enters Gemini through
 * the extension popup — no direct page.goto(GEMINI_URL).
 *
 * Uses the default e2e/.chrome-profile (free Google account, only Fast available).
 * Tests skip gracefully when not signed in via skipIfNotReady().
 * Pro/Thinking switching and locked-model fallback live in
 * 01-model-switch-mock.spec.js (require premium or sessionStorage hooks).
 *
 * Tests covered:
 *   1. Popup sends Fast message → arrives in real Gemini chat, picker is reachable
 *   2. Picker opens and shows at least one model option (Fast always present)
 *   3. Model switches update the trigger label (Fast hard-asserted; Pro/Thinking soft-warned)
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";
import {
  MODEL_BTN,
  OPTION_SEL,
  PROBE_MODELS,
  skipIfNotReady,
  tryModelSwitch,
  sendViaPopup,
  closeGeminiTabs,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";

const PROBE_MESSAGE = "Explain what HTTP status codes are.";

let context;
let extensionId;
let geminiPage;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 400 }));
});

/**
 * Full popup → Gemini pipeline executed before each test.
 * Closes any existing Gemini tab, opens the popup, picks Flash, fills the
 * probe message, clicks Send, and captures the new Gemini page.
 * Skips the test gracefully if the resulting page is not on gemini.google.com.
 */
test.beforeEach(async () => {
  await closeGeminiTabs(context);

  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(600);

  await popup.locator(".model-opt[data-model='flash']").click();
  await popup.waitForTimeout(400);

  await popup.locator("#questionInput").fill(PROBE_MESSAGE);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  ({ geminiPage } = await sendViaPopup(context, popup));
  await skipIfNotReady(geminiPage);
});

test.afterEach(async () => {
  await geminiPage?.close().catch(() => {});
  geminiPage = undefined;
});

test.afterAll(async () => {
  await context.close();
});

// ── Test 1: full pipeline — message arrives, picker reachable ─────────────

test("real Gemini — popup sends Fast message and picker is reachable", async () => {
  try {
    await assertMessageOnGemini(geminiPage, PROBE_MESSAGE);
    await expect(geminiPage.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });
  } finally {
    console.info("[01] Fast send — picker reachable");
  }
});

// ── Test 2: option discovery ───────────────────────────────────────────────

test("real Gemini — picker opens and shows at least one model option", async () => {
  const modelBtn = geminiPage.locator(MODEL_BTN);
  await expect(modelBtn).toBeVisible({ timeout: 20_000 });
  await modelBtn.click();

  const options = geminiPage.locator(OPTION_SEL);
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

  await geminiPage.keyboard.press("Escape");
});

// ── Test 3: adaptive label round-trip ─────────────────────────────────────

test("real Gemini — model switches update the trigger label (skips locked models)", async () => {
  await expect(geminiPage.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });

  const results = {};

  for (const { label, pattern } of PROBE_MODELS) {
    const ok = await tryModelSwitch(geminiPage, pattern);
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
});
