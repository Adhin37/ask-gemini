/**
 * Helpers for tests that exercise the live gemini.google.com UI.
 *
 * Exports selectors, sign-in guard utilities, model-picker interaction, and
 * the full popup → Gemini send pipelines used by real-Gemini scenario files.
 *
 * Uses the default e2e/.chrome-profile (free Google account; Flash Lite and Flash
 * are available, Pro requires Google AI Plus). Tests skip gracefully when not
 * signed in. Point CHROME_PROFILE to a premium profile to verify Pro switching.
 */

import { test, expect } from "@playwright/test";
import { openPopupWindow } from "./open-popup.js";
import { buildImageDataTransfer, dropImageOnPopup } from "./images.js";

/**
 * Primary model button selector.
 * data-test-id is the most stable attribute; the second selector is a fallback.
 */
export const MODEL_BTN = '[data-test-id="bard-mode-menu-button"], button.input-area-switch';

/**
 * Selector list that mirrors OPTION_SELECTORS in content.js — the same
 * selector = the same DOM regression caught.
 */
export const OPTION_SEL = [
  'gem-menu-item[role="menuitem"]',
  "button.mat-mdc-menu-item",
  '[role="menuitem"]',
  '[role="option"]',
  '[role="listitem"]',
  "li[data-value]",
  '[class*="model-item" i]',
].join(", ");

/**
 * Models (and the Extended thinking row) probed during picker round-trip
 * tests, in attempt order. Flash-Lite and Flash are free-tier; Pro requires
 * Google AI Plus. Labels carry version prefixes in the real picker (verified
 * July 2026 — "3.5 Flash-Lite", "3.6 Flash", "3.1 Pro"), so patterns match
 * loosely on the model name rather than the version number.
 *
 * `exclude` filters out an option whose text would otherwise also match
 * `pattern` — e.g. plain `/\bflash\b/i` matches inside "Flash-Lite" too,
 * since a hyphen is a word boundary.
 * @type {Array<{ label: string, pattern: RegExp, exclude?: RegExp }>}
 */
export const PROBE_MODELS = [
  { label: "Flash-Lite",         pattern: /flash[\s-]?lite/i },
  { label: "Flash",              pattern: /\bflash\b/i, exclude: /lite/i },
  { label: "Pro",                pattern: /\bpro\b/i },
  { label: "Extended thinking",  pattern: /extended thinking/i },
];

/**
 * Skips the current test if the page did not land on gemini.google.com, or
 * if the model-picker trigger is not visible within the default timeout.
 * Covers the "not signed in" case where a login modal hides the UI.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<void>}
 */
export async function skipIfNotReady(page) {
  if (!page.url().includes("gemini.google.com")) {
    test.skip(
      true,
      "Not signed in to Google — sign in to the e2e/.chrome-profile once interactively."
    );
  }
  const visible = await page.locator(MODEL_BTN).isVisible().catch(() => false);
  if (!visible) {
    test.skip(
      true,
      "Model picker trigger not visible — the account may not be signed in, " +
      "or Gemini changed its layout."
    );
  }
}

/**
 * Opens the model picker, attempts to click the option matching the given
 * pattern, and waits for the trigger button label to reflect the change.
 *
 * Returns false — without throwing — when the option is absent, disabled,
 * or locked (paywall), so the caller can decide whether to skip or fail.
 *
 * @param {import("@playwright/test").Page} page
 * @param {RegExp} pattern - matched against option text content
 * @param {number} [switchTimeout=7_000]
 * @param {RegExp} [exclude] - options otherwise matching `pattern` to skip
 *   (e.g. excluding "Flash-Lite" when probing for plain "Flash")
 * @returns {Promise<boolean>}
 */
export async function tryModelSwitch(page, pattern, switchTimeout = 7_000, exclude = undefined) {
  const modelBtn = page.locator(MODEL_BTN);
  await modelBtn.click();

  const options = page.locator(OPTION_SEL);
  let filtered  = options.filter({ hasText: pattern });
  if (exclude) filtered = filtered.filter({ hasNotText: exclude });
  const target  = filtered.first();

  try {
    await target.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }

  const isDisabled = await target.evaluate(
    el => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"
  );
  if (isDisabled) {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }

  await target.click();

  try {
    await expect(modelBtn).toContainText(pattern, { timeout: switchTimeout });
    return true;
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    return false;
  }
}

/**
 * Closes all pages in the context whose URL includes gemini.google.com.
 * This forces popup.js to call chrome.tabs.create (which fires Playwright's
 * "page" event) rather than chrome.tabs.update (which is invisible to
 * Playwright).
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @returns {Promise<void>}
 */
