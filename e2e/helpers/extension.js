import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Launches a persistent Chromium context with the extension loaded.
 *
 * By default uses Playwright's own Chromium — the only engine where
 * chrome.runtime service-worker events are reliably exposed via CDP.
 * Set CHROME_PATH to override with a system Chrome binary (experimental).
 *
 * Prerequisites:
 *   npx playwright install chromium   (one-time download)
 *   npm run build                      (produces *.min.js)
 *
 * @param {import("@playwright/test").BrowserType} chromium
 * @param {object} [opts]
 * @param {number} [opts.slowMo=600]
 * @returns {Promise<{ context: import("@playwright/test").BrowserContext, extensionId: string }>}
 */
export async function launchExtension(chromium, { slowMo = 600 } = {}) {
  const extensionPath = path.resolve(__dirname, "../../");
  const profileDir    = process.env.CHROME_PROFILE
    || path.join(__dirname, "../.chrome-profile");

  // Only pass executablePath when explicitly overridden.
  // Without it, Playwright uses its bundled Chromium which has full CDP
  // support for extension service workers.
  const launchOpts = {
    headless: false,
    slowMo,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
    ],
  };
  if (process.env.CHROME_PATH) {
    launchOpts.executablePath = process.env.CHROME_PATH;
  }

  console.log("[e2e] extensionPath :", extensionPath);
  console.log("[e2e] profileDir     :", profileDir);
  console.log("[e2e] executablePath :", launchOpts.executablePath ?? "(Playwright Chromium)");

  const context = await chromium.launchPersistentContext(profileDir, launchOpts);

  // Check already-registered workers first (they may have fired before we
  // attached), then fall back to waiting for the event.
  let sw = context.serviceWorkers().find(w => w.url().includes("background"));
  if (!sw) {
    try {
      sw = await context.waitForEvent("serviceworker", { timeout: 15_000 });
    } catch {
      await context.close();
      throw new Error(
        "Extension service worker did not register.\n" +
        "Run: npx playwright install chromium\n" +
        "And: npm run build"
      );
    }
  }

  const extensionId = sw.url().split("/")[2];
  console.log("[e2e] extensionId   :", extensionId);

  // Close the welcome tab that background.js opens on first install.
  // Give it a moment to appear, then close any page matching the welcome URL.
  await new Promise(r => setTimeout(r, 1500));
  for (const p of context.pages()) {
    if (p.url().includes("welcome")) {
      await p.close();
    }
  }

  return { context, extensionId };
}
