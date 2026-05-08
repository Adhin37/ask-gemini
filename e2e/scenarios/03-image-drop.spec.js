/**
 * Scenario 03 — Drag & drop image + send (real Gemini)
 *
 * Uses the default e2e/.chrome-profile. Tests 1–2 are popup-only and always run.
 * Tests 3–6 skip gracefully via skipIfNotReady() when not signed in.
 *
 * Tests covered:
 *   1. popup — too-large image rejected with error, not added to chip list
 *   2. popup — non-image file rejected with error, not added to chip list
 *   3. real Gemini — PNG upload via popup: image chip detected, prompt sent
 *   4. real Gemini — WebP upload via popup: image chip detected, prompt sent
 *   5. real Gemini — JPEG upload via popup: image chip detected, prompt sent
 *   6. real Gemini — multi-file upload (PNG + WebP) via popup: both chips detected
 *
 * Key assertion strategy:
 *   • page.getByText(message) — the message text appears in Gemini's user
 *     bubble after submission, regardless of DOM class names.
 *   • page.getByText("Image upload failed") must NOT be visible — this is
 *     the error banner injected by content.js when waitForUploadChips times out.
 *
 * If a test fails with "Image upload failed" visible:
 *   → UPLOAD_CHIP_SELECTORS in content.js doesn't match Gemini's current DOM.
 *   → Open Gemini, attach a file manually, run in DevTools:
 *       [...document.querySelectorAll('img[src^="blob:"]')]
 *     Confirm which selector from UPLOAD_CHIP_SELECTORS matches, or add a new one.
 *
 * The upload-failure path (chip timeout → error banner → no submit) is covered
 * by 03-image-drop-mock.spec.js, which uses the mock Gemini fixture.
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";
import {
  skipIfNotReady,
  closeGeminiTabs,
  sendViaPopup,
  sendImageViaPopup,
  assertMessageOnGemini,
} from "../helpers/real-gemini.js";
import { buildAndDropImage } from "../helpers/images.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 400 }));
});

test.afterAll(async () => {
  await context.close();
});

// ── Test 1: too-large file rejected (popup-only, no Gemini) ───────────────

test("popup — too-large image rejected with error, not added to chip list", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(600);

  // 5 MB buffer with valid PNG magic bytes — passes MIME check, fails size check
  const dt = await popup.evaluateHandle(() => {
    const bytes = new Uint8Array(5 * 1024 * 1024);
    bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const blob = new Blob([bytes], { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "huge.png", { type: "image/png" }));
    return transfer;
  });

  await popup.dispatchEvent("#inputWrapper", "drop", { dataTransfer: dt });
  await dt.dispose();

  await expect(popup.locator("#hint")).toContainText("exceeds 4 MB", { timeout: 3_000 });
  await expect(popup.locator(".file-chip")).not.toBeVisible();
  await expect(popup.locator("#sendBtn")).toBeDisabled({ timeout: 2_000 });

  await popup.close();
});

// ── Test 2: non-image file rejected (popup-only, no Gemini) ───────────────

test("popup — non-image file rejected with error, not added to chip list", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(600);

  const dt = await popup.evaluateHandle(() => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "notes.txt", { type: "text/plain" }));
    return transfer;
  });

  await popup.dispatchEvent("#inputWrapper", "drop", { dataTransfer: dt });
  await dt.dispose();

  await expect(popup.locator("#hint")).toContainText("is not an image", { timeout: 3_000 });
  await expect(popup.locator(".file-chip")).not.toBeVisible();
  await expect(popup.locator("#sendBtn")).toBeDisabled({ timeout: 2_000 });

  await popup.close();
});

// ── Tests 3–5: single-file uploads via popup ──────────────────────────────

test("real Gemini — PNG upload via popup: image chip detected, prompt sent", async () => {
  const MSG = "e2e PNG upload test — what do you see in this image?";
  const { geminiPage, logs } = await sendImageViaPopup(
    context, extensionId, { mimeType: "image/png", filename: "test.png", message: MSG }
  );

  await skipIfNotReady(geminiPage);

  try {
    await assertMessageOnGemini(geminiPage, MSG);
  } finally {
    console.info("[03] PNG upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});

test("real Gemini — WebP upload via popup: image chip detected, prompt sent", async () => {
  const MSG = "e2e WebP upload test — describe this image";
  const { geminiPage, logs } = await sendImageViaPopup(
    context, extensionId, { mimeType: "image/webp", filename: "photo.webp", message: MSG }
  );

  await skipIfNotReady(geminiPage);

  try {
    await assertMessageOnGemini(geminiPage, MSG);
  } finally {
    console.info("[03] WebP upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});

test("real Gemini — JPEG upload via popup: image chip detected, prompt sent", async () => {
  const MSG = "e2e JPEG upload test — what colour is this image?";
  const { geminiPage, logs } = await sendImageViaPopup(
    context, extensionId, { mimeType: "image/jpeg", filename: "photo.jpg", message: MSG }
  );

  await skipIfNotReady(geminiPage);

  try {
    await assertMessageOnGemini(geminiPage, MSG);
  } finally {
    console.info("[03] JPEG upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});

// ── Test 6: multi-file upload (PNG + WebP) via popup ─────────────────────

test("real Gemini — multi-file upload (PNG + WebP) via popup: both chips detected", async () => {
  await closeGeminiTabs(context);

  const popup = await openPopupWindow(context, extensionId);

  // Drop PNG — first chip
  await buildAndDropImage(popup, "image/png", "photo.png");
  await expect(popup.locator(".file-chip")).toBeVisible({ timeout: 6_000 });

  // Drop WebP — second chip
  await buildAndDropImage(popup, "image/webp", "photo.webp");
  await expect(popup.locator(".file-chip")).toHaveCount(2, { timeout: 6_000 });

  const MSG = "e2e multi-file upload test — describe both images";
  await popup.locator("#questionInput").fill(MSG);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  const { geminiPage, logs } = await sendViaPopup(context, popup);
  await skipIfNotReady(geminiPage);

  try {
    await assertMessageOnGemini(geminiPage, MSG);
  } finally {
    console.info("[03] multi-file upload — content.js logs:", logs.length ? logs : "(none captured)");
    await geminiPage.close().catch(() => {});
  }
});

