/**
 * Scenario 03 (mock) — Upload failure simulation
 *
 * Tests the full upload-failure path in content.js using the mock Gemini
 * fixture. This test cannot run against real Gemini because Gemini's paste
 * handler creates upload chips for ALL image/* MIME types — there is no image
 * format that passes the popup's magic-bytes guard AND fails to produce a chip
 * on real Gemini.
 *
 * The mock fixture suppresses chip creation via the __testBlockUpload
 * sessionStorage flag (set via context.addInitScript before any page script
 * runs). With no chip appearing, waitForUploadChips in content.js times out
 * after 11 s, shows the "Image upload failed" error banner, and does NOT
 * submit the prompt — exercising the full failure path through the extension
 * pipeline:
 *
 *   popup UI → popup.js → content.js → mock Gemini
 *
 * Tests covered:
 *   1. content — upload failure: error banner shown, prompt NOT submitted
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";
import { openPopupWindow } from "../helpers/open-popup.js";
import { enableMockGeminiRoute } from "../helpers/mock-gemini.js";
import { buildAndDropImage } from "../helpers/images.js";
import { sendViaPopup } from "../helpers/real-gemini.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 650 }));
  await enableMockGeminiRoute(context);
  // Suppress chip creation on mock Gemini pages so waitForUploadChips times out.
  // addInitScript runs before any page script on every page in this context;
  // sessionStorage is per-origin so this does not affect the popup.
  await context.addInitScript(() =>
    sessionStorage.setItem("__testBlockUpload", "true")
  );
});

test.afterAll(async () => {
  await context.close();
});

// ── Test 1: upload failure — error banner shown, prompt NOT submitted ─────

test("content — upload failure: error banner shown, prompt NOT submitted", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(600);

  await buildAndDropImage(popup, "image/png", "test.png");
  await expect(popup.locator(".file-chip")).toBeVisible({ timeout: 6_000 });

  const MSG = "This should not be sent";
  await popup.locator("#questionInput").fill(MSG);
  await expect(popup.locator("#sendBtn")).not.toBeDisabled({ timeout: 3_000 });

  const { geminiPage } = await sendViaPopup(context, popup);

  try {
    // chip timeout = 11 000 ms; allow 4 s buffer
    await expect(geminiPage.getByText("Image upload failed"))
      .toBeVisible({ timeout: 15_000 });
    await expect(geminiPage.locator(".msg.user"))
      .not.toBeVisible({ timeout: 2_000 });
  } finally {
    await geminiPage.close().catch(() => {});
  }
});
