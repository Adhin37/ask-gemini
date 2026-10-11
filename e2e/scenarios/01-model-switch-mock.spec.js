/**
 * Scenario 01 (mock) — Thinking-level switching on Gemini's mode picker
 *
 * The real picker (verified October 2026) shows one "Auto" model row and
 * Low / Medium / High thinking rows, but only when signed in. The e2e
 * profile is signed out, so these paths run against the mock Gemini
 * fixture, which copies the real picker markup and adds sessionStorage
 * hooks (__testInitialLevel, __testLockedLevels, __testSignedOut). The
 * mock mirrors the active level on <html data-mock-level>, because the
 * real trigger always reads "Gemini Auto".
 *
 * Tests covered:
 *   1. Popup level cycle (low → medium → high) then send — ends on High
 *   2–4. Switch to Low / Medium / High from another level
 *   5. Level already active — no change, picker left closed
 *   6. High locked — level unchanged, message still sent, no error banner
 *   7. Signed-out picker (models only) — level skipped, message still sent
 *
 * Every test drives the popup for real (pick the level, type, Send), then
 * reconstructs the send via openGeminiWithPending(). The tab the popup
 * opens itself is closed unread: context.route() does not reliably catch
 * the first main-frame navigation of a tab created by the extension's own
 * chrome.tabs.create() (a CDP auto-attach race), while a plain
 * context.newPage() + page.goto() is fully under Playwright's control.
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { captureOnFailure } from "../helpers/debug.js";
import { openPopupWindow, configurePopup } from "../helpers/open-popup.js";
import { enableMockGeminiRoute } from "../helpers/mock-gemini.js";

let context;
captureOnFailure(() => context);
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 650 }));
  await enableMockGeminiRoute(context);
});

test.afterAll(async () => {
  await context.close();
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Picks `level` in a fresh popup, types `question` and clicks Send. Closes
 * the tab the popup opens (see the file header) and returns what the popup
 * sent.
 *
 * @param {"low"|"medium"|"high"} level
 * @param {string} question
 * @returns {Promise<{ message: string, level: string }>}
 */
async function sendFromPopup(level, question) {
  const popup = await openPopupWindow(context, extensionId);
  await configurePopup(popup, { level });

  await popup.locator("#questionInput").click();
  await popup.locator("#questionInput").type(question, { delay: 18 });
  await popup.waitForTimeout(400);

  const message  = await popup.locator("#questionInput").inputValue();
  const selected = await popup.evaluate(() =>
    document.querySelector(".model-opt.active")?.dataset.level
  );
  expect(selected).toBe(level);

  const [initialPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);
  await initialPage.close();
  return { message, level: selected };
}

/**
 * Opens a fresh mock Gemini page with the pending message / level written to
 * extension storage and the mock picker set up through its sessionStorage
 * hooks (applied by addInitScript before any inline page script runs).
 *
 * @param {string} msg
 * @param {"low"|"medium"|"high"} level
 * @param {{ initialLevel?: string, locked?: string[], signedOut?: boolean }} [mock]
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function openGeminiWithPending(msg, level, { initialLevel = "low", locked = [], signedOut = false } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.bringToFront();

  await page.addInitScript(({ initial, lockedIds, out }) => {
    sessionStorage.setItem("__testInitialLevel", initial);
    if (lockedIds) sessionStorage.setItem("__testLockedLevels", lockedIds);
    if (out) sessionStorage.setItem("__testSignedOut", "true");
  }, { initial: initialLevel, lockedIds: locked.join(","), out: signedOut });

  await context.serviceWorkers()[0].evaluate(
    ({ m, lvl }) => chrome.storage.local.set({ pendingMessage: m, pendingThinkingLevel: lvl }),
    { m: msg, lvl: level }
  );

  await page.goto("https://gemini.google.com/app");
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/**
 * Asserts the message arrived in the mock chat and the mock answered.
 * @param {import("@playwright/test").Page} page
 * @param {string} contains
 */
