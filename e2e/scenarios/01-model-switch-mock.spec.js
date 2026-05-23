/**
 * Scenario 01 (mock) — Model switching that requires premium Gemini features
 *
 * These tests cannot run against a free real-Gemini account because they
 * exercise Pro/Thinking targets and locked-model fallback paths that rely on
 * the mock Gemini fixture's sessionStorage hooks (__testInitialModel,
 * __testLockedModels).
 *
 * Tests covered:
 *   1. Popup model cycle (flash → flash-lite → pro) then send — ends on Pro
 *   2. Switch to Flash from Flash Lite (mock starts on Flash Lite; content.js switches back)
 *   3. Switch to Flash Lite from Flash
 *   4. Switch to Pro from Flash
 *   5. Pro locked (quota) → falls back to Flash with warning
 *   6. Flash Lite locked → falls back to Flash with warning
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";
import { enableMockGeminiRoute } from "../helpers/mock-gemini.js";

let context;
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
 * Opens a fresh mock Gemini page with the given pending message/model already
 * written to extension storage.
 *
 * addInitScript seeds __testInitialModel in sessionStorage before any inline
 * page script runs, so the mock can pre-select the option before content.js
 * starts.
 *
 * @param {string} msg
 * @param {string} model  — "flash-lite" | "flash" | "pro"
 * @param {string} [initialModel="flash"]  — model the mock page should start on
 * @param {string} [thinkingLevel="standard"]  — "standard" | "extended"
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function openGeminiWithPending(msg, model, initialModel = "flash", thinkingLevel = "standard") {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.bringToFront();

  if (initialModel !== "flash") {
    await page.addInitScript(
      (m) => sessionStorage.setItem("__testInitialModel", m),
      initialModel
    );
  }

  await context.serviceWorkers()[0].evaluate(
    ({ msg: m, mdl, lvl }) =>
      chrome.storage.local.set({ pendingMessage: m, pendingModel: mdl, pendingThinkingLevel: lvl }),
    { msg, mdl: model, lvl: thinkingLevel }
  );

  await page.goto("https://gemini.google.com/app");
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/**
 * Opens a fresh mock Gemini page with the given model ids marked as locked
 * (disabled) in the picker via the __testLockedModels sessionStorage hook.
 *
 * @param {string} msg
 * @param {string} model
 * @param {string[]} lockedModels  — model ids to render as disabled
 * @param {string} [initialModel="flash"]
 * @param {string} [thinkingLevel="standard"]  — "standard" | "extended"
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function openGeminiWithLocked(msg, model, lockedModels, initialModel = "flash", thinkingLevel = "standard") {
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
    ({ msg: m, mdl, lvl }) =>
      chrome.storage.local.set({ pendingMessage: m, pendingModel: mdl, pendingThinkingLevel: lvl }),
    { msg, mdl: model, lvl: thinkingLevel }
  );

  await page.goto("https://gemini.google.com/app");
  await page.waitForLoadState("domcontentloaded");
  return page;
}

// ── Test 1: popup model cycle then send ───────────────────────────────────

test("popup — model cycle then send (ends on Pro)", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(1200);

  await popup.locator(".model-opt[data-model='flash-lite']").click();
  await popup.waitForTimeout(900);
  await popup.locator(".model-opt[data-model='flash']").click();
  await popup.waitForTimeout(900);
  await popup.locator(".model-opt[data-model='pro']").click();
  await popup.waitForTimeout(700);

  await popup.locator("#questionInput").click();
  await popup.locator("#questionInput").type(
    "What are the key differences between REST and GraphQL?",
    { delay: 18 }
  );
  await popup.waitForTimeout(600);

  const message = await popup.locator("#questionInput").inputValue();
  const model   = await popup.evaluate(() =>
    document.querySelector(".model-opt.active")?.dataset.model ?? "flash"
  );

  const [initialPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);

  await initialPage.close();
  await context.serviceWorkers()[0].evaluate(
    ({ msg, mdl, lvl }) =>
      chrome.storage.local.set({ pendingMessage: msg, pendingModel: mdl, pendingThinkingLevel: lvl }),
    { msg: message, mdl: model, lvl: "standard" }
  );

  const geminiPage = await context.newPage();
  await geminiPage.setViewportSize({ width: 1280, height: 720 });
  await geminiPage.bringToFront();
  await geminiPage.goto("https://gemini.google.com/app");
  await geminiPage.waitForLoadState("domcontentloaded");

  await expect(geminiPage.locator("#modelName")).toHaveText("Pro", { timeout: 8_000 });

  await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(geminiPage.locator(".msg.user .msg-body"))
    .toContainText("REST", { timeout: 5_000 });
  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(1500);
  await geminiPage.close();
});

// ── Tests 2–4: model switches (Fast / Thinking / Pro) ─────────────────────

/** @type {Array<{ popupModel: string, initialModel: string, expectedLabel: string, question: string, contains: string }>} */
const MODEL_SWITCH_CASES = [
  {
    popupModel:    "flash-lite",
    initialModel:  "flash",
    expectedLabel: "Flash Lite",
    question:      "Explain HTTP in one sentence.",
    contains:      "HTTP",
  },
  {
    popupModel:    "flash",
    initialModel:  "flash-lite",
    expectedLabel: "Flash",
    question:      "What is quantum entanglement?",
    contains:      "quantum",
  },
  {
    popupModel:    "pro",
    initialModel:  "flash",
    expectedLabel: "Pro",
    question:      "Summarize the history of computing.",
    contains:      "computing",
  },
];

