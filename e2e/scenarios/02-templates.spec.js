/**
 * Scenario 02 — Templates and autocomplete (real Gemini)
 *
 * Uses the default e2e/.chrome-profile. Sends with FREE_MODEL (Flash-Lite), so
 * the templates exercised are the Flash-Lite defaults ("Quick answer: ",
 * "TL;DR: ", "Define: "). The Gemini step skips gracefully via skipIfNotReady()
 * when Gemini is unreachable.
 *
 * Tests covered:
 *   1. Template grid dropdown + "/" autocomplete + send to real Gemini
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { captureOnFailure } from "../helpers/debug.js";
import { openPopupWindow, configurePopup } from "../helpers/open-popup.js";
import {
  FREE_MODEL,
  skipIfNotReady,
  sendViaPopup,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";

let context;
captureOnFailure(() => context);
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
  const input = popup.locator("#questionInput");

  // Flash-Lite templates back both the dropdown and the "/def" autocomplete.
  await configurePopup(popup, { model: FREE_MODEL });

  // ── Template grid dropdown ─────────────────────────────────────────
  // The trigger toggles, so only click while closed and retry until open —
  // a stray second activation (seen once under slowMo) would close it again.
  const dropdown = popup.locator("#tmplDropdown");
  await expect(async () => {
    if (!(await dropdown.getAttribute("class"))?.includes("visible")) {
      await popup.locator("#tmplTriggerBtn").click();
    }
    await expect(dropdown).toHaveClass(/\bvisible\b/, { timeout: 1_000 });
  }).toPass({ timeout: 8_000 });
  const firstItem = popup.locator(".tmpl-item").first();
  await expect(firstItem).toBeVisible();
  // Hover first so the recording shows the item highlighted before click.
  await firstItem.hover();
  await firstItem.click();

  await expect(input).toHaveValue(/^Quick answer: /);
  await input.pressSequentially("the history of the Eiffel Tower in 3 bullet points", { delay: 18 });

  // ── "/" inline autocomplete ────────────────────────────────────────
  await input.fill("");
  await input.pressSequentially("/def", { delay: 40 });
  await expect(popup.locator("#acStrip")).toHaveClass(/\bvisible\b/, { timeout: 8_000 });

  // locator.press() targets the element directly via CDP, unlike
  // page.keyboard.press() which depends on OS window focus.
  await input.press("Tab");
  await expect(input).toHaveValue(/^Define: /);

  await input.pressSequentially("recent AI breakthroughs", { delay: 18 });
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  // ── Send to real Gemini ────────────────────────────────────────────
  const { geminiPage, logs } = await sendViaPopup(context, popup);
  await skipIfNotReady(geminiPage);

  try {
    await assertMessageOnGemini(geminiPage, "Define: recent AI breakthroughs");
  } finally {
    console.info("[02] templates — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});
