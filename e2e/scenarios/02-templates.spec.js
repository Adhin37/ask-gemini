/**
 * Scenario 02 — Templates and autocomplete (real Gemini)
 *
 * Uses the default e2e/.chrome-profile. Tests skip gracefully via skipIfNotReady()
 * when not signed in.
 *
 * Tests covered:
 *   1. Template grid dropdown + "/" autocomplete + send to real Gemini
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";
import {
  skipIfNotReady,
  sendViaPopup,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 650 }));
});

test.afterAll(async () => {
  await context.close();
});

// ── Test 1: template dropdown + autocomplete + send ───────────────────────

test("popup — template dropdown and autocomplete", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(1000);

  // Ensure flash model is active — its templates include "Summarize: " which
  // the "/sum" autocomplete test depends on. Prior scenario runs may have left
  // the popup on "pro" (whose templates don't start with "sum").
  await popup.locator(".model-opt[data-model='flash']").click();
  await popup.waitForTimeout(500);

  // ── Template grid dropdown ─────────────────────────────────────────
  await popup.locator("#tmplTriggerBtn").click();
  await popup.waitForTimeout(1200);
  // Hover first so the recording shows "Summarize:" highlighted before click.
  await popup.locator(".tmpl-item").first().hover();
  await popup.waitForTimeout(600);
  await popup.locator(".tmpl-item").first().click();
  await popup.waitForTimeout(800);

  const afterTemplate = await popup.locator("#questionInput").inputValue();
  expect(afterTemplate.length).toBeGreaterThan(0);

  await popup.locator("#questionInput").type(
    "the history of the Eiffel Tower in 3 bullet points",
    { delay: 18 }
  );
  await popup.waitForTimeout(700);

  // ── "/" inline autocomplete ────────────────────────────────────────
  await popup.locator("#questionInput").fill("");
  await popup.locator("#questionInput").dispatchEvent("input");
  await popup.waitForTimeout(600);

  await popup.locator("#questionInput").type("/sum", { delay: 40 });

  // Wait until the AC strip is visible before pressing Tab.
  await popup.locator("#acStrip.visible").waitFor({ state: "attached", timeout: 8_000 });
  await popup.waitForTimeout(400);

  // locator.press() targets the element directly via CDP, unlike
  // page.keyboard.press() which depends on OS window focus.
  await popup.locator("#questionInput").press("Tab");
  await popup.waitForTimeout(700);

  const afterAC = await popup.locator("#questionInput").inputValue();
  expect(afterAC).not.toMatch(/^\//);
  expect(afterAC.length).toBeGreaterThan(0);

  await popup.locator("#questionInput").type("recent AI breakthroughs", { delay: 18 });
  await popup.waitForTimeout(600);

  const message = await popup.locator("#questionInput").inputValue();
  expect(message.trim().length).toBeGreaterThan(0);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  // ── Send to real Gemini ────────────────────────────────────────────
  const { geminiPage, logs } = await sendViaPopup(context, popup);
  await skipIfNotReady(geminiPage);

  try {
    // The template inserts "Summarize: " as the prefix — check that keyword
    // rather than the full dynamic message to avoid newline-matching issues.
    await assertMessageOnGemini(geminiPage, "Summarize");
  } finally {
    console.info("[02] templates — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});
