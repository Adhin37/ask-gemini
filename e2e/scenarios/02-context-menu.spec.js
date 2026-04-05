/**
 * Scenario 02 — Context menu selection
 * Shows text selected on a page, then simulates what background.js does
 * after the "ask-gemini-selection" menu item is clicked: write pendingMessage
 * to storage and open a Gemini tab.
 *
 * (Chrome's native context menu cannot be triggered programmatically in
 * automated tests, so we drive the result directly via storage.)
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

test("context menu: select text and ask Gemini", async () => {
  const selectionText =
    "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars " +
    "in Paris, France. It was constructed between 1887 and 1889.";

  // ── Step 1: Open a page and visually highlight text ───────────────
  const page = await context.newPage();
  await page.setContent(`
    <!DOCTYPE html><html><body style="font:18px sans-serif;padding:40px;max-width:600px">
      <h2>Demo Page</h2>
      <p id="target">${selectionText}</p>
    </body></html>
  `);

  await page.evaluate(() => {
    const el = document.getElementById("target");
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });

  await page.waitForTimeout(1500); // pause so selection is visible

  // ── Step 2: Simulate what background.js writes after the menu click ─
  // background.js calls: chrome.storage.local.set({ pendingMessage, pendingModel })
  const message = `Summarize the following:\n\n${selectionText}`;
  await context.serviceWorkers()[0].evaluate(
    ({ msg, model }) => chrome.storage.local.set({ pendingMessage: msg, pendingModel: model }),
    { msg: message, model: "flash" }
  );

  // ── Step 3: Open mock Gemini (mimics tabs.create) ─────────────────
  const geminiPage = await context.newPage();
  await geminiPage.goto(MOCK_GEMINI_URL);
  await geminiPage.waitForFunction(() => window.__mockReady === true);

  // ── Step 4: Inject the content script ────────────────────────────
  await geminiPage.addScriptTag({ path: "src/content/content.min.js" });
  await geminiPage.waitForTimeout(2500);

  // ── Step 5: Hold on the result ────────────────────────────────────
  await geminiPage.waitForTimeout(2500);
});
