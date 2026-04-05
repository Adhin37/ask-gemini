/**
 * Scenario 04 — Options page
 * Opens the settings page and switches between:
 *   - History section (default)
 *   - Appearance section (switches theme to Dark then back to Auto)
 *   - Context Menu section (edits the summarize prefix)
 */

import { test } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 700 }));
});

test.afterAll(async () => {
  await context.close();
});

test("browse settings: appearance and context menu prefix", async () => {
  const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;

  const page = await context.newPage();
  await page.goto(optionsUrl);
  await page.waitForLoadState("domcontentloaded");

  // ── Step 1: History section (default view) ────────────────────────
  await page.waitForTimeout(1200);

  // ── Step 2: Navigate to Appearance ───────────────────────────────
  await page.locator(".nav-item[data-section='appearance']").click();
  await page.waitForTimeout(1000);

  // Switch to Dark theme
  await page.locator("#themeControl .seg-btn[data-value='dark']").click();
  await page.waitForTimeout(1200);

  // Switch back to Auto
  await page.locator("#themeControl .seg-btn[data-value='auto']").click();
  await page.waitForTimeout(800);

  // ── Step 3: Navigate to Context Menu ─────────────────────────────
  await page.locator(".nav-item[data-section='contextmenu']").click();
  await page.waitForTimeout(1000);

  // Edit the summarize prefix
  const prefixBox = page.locator("#summarizePrefixTextarea");
  await prefixBox.fill("Please summarize the following text in bullet points:");
  await page.waitForTimeout(900);

  // Save
  const saveBtn = page.locator("#summarizePrefixSaveBtn");
  await saveBtn.click();
  await page.waitForTimeout(1200);

  // ── Step 4: Navigate to About ─────────────────────────────────────
  await page.locator(".nav-item[data-section='about']").click();
  await page.waitForTimeout(1500);
});
