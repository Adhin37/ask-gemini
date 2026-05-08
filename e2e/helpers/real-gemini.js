/**
 * Helpers for tests that exercise the live gemini.google.com UI.
 *
 * Exports selectors, page-open/consent/sign-in utilities, model-picker
 * interaction, and the full popup → Gemini send pipelines used by real-
 * Gemini scenario files.
 *
 * Uses the default e2e/.chrome-profile (free Google account; only Fast model available).
 * Tests skip gracefully when not signed in. Point CHROME_PROFILE to a premium
 * profile to verify Pro/Thinking model switching against real Gemini.
 */

import { test, expect } from "@playwright/test";
import { openPopupWindow } from "./open-popup.js";
import { buildImageDataTransfer, dropImageOnPopup } from "./images.js";

/** URL of the Gemini app. */
export const GEMINI_URL = "https://gemini.google.com/app";

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
  "button.mat-mdc-menu-item",
  '[role="menuitem"]',
  '[role="option"]',
  '[role="listitem"]',
  "li[data-value]",
  '[class*="model-item" i]',
].join(", ");

/**
 * Models probed during picker round-trip tests, in attempt order.
 * @type {Array<{ label: string, pattern: RegExp }>}
 */
export const PROBE_MODELS = [
  { label: "Fast",     pattern: /fast/i },
  { label: "Pro",      pattern: /\bpro\b/i },
  { label: "Thinking", pattern: /think/i },
];

/**
 * Opens https://gemini.google.com/app, handling the Google cookie-consent
 * redirect transparently. Returns the settled page.
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @returns {Promise<import("@playwright/test").Page>}
 */
export async function openRealGeminiPage(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(GEMINI_URL, { waitUntil: "domcontentloaded" });

  // Handle consent overlay: give the user 3 s to act, then fall back to
  // "Accept all" only if still on the consent page.
  const acceptBtn = page.getByRole("button", { name: /accept all/i });
  try {
    await acceptBtn.waitFor({ state: "visible", timeout: 6_000 });
    await page.waitForTimeout(3_000);
    if (page.url().includes("consent.google.com")) {
      await acceptBtn.click();
      await page.waitForURL(/gemini\.google\.com/, { timeout: 15_000 });
    }
  } catch { /* consent page not shown or already past it */ }

  return page;
}

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
 * @returns {Promise<boolean>}
 */
export async function tryModelSwitch(page, pattern, switchTimeout = 7_000) {
  const modelBtn = page.locator(MODEL_BTN);
  await modelBtn.click();

  const options = page.locator(OPTION_SEL);
  const target  = options.filter({ hasText: pattern }).first();

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
 * Gemini tab to appear, attaches a console listener for [Ask Gemini] log
 * lines, and waits for the URL to settle.
 *
 * Precondition: the popup's message input is filled and the send button is
 * enabled. Caller must ensure no Gemini tabs are open before calling
 * (openRealGeminiPage + close, or closeGeminiTabs).
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

  // Fire-and-forget: accept the "Create content from images and files" consent
  // dialog that Gemini shows on fresh/unlogged profiles before the first upload.
  // If it never appears the promise rejects silently; if it does appear it is
  // clicked before content.js's 11-second chip-verification window expires.
  geminiPage
    .locator('[role="dialog"], mat-dialog-container')
    .getByRole("button", { name: /agree/i })
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() =>
      geminiPage
        .locator('[role="dialog"], mat-dialog-container')
        .getByRole("button", { name: /agree/i })
        .click()
    )
    .catch(() => {});

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
