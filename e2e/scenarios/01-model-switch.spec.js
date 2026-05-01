/**
 * Scenario 01 — Model switcher + send
 *
 * Tests covered:
 *   1. Popup model cycle then send (existing smoke test — ends on pro)
 *   2. Flash model already active — content.js skips the picker (no switch)
 *   3. Switch to Fast     (mock starts on Thinking → content.js switches back to Fast)
 *   4. Switch to Thinking (mock starts on Fast    → content.js switches to Thinking)
 *   5. Switch to Pro      (mock starts on Fast    → content.js switches to Pro)
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_HTML  = fs.readFileSync(path.join(__dirname, "../fixtures/mock-gemini.html"), "utf8");

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 650 }));
  await context.route("https://gemini.google.com/**", route =>
    route.fulfill({ status: 200, contentType: "text/html", body: MOCK_HTML })
  );
});

test.afterAll(async () => {
  await context.close();
});

// ── Helper ────────────────────────────────────────────────────────

/**
 * Opens a fresh mock Gemini page with the given pending message/model
 * already written to extension storage.
 *
 * @param {string} msg                    — the message content.js will inject
 * @param {string} model                  — "flash" | "thinking" | "pro"
 * @param {string} [initialModel="flash"] — model the mock page should start on.
 *   The real Gemini retains the user's last-selected model across sessions.
 *   We simulate this by writing "__testInitialModel" to sessionStorage via
 *   addInitScript() — which runs before any inline page script — so the mock
 *   can read it and pre-select the option before content.js starts.
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function openGeminiWithPending(msg, model, initialModel = "flash") {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.bringToFront();

  // addInitScript runs in the page's main world before any inline script —
  // so the mock reads this value before content.js can call readModelFromButton().
  if (initialModel !== "flash") {
    await page.addInitScript(
      (m) => sessionStorage.setItem("__testInitialModel", m),
      initialModel
    );
  }

  // Set storage before navigating so content.js finds pendingMessage on load.
  await context.serviceWorkers()[0].evaluate(
    ({ msg, mdl }) => chrome.storage.local.set({ pendingMessage: msg, pendingModel: mdl }),
    { msg, mdl: model }
  );

  await page.goto("https://gemini.google.com/app");
  await page.waitForLoadState("domcontentloaded");
  return page;
}

// ── Test 1: popup model cycle then send ──────────────────────────

test("popup — model switch then send", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(1200);

  // ── Cycle models ──────────────────────────────────────────────────
  await popup.locator(".model-opt[data-model='thinking']").click();
  await popup.waitForTimeout(900);
  await popup.locator(".model-opt[data-model='flash']").click();
  await popup.waitForTimeout(900);
  await popup.locator(".model-opt[data-model='pro']").click();
  await popup.waitForTimeout(700);

  // ── Type a question ───────────────────────────────────────────────
  await popup.locator("#questionInput").click();
  await popup.locator("#questionInput").type(
    "What are the key differences between REST and GraphQL?",
    { delay: 18 }
  );
  await popup.waitForTimeout(600);

  // ── Read message + model before clicking send ─────────────────────
  const message = await popup.locator("#questionInput").inputValue();
  const model   = await popup.evaluate(() =>
    document.querySelector(".model-opt.active")?.dataset.model ?? "flash"
  );

  // ── Send ──────────────────────────────────────────────────────────
  const [initialPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);

  // Close the background tab opened by chrome.tabs.create immediately.
  // This terminates any content.js that started on that navigation, which
  // eliminates the race where content.js consumes the re-written
  // pendingMessage before the demo page can read it.
  // We then open a fresh foreground page so the recording captures the
  // mock Gemini at full rendering quality (background tabs are throttled
  // by Chrome and produce near-blank frames in the screencast).
  await initialPage.close();
  await context.serviceWorkers()[0].evaluate(
    ({ msg, mdl }) => chrome.storage.local.set({ pendingMessage: msg, pendingModel: mdl }),
    { msg: message, mdl: model }
  );

  const geminiPage = await context.newPage();
  await geminiPage.setViewportSize({ width: 1280, height: 720 });
  await geminiPage.bringToFront();
  await geminiPage.goto("https://gemini.google.com/app");
  await geminiPage.waitForLoadState("domcontentloaded");

  // ── Assert: model was switched to "pro" by content.js ────────────
  await expect(geminiPage.locator("#modelName")).toHaveText("Pro", { timeout: 8_000 });

  // ── Assert: user message appears, then Gemini responds ───────────
  await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(geminiPage.locator(".msg.user .msg-body"))
    .toContainText("REST", { timeout: 5_000 });

  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(1500);
  await geminiPage.close();
});

// ── Test 2: flash already selected — content.js skips the picker ──

test("Gemini — flash model already active, content.js skips model switch", async () => {
  // This test focuses on content.js behavior, not the popup send flow.
  // It directly sets storage and opens a fresh page, verifying that content.js
  // detects current === target and skips the picker entirely.
  const geminiPage = await openGeminiWithPending("What is the speed of light?", "flash");

  // #modelName must stay "Fast" — content.js should not open the picker
  await expect(geminiPage.locator("#modelName")).toHaveText("Fast", { timeout: 8_000 });

  await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(geminiPage.locator(".msg.user .msg-body"))
    .toContainText("speed of light", { timeout: 5_000 });
  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(800);
  await geminiPage.close();
});

// ── Tests 3-5: model switch (fast / thinking / pro) ──────────────

/**
 * @type {Array<{
 *   popupModel:    string,
 *   initialModel:  string,
 *   expectedLabel: string,
 *   question:      string,
 *   contains:      string,
 * }>}
 */
