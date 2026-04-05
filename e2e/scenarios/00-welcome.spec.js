/**
 * Scenario 00 — Welcome page
 *
 * Opens the welcome page directly (navigating to the extension URL rather
 * than relying on the onInstalled trigger), verifies the key UI sections
 * are visible, then clicks "Start browsing" and asserts the tab closes.
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  // suppressWelcome:false — this scenario opens the welcome page itself,
  // so we must not have the auto-close listener active during this context.
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 500, suppressWelcome: false }));
});

test.afterAll(async () => {
  await context.close();
});

test("welcome page — renders and closes via Start browsing", async () => {
  const welcomeUrl = `chrome-extension://${extensionId}/src/welcome/welcome.html`;

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(welcomeUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500); // let entry animations settle

  // ── Assert key sections are rendered ─────────────────────────────
  await expect(page.locator(".hero-title")).toBeVisible();
  await expect(page.locator(".status-pill")).toBeVisible();
  await expect(page.locator(".feature-grid")).toBeVisible();
  await expect(page.locator("#closeWelcome")).toBeVisible();

  // Pause so the full welcome card is captured in the recording
  await page.waitForTimeout(2000);

  // ── Click "Start browsing" — tab should close itself ─────────────
  await Promise.all([
    page.waitForEvent("close"),
    page.locator("#closeWelcome").click(),
  ]);
});
