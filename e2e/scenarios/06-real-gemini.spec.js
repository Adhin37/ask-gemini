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
import { openPopupWindow } from "../helpers/open-popup.js";

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
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 400 }));
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

  // Skip disabled / quota-locked options without trying to click them
  const isDisabled = await target.evaluate(
    el => el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true"
  );
  if (isDisabled) {
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

// ══════════════════════════════════════════════════════════════════════════════
// Image upload — full coverage
//
// Tests 4–5: popup validation (no Gemini needed — always run).
// Tests 6–8: full E2E via popup (skip if not signed in to Google).
//
// Pipeline for tests 6–8:
//   popup drop → file chip → send → content.js uploads → message in chat
//
// Key assertion strategy for upload tests:
//   • page.getByText(message) — the message text appears in Gemini's user
//     bubble after submission, regardless of DOM class names.
//   • page.getByText("Image upload failed") must NOT be visible — this is the
//     error banner injected by content.js when waitForUploadChips times out.
//
// If a real-Gemini upload test fails with "Image upload failed" visible:
//   → UPLOAD_CHIP_SELECTORS in content.js doesn't match Gemini's current DOM.
//   → Open Gemini, attach a file manually, run in DevTools:
//       [...document.querySelectorAll('img[src^="blob:"]')]
//     Confirm which selector from UPLOAD_CHIP_SELECTORS matches, or add a new one.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Closes any pages whose current URL includes gemini.google.com.
 * This forces popup's chrome.tabs.create (fires a Playwright "page" event)
 * rather than chrome.tabs.update (invisible to Playwright).
 * @param {import("@playwright/test").BrowserContext} ctx
 */
async function closeGeminiTabs(ctx) {
  for (const page of ctx.pages()) {
    if (page.url().includes("gemini.google.com")) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Builds a real image File wrapped in a DataTransfer inside the popup's
 * browser context. Uses canvas.toDataURL so bytes pass the popup's
 * magic-bytes validation for every supported MIME type (PNG/JPEG/WebP).
 *
 * @param {import("@playwright/test").Page} popup
 * @param {string} mimeType  e.g. "image/png"
 * @param {string} filename  e.g. "test.png"
 * @returns {Promise<import("@playwright/test").JSHandle>}
 */
async function buildImageDataTransfer(popup, mimeType, filename) {
  return popup.evaluateHandle(([mime, fname]) => {
    const canvas = document.createElement("canvas");
    canvas.width  = 4;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#3366cc";
    ctx.fillRect(0, 0, 4, 4);
    const dataUrl = canvas.toDataURL(mime, 0.9);
    const b64   = dataUrl.split(",")[1];
    const raw   = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], fname, { type: mime }));
    return transfer;
  }, [mimeType, filename]);
}

/**
 * Full E2E upload pipeline:
 *   1. Closes existing Gemini tabs so popup uses chrome.tabs.create
 *      (which fires a Playwright "page" event).
 *   2. Opens the real extension popup.
 *   3. Drops a valid canvas-generated image onto the popup; waits for chip.
 *   4. Types the message and clicks Send.
 *   5. Captures the new Gemini tab and attaches a console listener for
 *      content.js [Ask Gemini] log lines (useful for debugging failures).
 *
 * Caller is responsible for closing geminiPage when done.
 *
 * @param {string} mimeType
 * @param {string} filename
 * @param {string} message
 * @returns {Promise<{ geminiPage: import("@playwright/test").Page, logs: string[] }>}
 */
async function sendImageViaPopup(mimeType, filename, message) {
  await closeGeminiTabs(context);

  const popup = await openPopupWindow(context, extensionId);

  // Build a real image and simulate drag-and-drop onto the popup
  const dt = await buildImageDataTransfer(popup, mimeType, filename);
  await popup.dispatchEvent("#inputWrapper", "dragenter", { dataTransfer: dt });
  await popup.waitForTimeout(200);
  await popup.dispatchEvent("#inputWrapper", "dragover",  { dataTransfer: dt });
  await popup.waitForTimeout(200);
  await popup.dispatchEvent("#inputWrapper", "drop",      { dataTransfer: dt });
  await dt.dispose();

  // File chip must appear — confirms popup accepted file (valid MIME + magic bytes)
  await expect(popup.locator(".file-chip")).toBeVisible({ timeout: 6_000 });

  // Type message to enable the send button (send btn requires non-empty text)
  await popup.locator("#questionInput").fill(message);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  // Collect content.js [Ask Gemini] log lines from the Gemini page
  const logs = [];

  // Wait for the new Gemini tab while clicking Send simultaneously
  const [geminiPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 15_000 }),
    popup.locator("#sendBtn").click(),
  ]);

  // Attach console listener immediately — content.js runs after document_idle,
  // so we have time to set this up before it fires.
  geminiPage.on("console", msg => {
    const text = msg.text();
    if (text.includes("[Ask Gemini]")) {
      logs.push(`[${msg.type()}] ${text}`);
      console.log(`[content.js log] ${text}`);
    }
  });

  geminiPage.setViewportSize({ width: 1280, height: 720 }).catch(() => {});

  // Wait for navigation to settle (handles consent/login redirects)
  await geminiPage
    .waitForURL(/gemini\.google\.com|accounts\.google\.com|consent\.google\.com/, { timeout: 25_000 })
    .catch(() => {});

  return { geminiPage, logs };
}

