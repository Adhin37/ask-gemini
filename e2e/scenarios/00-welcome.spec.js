/**
 * Scenario 00 — Welcome page
 *
 * Waits for the tab that onInstalled opens automatically, then verifies
 * the key UI sections are visible and closes via "Start browsing".
 * This also validates that the install trigger itself works correctly —
 * no manual navigation needed.
 */

import { test, expect } from "@playwright/test";
import { launchExtension } from "../helpers/extension.js";

let context;

test.beforeAll(async ({ playwright }) => {
  // suppressWelcome:false — the welcome tab must stay open so this test
  // can interact with it.
  ({ context } = await launchExtension(playwright.chromium, { slowMo: 500, suppressWelcome: false }));
});

test.afterAll(async () => {
  await context.close();
});

test("welcome page — opened by onInstalled, renders and closes via Start browsing", async () => {
  // onInstalled fires when the extension loads into a fresh profile and
  // opens the welcome tab automatically. Catch it here rather than
  // navigating manually — this validates the install trigger too.
  const existing = context.pages().find(p => p.url().includes("welcome"));
  const page = existing ?? await context.waitForEvent("page", {
    predicate: p => p.url().includes("welcome"),
    timeout: 10_000,
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.bringToFront();
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
