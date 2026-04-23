/**
 * Scenario 01 — Model switcher + send
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
});
