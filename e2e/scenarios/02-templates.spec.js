/**
 * Scenario 02 — Templates + send
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

test("popup — template dropdown and autocomplete", async () => {
  const popup = await openPopupWindow(context, extensionId);
  await popup.waitForTimeout(1000);

  // ── Template grid dropdown ────────────────────────────────────────
  await popup.locator("#tmplTriggerBtn").click();
  await popup.waitForTimeout(1200);
  // Hover first so the recording clearly shows "Summarize:" highlighted
  // before the click — without this, the cursor sits near the 3rd item
  // (from the trigger button position) and that item shows hover instead.
  await popup.locator(".tmpl-item").first().hover();
  await popup.waitForTimeout(600);
  await popup.locator(".tmpl-item").first().click();
  await popup.waitForTimeout(800);

  // After clicking the template, the input contains e.g. "Summarize: "
  // Verify this before continuing
  const afterTemplate = await popup.locator("#questionInput").inputValue();
  expect(afterTemplate.length).toBeGreaterThan(0);

  await popup.locator("#questionInput").type(
    "the history of the Eiffel Tower in 3 bullet points",
    { delay: 55 }
  );
  await popup.waitForTimeout(700);

  // ── "/" inline autocomplete ───────────────────────────────────────
  await popup.locator("#questionInput").fill("");
  await popup.locator("#questionInput").dispatchEvent("input");
  await popup.waitForTimeout(400);

  await popup.locator("#questionInput").type("/sum", { delay: 130 });

  // Wait until the AC strip is actually visible before pressing Tab —
  // avoids a race where Tab fires before the AC state machine activates.
  await popup.locator("#acStrip.visible").waitFor({ state: "attached", timeout: 5_000 });
  await popup.waitForTimeout(400);

  // Use locator.press() — targets the element directly via CDP,
  // unlike page.keyboard.press() which depends on OS window focus.
  await popup.locator("#questionInput").press("Tab");
  await popup.waitForTimeout(700);

  // Verify Tab was accepted: input should no longer start with "/"
  const afterAC = await popup.locator("#questionInput").inputValue();
  expect(afterAC).not.toMatch(/^\//);
  expect(afterAC.length).toBeGreaterThan(0);

  await popup.locator("#questionInput").type("recent AI breakthroughs", { delay: 60 });
  await popup.waitForTimeout(600);

  // ── Read before send ──────────────────────────────────────────────
  const message = await popup.locator("#questionInput").inputValue();
  expect(message.trim().length).toBeGreaterThan(0);

  const model = await popup.evaluate(() =>
    document.querySelector(".model-opt.active")?.dataset.model ?? "flash"
  );

  // ── Send ──────────────────────────────────────────────────────────
  const [geminiPage] = await Promise.all([
    context.waitForEvent("page"),
    popup.locator("#sendBtn").click(),
  ]);

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
    .toContainText("Summarize", { timeout: 5_000 });

  await expect(geminiPage.locator(".msg.gemini .msg-body:not(:has(.typing-dots))"))
    .toBeVisible({ timeout: 8_000 });

  await geminiPage.waitForTimeout(1500);
});
