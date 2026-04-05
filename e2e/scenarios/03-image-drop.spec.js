/**
 * Scenario 03 — Drag & drop image + send
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_HTML  = fs.readFileSync(path.join(__dirname, "../fixtures/mock-gemini.html"), "utf8");

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" +
  "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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

test("popup — drag & drop image then send", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(1000);

  // ── Build DataTransfer in the browser context ─────────────────────
  const dataTransfer = await popup.evaluateHandle((b64) => {
    const dt  = new DataTransfer();
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    dt.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
    return dt;
  }, PNG_B64);

  // ── dragenter → visual highlight ──────────────────────────────────
  await popup.dispatchEvent("#inputWrapper", "dragenter", { dataTransfer });
  await popup.waitForTimeout(1000);
  await popup.dispatchEvent("#inputWrapper", "dragover",  { dataTransfer });
  await popup.waitForTimeout(400);

  // ── drop → file chip ──────────────────────────────────────────────
  await popup.dispatchEvent("#inputWrapper", "drop", { dataTransfer });
  await dataTransfer.dispose();

  // Assert chip appeared before continuing
  await expect(popup.locator(".file-chip")).toBeVisible({ timeout: 5_000 });
  await popup.waitForTimeout(1000);

  // ── Type question ─────────────────────────────────────────────────
  await popup.locator("#questionInput").click();
  await popup.locator("#questionInput").type(
    "Describe what you see in this image",
    { delay: 18 }
  );
  await popup.waitForTimeout(600);

  // ── Read before send ──────────────────────────────────────────────
  const message = await popup.locator("#questionInput").inputValue();
  const model   = await popup.evaluate(() =>
    document.querySelector(".model-opt.active")?.dataset.model ?? "flash"
  );

  // ── Send ──────────────────────────────────────────────────────────
  const [geminiPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);

  await geminiPage.goto("about:blank");
  await context.serviceWorkers()[0].evaluate(
    ({ msg, mdl }) => chrome.storage.local.set({ pendingMessage: msg, pendingModel: mdl }),
    { msg: message, mdl: model }
  );

  await geminiPage.goto("https://gemini.google.com/app");
  await geminiPage.bringToFront();
  await geminiPage.waitForLoadState("domcontentloaded");

  // ── Assert ────────────────────────────────────────────────────────
  await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(geminiPage.locator(".msg.user .msg-body"))
    .toContainText("Describe", { timeout: 5_000 });

  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(1500);
});