// ── Test 4: popup — too-large file rejected ───────────────────────────────────

test("popup — too-large image rejected with error, not added to chip list", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(600);

  // 5 MB buffer with valid PNG magic bytes — passes MIME check, fails size check
  const dt = await popup.evaluateHandle(() => {
    const bytes = new Uint8Array(5 * 1024 * 1024);
    bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const blob = new Blob([bytes], { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "huge.png", { type: "image/png" }));
    return transfer;
  });

  await popup.dispatchEvent("#inputWrapper", "drop", { dataTransfer: dt });
  await dt.dispose();

  // Hint bar must show the size-limit error
  await expect(popup.locator("#hint")).toContainText("exceeds 4 MB", { timeout: 3_000 });
  // No chip must be added
  await expect(popup.locator(".file-chip")).not.toBeVisible();

  await popup.close();
});

// ── Test 5: popup — non-image file rejected ───────────────────────────────────

test("popup — non-image file rejected with error, not added to chip list", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(600);

  const dt = await popup.evaluateHandle(() => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "notes.txt", { type: "text/plain" }));
    return transfer;
  });

  await popup.dispatchEvent("#inputWrapper", "drop", { dataTransfer: dt });
  await dt.dispose();

  await expect(popup.locator("#hint")).toContainText("is not an image", { timeout: 3_000 });
  await expect(popup.locator(".file-chip")).not.toBeVisible();

  await popup.close();
});

// ── Test 6: real Gemini — PNG upload via popup ────────────────────────────────

test("real Gemini — PNG upload via popup: image chip detected, prompt sent", async () => {
  const probe = await openGeminiPage(context);
  await skipIfNotReady(probe);
  await probe.close();

  const MSG = "e2e PNG upload test — what do you see in this image?";
  const { geminiPage, logs } = await sendImageViaPopup("image/png", "test.png", MSG);

  // Second sign-in guard: handles consent redirects on the opened Gemini page
  await skipIfNotReady(geminiPage);

  try {
    await expect(geminiPage.getByText(MSG, { exact: false })).toBeVisible({ timeout: 40_000 });
    await expect(geminiPage.getByText("Image upload failed")).not.toBeVisible();
  } finally {
    console.info("[06] PNG upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});

// ── Test 7: real Gemini — WebP upload via popup ───────────────────────────────

test("real Gemini — WebP upload via popup: image chip detected, prompt sent", async () => {
  const probe = await openGeminiPage(context);
  await skipIfNotReady(probe);
  await probe.close();

  const MSG = "e2e WebP upload test — describe this image";
  const { geminiPage, logs } = await sendImageViaPopup("image/webp", "photo.webp", MSG);

  await skipIfNotReady(geminiPage);

  try {
    await expect(geminiPage.getByText(MSG, { exact: false })).toBeVisible({ timeout: 40_000 });
    await expect(geminiPage.getByText("Image upload failed")).not.toBeVisible();
  } finally {
    console.info("[06] WebP upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});

// ── Test 8: real Gemini — JPEG upload via popup ───────────────────────────────

test("real Gemini — JPEG upload via popup: image chip detected, prompt sent", async () => {
  const probe = await openGeminiPage(context);
  await skipIfNotReady(probe);
  await probe.close();

  const MSG = "e2e JPEG upload test — what colour is this image?";
  const { geminiPage, logs } = await sendImageViaPopup("image/jpeg", "photo.jpg", MSG);

  await skipIfNotReady(geminiPage);

  try {
    await expect(geminiPage.getByText(MSG, { exact: false })).toBeVisible({ timeout: 40_000 });
    await expect(geminiPage.getByText("Image upload failed")).not.toBeVisible();
  } finally {
    console.info("[06] JPEG upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});
