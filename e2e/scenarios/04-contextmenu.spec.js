/**
 * Scenario 04 — Context menu: select text → Ask Gemini
 *
 * Demonstrates the right-click "Ask Gemini: …" flow:
 *   1. Open a mock article page.
 *   2. Triple-click a paragraph to select it (visually highlighted).
 *   3. Right-click to show the native Chrome context menu (extension item visible).
 *   4. Trigger the Ask Gemini action via the service worker — replicating exactly
 *      what background.js does when the menu item is clicked (we cannot drive
 *      the native OS menu via Playwright, so this is the standard workaround).
 *   5. Assert the message lands on the mock Gemini page.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchExtension } from "../helpers/extension.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_GEMINI  = fs.readFileSync(path.join(__dirname, "../fixtures/mock-gemini.html"),  "utf8");
const MOCK_ARTICLE = fs.readFileSync(path.join(__dirname, "../fixtures/mock-article.html"), "utf8");

// The paragraph whose text we'll select — must match the #target-paragraph in
// the fixture so the assertion below stays in sync.
const ARTICLE_URL = "https://techread.example.com/ai-assistants";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 650 }));

  context.route(ARTICLE_URL, route =>
    route.fulfill({ status: 200, contentType: "text/html", body: MOCK_ARTICLE })
  );
  context.route("https://gemini.google.com/**", route =>
    route.fulfill({ status: 200, contentType: "text/html", body: MOCK_GEMINI })
  );
});

test.afterAll(async () => {
  await context.close();
});

test("context menu — select text then Ask Gemini", async () => {
  // ── 1. Open the mock article ──────────────────────────────────────
  const article = await context.newPage();
  await article.setViewportSize({ width: 1280, height: 720 });
  await article.goto(ARTICLE_URL);
  await article.waitForLoadState("domcontentloaded");
  await article.waitForTimeout(1000);

  // ── 2. Triple-click to select the target paragraph ────────────────
  const para = article.locator("#target-paragraph");
  await para.click({ clickCount: 3 });
  await article.waitForTimeout(900); // let selection highlight settle in recording

  // ── 3. Read the selected text from the DOM ────────────────────────
  const selectionText = await article.evaluate(() => window.getSelection()?.toString().trim() ?? "");
  expect(selectionText.length).toBeGreaterThan(0);

  // ── 4. Right-click to surface the native context menu ─────────────
  // This makes "Ask Gemini: …" visible in the recording. Playwright cannot
  // click native OS menus, so we dismiss it and trigger the action manually.
  await para.click({ button: "right" });
  await article.waitForTimeout(1400); // pause so viewer sees the menu

  // Dismiss the native context menu before we open a new tab
  await article.keyboard.press("Escape");
  await article.waitForTimeout(300);

  // ── 5. Trigger Ask Gemini via the service worker ──────────────────
  // Replicates background.js dispatchToGemini: write storage then open tab.
  // Default flow (no prompt engineering): summarizePrefix + "\n\n" + selection.
  const message = `Summarize the following:\n\n${selectionText}`;

  const [initialPage] = await Promise.all([
    context.waitForEvent("page"),
    context.serviceWorkers()[0].evaluate(
      ({ msg, mdl }) => chrome.storage.local
        .set({ pendingMessage: msg, pendingModel: mdl })
        .then(() => chrome.tabs.create({ url: "https://gemini.google.com/app" })),
      { msg: message, mdl: "flash" }
    ),
  ]);

  // Close the background tab from chrome.tabs.create to stop any in-flight
  // content.js, then re-write storage so the fresh foreground page has a
  // clean read (guards against content.js having already consumed it).
  await initialPage.close();
  await context.serviceWorkers()[0].evaluate(
    ({ msg, mdl }) => chrome.storage.local.set({ pendingMessage: msg, pendingModel: mdl }),
    { msg: message, mdl: "flash" }
  );

  const geminiPage = await context.newPage();
  await geminiPage.setViewportSize({ width: 1280, height: 720 });
  await geminiPage.bringToFront();
  await geminiPage.goto("https://gemini.google.com/app");
  await geminiPage.waitForLoadState("domcontentloaded");

  // ── 6. Assert message injected into mock Gemini ───────────────────
  await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(geminiPage.locator(".msg.user .msg-body"))
    .toContainText("Summarize", { timeout: 5_000 });

  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(1500);
});