export async function closeGeminiTabs(context) {
  for (const page of context.pages()) {
    if (page.url().includes("gemini.google.com")) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Clicks the send button in an already-configured popup, waits for the new
 * Gemini tab to appear, handles the Google cookie-consent overlay if shown,
 * attaches a console listener for [Ask Gemini] log lines, and waits for the
 * URL to settle.
 *
 * Precondition: the popup's message input is filled and the send button is
 * enabled. Caller must ensure no Gemini tabs are open before calling
 * (closeGeminiTabs).
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @param {import("@playwright/test").Page} popup
 * @returns {Promise<{ geminiPage: import("@playwright/test").Page, logs: string[] }>}
 */
export async function sendViaPopup(context, popup) {
  const logs = [];
  const [geminiPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 15_000 }),
    popup.locator("#sendBtn").click(),
  ]);

  geminiPage.on("console", msg => {
    const text = msg.text();
    if (text.includes("[Ask Gemini]")) {
      logs.push(`[${msg.type()}] ${text}`);
      console.log(`[content.js log] ${text}`);
    }
  });

  geminiPage.setViewportSize({ width: 1280, height: 720 }).catch(() => {});

  await geminiPage
    .waitForURL(/gemini\.google\.com|accounts\.google\.com|consent\.google\.com/, { timeout: 25_000 })
    .catch(() => {});

  // Handle Google cookie-consent overlay: give the user 3 s to act, then
  // fall back to "Accept all" only if still on the consent page.
  const acceptAllBtn = geminiPage.getByRole("button", { name: /accept all/i });
  try {
    await acceptAllBtn.waitFor({ state: "visible", timeout: 6_000 });
    await geminiPage.waitForTimeout(3_000);
    if (geminiPage.url().includes("consent.google.com")) {
      await acceptAllBtn.click();
      await geminiPage.waitForURL(/gemini\.google\.com/, { timeout: 15_000 }).catch(() => {});
    }
  } catch { /* consent overlay not present or already past it */ }

  // Auto-dismiss Gemini's "Create content from images and files" consent dialog
  // using addLocatorHandler — Playwright's dedicated overlay-dismissal API.
  // Unlike fire-and-forget, the handler fires on every Playwright polling cycle
  // (~100–200 ms), so the dialog is dismissed before content.js's 300 ms
  // chip-poll can register a false-positive and submit without the image.
  // Broader button pattern catches label variations across Gemini UI updates.
  // The handler is a no-op on tests that never trigger the dialog.
  await geminiPage.addLocatorHandler(
    geminiPage.locator('[role="dialog"], mat-dialog-container'),
    async (dialog) => {
      await dialog
        .getByRole("button", { name: /agree|allow|accept|continue/i })
        .click({ timeout: 3_000 })
        .catch(() => {});
    }
  );

  return { geminiPage, logs };
}

/**
 * Full popup → Gemini image upload pipeline:
 *   1. Closes existing Gemini tabs so popup uses chrome.tabs.create.
 *   2. Opens the extension popup.
 *   3. Builds a canvas-generated image and drops it; waits for the file chip.
 *   4. Fills the message text.
 *   5. Clicks Send and captures the new Gemini tab.
 *
 * Caller is responsible for closing geminiPage when done.
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @param {string} extensionId
 * @param {{ mimeType: string, filename: string, message: string }} opts
 * @returns {Promise<{ geminiPage: import("@playwright/test").Page, logs: string[] }>}
 */
export async function sendImageViaPopup(context, extensionId, { mimeType, filename, message }) {
  await closeGeminiTabs(context);

  const popup = await openPopupWindow(context, extensionId);

  const dt = await buildImageDataTransfer(popup, mimeType, filename);
  await dropImageOnPopup(popup, dt);
  await dt.dispose();

  await expect(popup.locator(".file-chip")).toBeVisible({ timeout: 6_000 });

  await popup.locator("#questionInput").fill(message);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  return sendViaPopup(context, popup);
}

/**
 * Asserts that the given message text is visible on the Gemini page (i.e. was
 * successfully injected into the conversation) and that no "Image upload
 * failed" error banner is present.
 *
 * @param {import("@playwright/test").Page} geminiPage
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function assertMessageOnGemini(geminiPage, message) {
  await expect(geminiPage.getByText(message, { exact: false })).toBeVisible({ timeout: 40_000 });
  await expect(geminiPage.getByText("Image upload failed")).not.toBeVisible();
}
