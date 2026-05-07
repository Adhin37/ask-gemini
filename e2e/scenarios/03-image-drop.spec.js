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
  const [initialPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);

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

  // ── Assert ────────────────────────────────────────────────────────
  await expect(geminiPage.locator(".msg.user")).toBeVisible({ timeout: 10_000 });
  await expect(geminiPage.locator(".msg.user .msg-body"))
    .toContainText("Describe", { timeout: 5_000 });

  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(1500);
});

// ══════════════════════════════════════════════════════════════════════════════
// Content-script upload scenarios (storage injection — no popup required)
// ══════════════════════════════════════════════════════════════════════════════

// Reuse the same 1×1 PNG from the popup test (PNG bytes labelled as webp for the
// webp test — content.js only uses the MIME type, not the actual pixel data).
const PNG_FILE  = { name: "test.png",      type: "image/png",  size: 67, data: `data:image/png;base64,${PNG_B64}`  };
const WEBP_FILE = { name: "shopping.webp", type: "image/webp", size: 67, data: `data:image/webp;base64,${PNG_B64}` };
const JPEG_FILE = { name: "photo.jpg",     type: "image/jpeg", size: 67, data: `data:image/jpeg;base64,${PNG_B64}` };

/**
 * Injects pendingMessage + pendingFiles into extension storage via the SW,
 * optionally blocks upload chips (failure-path simulation), then opens and
 * returns a fresh mock Gemini page.
 *
 * @param {import("@playwright/test").BrowserContext} ctx
 * @param {{ message: string, files?: object[], blockUpload?: boolean }} opts
 * @returns {Promise<import("@playwright/test").Page>}
 */
async function injectFilesAndLoadGemini(ctx, { message, files = [], blockUpload = false }) {
  await ctx.serviceWorkers()[0].evaluate(
    ({ msg, fls }) =>
      chrome.storage.local.set({ pendingMessage: msg, pendingModel: "flash", pendingFiles: fls }),
    { msg: message, fls: files }
  );

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  if (blockUpload) {
    // Runs before page script — mock reads this flag in its "change" listener
    await page.addInitScript(() => sessionStorage.setItem("__testBlockUpload", "true"));
  }

  await page.goto("https://gemini.google.com/app");
  await page.waitForLoadState("domcontentloaded");
  return page;
}

test("content — PNG upload: chip detected, prompt submitted to mock Gemini", async () => {
  const page = await injectFilesAndLoadGemini(context, {
    message: "Describe what you see in this image",
    files:   [PNG_FILE],
  });

  // Prompt should reach the chat area
  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("Describe", { timeout: 5_000 });

  // No error banner
  await expect(page.getByText("Image upload failed")).not.toBeVisible();

  await page.close();
});

test("content — upload failure: error banner shown, prompt NOT submitted", async () => {
  // __testBlockUpload prevents the mock from creating input-media-card chips,
  // so waitForUploadChips() times out and content.js shows the error banner.
  const page = await injectFilesAndLoadGemini(context, {
    message:     "This should not be sent",
    files:       [PNG_FILE],
    blockUpload: true,
  });

  // Error banner must appear (waitForUploadChips timeout = 8s + 3s per file = 11s)
  await expect(page.getByText("Image upload failed"))
    .toBeVisible({ timeout: 15_000 });

  // Prompt must NOT reach the chat area
  await expect(page.locator(".msg.user")).not.toBeVisible();

  await page.close();
});

test("content — WebP upload: file-input path handles image/webp correctly", async () => {
  // WebP was the originally reported failing format. The file-input primary path
  // (added as the root-cause fix) bypasses Gemini's paste-handler MIME filter,
  // so WebP should upload and submit exactly like PNG.
  const page = await injectFilesAndLoadGemini(context, {
    message: "What is in this image?",
    files:   [WEBP_FILE],
  });

  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("What is in this image", { timeout: 5_000 });
  await expect(page.getByText("Image upload failed")).not.toBeVisible();

  await page.close();
});

test("content — JPEG upload: chip detected, prompt submitted to mock Gemini", async () => {
  const page = await injectFilesAndLoadGemini(context, {
    message: "Analyse this photo",
    files:   [JPEG_FILE],
  });

  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("Analyse", { timeout: 5_000 });
  await expect(page.getByText("Image upload failed")).not.toBeVisible();

  await page.close();
});

test("content — multi-file upload: 2 images, both chips detected, prompt submitted", async () => {
  const page = await injectFilesAndLoadGemini(context, {
    message: "Compare these two images",
    files:   [PNG_FILE, WEBP_FILE],
  });

  await expect(page.locator(".msg.user")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator(".msg.user .msg-body"))
    .toContainText("Compare", { timeout: 5_000 });
  await expect(page.getByText("Image upload failed")).not.toBeVisible();

  await page.close();
});
