/**
 * Failure diagnostics for specs that drive their own persistent context.
 *
 * playwright.config `use.screenshot` only applies to the built-in page
 * fixture, so specs using launchExtension() get no screenshots on failure.
 * captureOnFailure() fills that gap: when a test fails it attaches, for every
 * open page (popup, Gemini tab, options…), a full-page PNG and an ARIA
 * snapshot. Both land in the test's output folder under e2e/videos/ and are
 * referenced from error-context.md.
 */

import fs from "fs";
import { test } from "@playwright/test";

/**
 * Registers an afterEach hook that captures every open page when a test fails.
 * Call once at the top level of a spec file, after the context is created.
 *
 * @param {() => import("@playwright/test").BrowserContext | undefined} getContext
 *   - returns the spec's current context (a getter, since it is set in beforeAll)
 * @returns {void}
 */
export function captureOnFailure(getContext) {
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const context = getContext();
    if (!context) return;

    const pages = context.pages().filter(p => !p.isClosed());
    for (const [i, page] of pages.entries()) {
      const label = `${i}-${safeName(page.url())}`;
      // Written to disk (outputPath) and attached by path — an in-memory
      // attachment would only reach reporters, and the list reporter drops it.
      const pngPath = testInfo.outputPath(`${label}.png`);
      const shot = await page.screenshot({ path: pngPath, fullPage: true, timeout: 5_000 }).catch(() => null);
      if (shot) await testInfo.attach(`${label}.png`, { path: pngPath, contentType: "image/png" });
      const aria = await page.locator("body").ariaSnapshot({ timeout: 5_000 }).catch(() => null);
      if (aria) {
        const ariaPath = testInfo.outputPath(`${label}.aria.yml`);
        fs.writeFileSync(ariaPath, `# ${page.url()}\n${aria}\n`);
        await testInfo.attach(`${label}.aria.yml`, { path: ariaPath, contentType: "text/yaml" });
      }
    }
  });
}

/**
 * Turns a URL into a short filesystem-safe label.
 * @param {string} url
 * @returns {string}
 */
function safeName(url) {
  return url.replace(/^[a-z-]+:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 50) || "blank";
}