async function expectMessageSent(page, contains) {
  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".msg.user .msg-body")).toContainText(contains, { timeout: 5_000 });
  await expect(page.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });
  // Implicit coverage: no upload-failure banner on a level-only send.
  await expect(page.getByText("Image upload failed")).not.toBeVisible();
}

/** Locator for the mock picker rows — present only while the picker is open. */
const PICKER_ROWS = 'gem-menu[data-test-id="gem-mode-menu"] gem-menu-item';

// ── Test 1: popup level cycle then send ───────────────────────────────────

test("popup — level cycle then send (ends on High)", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(800);

  for (const level of ["low", "medium", "high"]) {
    await configurePopup(popup, { level });
    await popup.waitForTimeout(700);
  }
  await popup.close();

  const { message, level } = await sendFromPopup("high", "What are the key differences between REST and GraphQL?");
  const page = await openGeminiWithPending(message, level, { initialLevel: "low" });

  await expect(page.locator("html")).toHaveAttribute("data-mock-level", "high", { timeout: 10_000 });
  await expect(page.locator("#modelName")).toHaveText("Gemini");
  await expectMessageSent(page, "REST");

  await page.waitForTimeout(1200);
  await page.close();
});

// ── Tests 2–4: level switches ─────────────────────────────────────────────

/** @type {Array<{ level: "low"|"medium"|"high", initialLevel: string, question: string, contains: string }>} */
const LEVEL_SWITCH_CASES = [
  { level: "low",    initialLevel: "high",   question: "Explain HTTP in one sentence.",        contains: "HTTP" },
  { level: "medium", initialLevel: "low",    question: "What is quantum entanglement?",        contains: "quantum" },
  { level: "high",   initialLevel: "medium", question: "Summarize the history of computing.",  contains: "computing" },
];

for (const { level, initialLevel, question, contains } of LEVEL_SWITCH_CASES) {
  test(`Gemini — switch from ${initialLevel} to ${level} then send`, async () => {
    const sent = await sendFromPopup(level, question);
    const page = await openGeminiWithPending(sent.message, sent.level, { initialLevel });

    await expect(page.locator("html")).toHaveAttribute("data-mock-level", level, { timeout: 10_000 });
    await expect(page.locator(PICKER_ROWS)).toHaveCount(0);
    await expectMessageSent(page, contains);

    await page.waitForTimeout(800);
    await page.close();
  });
}

// ── Test 5: level already active ──────────────────────────────────────────

test("Gemini — level already active is left alone and the picker closes", async () => {
  const sent = await sendFromPopup("medium", "Give me three facts about octopuses.");
  const page = await openGeminiWithPending(sent.message, sent.level, { initialLevel: "medium" });

  await expectMessageSent(page, "octopuses");
  await expect(page.locator("html")).toHaveAttribute("data-mock-level", "medium");
  // content.js opened the picker to check, then closed it via Escape on the menu.
  await expect(page.locator(PICKER_ROWS)).toHaveCount(0);

  await page.waitForTimeout(800);
  await page.close();
});

// ── Test 6: locked level ──────────────────────────────────────────────────

test("Gemini — High locked keeps the current level and still sends", async () => {
  const sent = await sendFromPopup("high", "Why is the sky blue?");
  const page = await openGeminiWithPending(sent.message, sent.level, { initialLevel: "low", locked: ["high"] });

  await expectMessageSent(page, "sky blue");
  await expect(page.locator("html")).toHaveAttribute("data-mock-level", "low");
  await expect(page.locator(PICKER_ROWS)).toHaveCount(0);

  await page.waitForTimeout(800);
  await page.close();
});

// ── Test 7: signed-out picker ─────────────────────────────────────────────

test("Gemini — signed-out picker without levels skips the level and sends", async () => {
  const sent = await sendFromPopup("high", "Explain transformer architecture.");
  const page = await openGeminiWithPending(sent.message, sent.level, { signedOut: true });

  await expectMessageSent(page, "transformer");
  // The model stays on Flash-Lite and no locked row was clicked.
  await expect(page.locator("#modelName")).toHaveText("Flash-Lite");
  await expect(page.locator(PICKER_ROWS)).toHaveCount(0);

  await page.waitForTimeout(800);
  await page.close();
});