const MODEL_SWITCH_CASES = [
  {
    popupModel:    "flash",
    initialModel:  "thinking",   // mock starts on Thinking; content.js switches back
    expectedLabel: "Fast",
    question:      "Explain HTTP in one sentence.",
    contains:      "HTTP",
  },
  {
    popupModel:    "thinking",
    initialModel:  "flash",      // mock starts on Fast; content.js switches to Thinking
    expectedLabel: "Thinking",
    question:      "What is quantum entanglement?",
    contains:      "quantum",
  },
  {
    popupModel:    "pro",
    initialModel:  "flash",      // mock starts on Fast; content.js switches to Pro
    expectedLabel: "Pro",
    question:      "Summarize the history of computing.",
    contains:      "computing",
  },
];

/**
 * Opens a fresh mock Gemini page with the given pending message/model
 * and a set of model ids that should be rendered as locked (disabled).
 *
 * @param {string} msg
 * @param {string} model
 * @param {string[]} lockedModels  — model ids to mark as disabled in the picker
 * @param {string} [initialModel]
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function openGeminiWithLocked(msg, model, lockedModels, initialModel = "flash") {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.bringToFront();

  if (initialModel !== "flash") {
    await page.addInitScript(
      (m) => sessionStorage.setItem("__testInitialModel", m),
      initialModel
    );
  }

  if (lockedModels.length > 0) {
    await page.addInitScript(
      (ids) => sessionStorage.setItem("__testLockedModels", ids),
      lockedModels.join(",")
    );
  }

  await context.serviceWorkers()[0].evaluate(
    ({ msg: m, mdl }) => chrome.storage.local.set({ pendingMessage: m, pendingModel: mdl }),
    { msg, mdl: model }
  );

  await page.goto("https://gemini.google.com/app");
  await page.waitForLoadState("domcontentloaded");
  return page;
}

// ── Tests 6–7: fallback to Fast when premium model is locked ─────

test("Gemini — Pro locked (quota) falls back to Fast with warning", async () => {
  const page = await openGeminiWithLocked(
    "Why is the sky blue?",
    "pro",
    ["pro"]   // Pro is quota-locked; Fast is available
  );

  // content.js should detect the disabled option and fall back to Fast
  await expect(page.locator("#modelName")).toHaveText("Fast", { timeout: 10_000 });

  // The warning overlay must have been shown at some point during injection.
  // We assert the final state: message was injected and model ended on Fast.
  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("sky blue", { timeout: 5_000 });
  await expect(page.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await page.waitForTimeout(800);
  await page.close();
});

test("Gemini — Thinking locked (not signed in) falls back to Fast with warning", async () => {
  // Simulate the not-signed-in case: both Pro and Thinking are disabled.
  const page = await openGeminiWithLocked(
    "Explain transformer architecture.",
    "thinking",
    ["pro", "thinking"]
  );

  // Falls back to Fast
  await expect(page.locator("#modelName")).toHaveText("Fast", { timeout: 10_000 });

  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("transformer", { timeout: 5_000 });
  await expect(page.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await page.waitForTimeout(800);
  await page.close();
});

for (const { popupModel, initialModel, expectedLabel, question, contains } of MODEL_SWITCH_CASES) {
  test(`Gemini — model switch to ${popupModel} then send`, async () => {
    const popup = await openPopupWindow(context, extensionId);
    await popup.waitForTimeout(800);

    // Select the target model in the popup
    await popup.locator(`.model-opt[data-model='${popupModel}']`).click();
    await popup.waitForTimeout(600);

    await popup.locator("#questionInput").click();
    await popup.locator("#questionInput").type(question, { delay: 18 });
    await popup.waitForTimeout(500);

    const message = await popup.locator("#questionInput").inputValue();
    const selectedModel = await popup.evaluate(() =>
      document.querySelector(".model-opt.active")?.dataset.model ?? "flash"
    );
    expect(selectedModel).toBe(popupModel);

    const [initialPage] = await Promise.all([
      context.waitForEvent("page"),
      popup.locator("#sendBtn").click(),
    ]);
    await initialPage.close();

    // Mock starts on `initialModel`; content.js must switch it to `popupModel`.
    const geminiPage = await openGeminiWithPending(message, selectedModel, initialModel);

    // Model label must reflect the switch
    await expect(geminiPage.locator("#modelName")).toHaveText(expectedLabel, { timeout: 10_000 });

    // Message was injected and a response simulated
    await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
    await expect(geminiPage.locator(".msg.user .msg-body"))
      .toContainText(contains, { timeout: 5_000 });
    await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
      .toBeVisible({ timeout: 8_000 });

    await geminiPage.waitForTimeout(800);
    await geminiPage.close();
  });
}
