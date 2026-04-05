/**
 * Scenario 04 — Options page
 * Shows the settings page: History → Appearance (theme switch) → Context Menu.
 */

import { test } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";

let context;
let extensionId;

test.beforeAll(async ({ playwright }) => {
  ({ context, extensionId } = await launchExtension(playwright.chromium, { slowMo: 650 }));
});

test.afterAll(async () => {
  await context.close();
});

test("options page — appearance and context menu", async () => {
  const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;

  const page = await context.newPage();
  await page.goto(optionsUrl);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);

  // ── Appearance: switch Dark → Auto ───────────────────────────────
  await page.locator(".nav-item[data-section='appearance']").click();
  await page.waitForTimeout(900);

  await page.locator("#themeControl .seg-btn[data-value='dark']").click();
  await page.waitForTimeout(1200);

  await page.locator("#themeControl .seg-btn[data-value='auto']").click();
  await page.waitForTimeout(800);

  // ── Context Menu: edit the summarize prefix ───────────────────────
  await page.locator(".nav-item[data-section='contextmenu']").click();
  await page.waitForTimeout(900);

  await page.locator("#summarizePrefixTextarea").fill(
    "Please summarize the following text in bullet points:"
  );
  await page.waitForTimeout(700);

  await page.locator("#summarizePrefixSaveBtn").click();
  await page.waitForTimeout(1200);

  // ── About page ────────────────────────────────────────────────────
  await page.locator(".nav-item[data-section='about']").click();
  await page.waitForTimeout(1500);
});
