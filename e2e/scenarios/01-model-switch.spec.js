/**
 * Scenario 01 — Model switcher (real Gemini)
 *
 * Exercises the live gemini.google.com UI via the full extension pipeline
 * (popup → storage → content.js → Gemini). Gemini is entered through the
 * extension popup — no direct page.goto(GEMINI_URL).
 *
 * Uses the default e2e/.chrome-profile, which is normally signed out (verified
 * October 2026): only Flash-Lite with standard thinking is enabled and the
 * other picker rows are aria-disabled. So this spec sends once with
 * FREE_MODEL and only interacts with Flash-Lite — it never clicks locked rows.
 * Flash / Pro / Extended-thinking switching and locked-model fallback live in
 * 01-model-switch-mock.spec.js.
 *
 * The prompt is sent once in beforeAll and the three tests inspect the same
 * Gemini tab, so the recording shows one send rather than three.
 *
 * Tests covered:
 *   1. Popup sends Flash-Lite message → arrives in real Gemini chat
 *   2. Picker opens and offers an enabled Flash-Lite row
 *   3. Selecting Flash-Lite keeps the trigger label on Flash-Lite
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { captureOnFailure } from "../helpers/debug.js";
import { openPopupWindow, configurePopup } from "../helpers/open-popup.js";
import {
  FREE_MODEL,
  MODEL_BTN,
  OPTION_SEL,
  skipIfNotReady,
  tryModelSwitch,
  sendViaPopup,
  closeGeminiTabs,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";

const PROBE_MESSAGE = "Explain what HTTP status codes are.";
const FLASH_LITE = /flash[\s-]?lite/i;

let context;
captureOnFailure(() => context);
let extensionId;
let geminiPage;

/**
 * Full popup → Gemini pipeline, run once for the whole file: opens the popup,
 * picks Flash-Lite with standard thinking, sends the probe message and keeps
 * the resulting Gemini tab for the tests below.
 */
test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 400 }));
  await closeGeminiTabs(context);

  const popup = await openPopupWindow(context, extensionId);
  await configurePopup(popup, { model: FREE_MODEL });
  await popup.locator("#questionInput").fill(PROBE_MESSAGE);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  ({ geminiPage } = await sendViaPopup(context, popup));
  await skipIfNotReady(geminiPage);
});

test.afterAll(async () => {
  await context.close();
});

// ── Test 1: full pipeline — message arrives ───────────────────────────────

test("real Gemini — popup sends Flash-Lite message", async () => {
  await assertMessageOnGemini(geminiPage, PROBE_MESSAGE);
  await expect(geminiPage.locator(MODEL_BTN)).toContainText(FLASH_LITE);
});

// ── Test 2: option discovery ───────────────────────────────────────────────

test("real Gemini — picker offers an enabled Flash-Lite row", async () => {
  const modelBtn = geminiPage.locator(MODEL_BTN);
  await expect(modelBtn).toBeVisible({ timeout: 20_000 });
  await modelBtn.click();

  const options = geminiPage.locator(OPTION_SEL);
  await expect(options.first()).toBeVisible({ timeout: 6_000 });

  const flashLite = options.filter({ hasText: FLASH_LITE }).first();
  await expect(flashLite).toBeVisible();
  await expect(flashLite).not.toHaveAttribute("aria-disabled", "true");

  const labels = (await options.allTextContents())
    .map(t => t.trim().replace(/\s+/g, " ").slice(0, 60))
    .filter(Boolean);
  console.info("[01] picker options found:", labels);

  await geminiPage.keyboard.press("Escape");
});

// ── Test 3: Flash-Lite selection round-trip ───────────────────────────────

test("real Gemini — selecting Flash-Lite updates the trigger label", async () => {
  await expect(geminiPage.locator(MODEL_BTN)).toBeVisible({ timeout: 20_000 });

  // A failure here is a selector regression in the picker, not a
  // subscription issue — Flash-Lite is enabled even when signed out.
  const ok = await tryModelSwitch(geminiPage, FLASH_LITE);
  expect(ok, "Could not select Flash-Lite — picker selectors may need updating").toBe(true);
});
