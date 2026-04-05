/**
 * Scenario 01 — Popup query
 * Opens the extension popup, types a question, and sends it.
 * The mock Gemini page receives the injected text and shows a reply.
 */

import { test } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { startMockServer, stopMockServer, MOCK_GEMINI_URL } from "../helpers/mock-server.js";

let context;
let extensionId;
let mockServer;

test.beforeAll(async ({ playwright }) => {
  mockServer = await startMockServer();
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 700 }));
});

test.afterAll(async () => {
  await context.close();
  await stopMockServer(mockServer);
});

test("send a question from the popup to mock Gemini", async () => {
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

  // ── Step 1: Open popup at real popup dimensions (360 × 580) ─────
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 580 });
  await popup.goto(popupUrl);
  await popup.waitForLoadState("domcontentloaded");

  // ── Step 2: Type a question ───────────────────────────────────────
  const input = popup.locator("#questionInput");
  await input.click();
  await input.type("What is the capital of France?", { delay: 60 });

  // ── Step 3: Click the send button ────────────────────────────────
  // Intercept tabs.create so we control where it navigates
  await context.route("https://gemini.google.com/**", route => route.abort());

  const [geminiPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);

  // Navigate to mock instead of real Gemini
  await geminiPage.goto(MOCK_GEMINI_URL);
  await geminiPage.waitForFunction(() => window.__mockReady === true);

  // ── Step 4: Inject content script and wait for text ───────────────
  await geminiPage.addScriptTag({ path: "src/content/content.min.js" });
  await geminiPage.waitForTimeout(2000);

  // ── Step 5: Pause to show the result ─────────────────────────────
  await geminiPage.waitForTimeout(2500);
});