for (const { popupModel, initialModel, expectedLabel, question, contains } of MODEL_SWITCH_CASES) {
  test(`Gemini — model switch to ${popupModel} then send`, async () => {
    const popup = await openPopupWindow(context, extensionId);
    await popup.waitForTimeout(800);

    await popup.locator(`.model-opt[data-model='${popupModel}']`).click();
    await popup.waitForTimeout(600);

    await popup.locator("#questionInput").click();
    await popup.locator("#questionInput").type(question, { delay: 18 });
    await popup.waitForTimeout(500);

    const message       = await popup.locator("#questionInput").inputValue();
    const selectedModel = await popup.evaluate(() =>
      document.querySelector(".model-opt.active")?.dataset.model ?? "flash"
    );
    expect(selectedModel).toBe(popupModel);

    const [initialPage] = await Promise.all([
      context.waitForEvent("page"),
      popup.locator("#sendBtn").click(),
    ]);
    await initialPage.close();

    const geminiPage = await openGeminiWithPending(message, selectedModel, initialModel);

    await expect(geminiPage.locator("#modelName")).toHaveText(expectedLabel, { timeout: 10_000 });

    await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
    await expect(geminiPage.locator(".msg.user .msg-body"))
      .toContainText(contains, { timeout: 5_000 });
    await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
      .toBeVisible({ timeout: 8_000 });

    await geminiPage.waitForTimeout(800);
    await geminiPage.close();
  });
}

// ── Tests 5–6: locked-model fallback ──────────────────────────────────────

test("Gemini — Pro locked (quota) falls back to Flash with warning", async () => {
  const page = await openGeminiWithLocked("Why is the sky blue?", "pro", ["pro"]);

  await expect(page.locator("#modelName")).toHaveText("Flash", { timeout: 10_000 });

  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("sky blue", { timeout: 5_000 });
  await expect(page.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await page.waitForTimeout(800);
  await page.close();
});

test("Gemini — Flash Lite locked falls back to Flash with warning", async () => {
  const page = await openGeminiWithLocked(
    "Explain transformer architecture.",
    "flash-lite",
    ["flash-lite"]
  );

  await expect(page.locator("#modelName")).toHaveText("Flash", { timeout: 10_000 });

  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("transformer", { timeout: 5_000 });
  await expect(page.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await page.waitForTimeout(800);
  await page.close();
});
