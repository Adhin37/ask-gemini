/**
 * Scenario 04 — Context menu: select text → Ask Gemini (real Gemini)
 *
 * Demonstrates the right-click "Ask Gemini: …" flow against the live
 * gemini.google.com UI:
 *   1. Open a mock article page (article fixture stays mocked — it's unrelated
 *      to the Gemini DOM; only the Gemini route is now live).
 *   2. Triple-click a paragraph to select it (visually highlighted).
 *   3. Right-click to show the native Chrome context menu (extension item visible).
 *   4. Trigger the Ask Gemini action via the service worker — replicating exactly
 *      what background.js does when the menu item is clicked (Playwright cannot
 *      drive the native OS menu, so this is the standard workaround).
 *   5. Assert the message lands in the real Gemini conversation.
 *
 * Uses the default e2e/.chrome-profile. Test skips gracefully via skipIfNotReady()
 * when not signed in.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchExtension } from "../helpers/extension.js";
import {
  skipIfNotReady,
  closeGeminiTabs,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_ARTICLE = fs.readFileSync(path.join(__dirname, "../fixtures/mock-article.html"), "utf8");

const ARTICLE_URL = "https://techread.example.com/ai-assistants";

let context;

test.beforeAll(async ({ playwright }) => {
  ({ context } = await launchExtension(playwright.chromium, { slowMo: 650 }));

  // Article page stays mocked — it's a synthetic fixture with a known
  // #target-paragraph. Gemini is NOT mocked; it uses the live UI.
  context.route(ARTICLE_URL, route =>
    route.fulfill({ status: 200, contentType: "text/html", body: MOCK_ARTICLE })
  );
});

test.afterAll(async () => {
  await context.close();
});

test("context menu — select text then Ask Gemini", async () => {
  // ── 1. Open the mock article ───────────────────────────────────────
  const article = await context.newPage();
  await article.setViewportSize({ width: 1280, height: 720 });
  await article.goto(ARTICLE_URL);
  await article.waitForLoadState("domcontentloaded");
  await article.waitForTimeout(1000);

  // ── 2. Triple-click to select the target paragraph ─────────────────
  const para = article.locator("#target-paragraph");
  await para.click({ clickCount: 3 });
  await article.waitForTimeout(900);

  // ── 3. Read the selected text from the DOM ─────────────────────────
  const selectionText = await article.evaluate(() => window.getSelection()?.toString().trim() ?? "");
  expect(selectionText.length).toBeGreaterThan(0);

  // ── 4. Right-click to surface the native context menu ──────────────
  // This makes "Ask Gemini: …" visible in the recording. Playwright cannot
  // click native OS menus, so we dismiss it and trigger the action manually.
  await para.click({ button: "right" });
  await article.waitForTimeout(1400);

  await article.keyboard.press("Escape");
  await article.waitForTimeout(300);

  // ── 5. Trigger Ask Gemini via the service worker ────────────────────
  // Replicates background.js dispatchToGemini: write storage then open tab.
  const message = `Summarize the following:\n\n${selectionText}`;

  await closeGeminiTabs(context);

  const logs = [];
  const [geminiPage] = await Promise.all([
    context.waitForEvent("page", { timeout: 25_000 }),
    context.serviceWorkers()[0].evaluate(
      ({ msg, mdl }) => chrome.storage.local
        .set({ pendingMessage: msg, pendingModel: mdl })
        .then(() => chrome.tabs.create({ url: "https://gemini.google.com/app" })),
      { msg: message, mdl: "flash" }
    ),
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

  await skipIfNotReady(geminiPage);

  // ── 6. Assert message injected into real Gemini ────────────────────
  try {
    // Use a stable substring of the message — the full string includes a
    // newline which can complicate getByText matching across DOM elements.
    await assertMessageOnGemini(geminiPage, "Summarize the following");
  } finally {
    console.info("[04] context menu — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});
