import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the Chrome executable path.
 * @returns {string|undefined}
 */
function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return undefined; // use Playwright's bundled Chromium
}

/**
 * Launches a persistent Chromium context with the extension loaded.
 * Videos are recorded to e2e/videos/ via recordVideo (use.video in
 * playwright.config only applies to the built-in page fixture, not
 * to contexts created manually with launchPersistentContext).
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm run build
 *
 * @param {import("@playwright/test").BrowserType} chromium
 * @param {object} [opts]
 * @param {number} [opts.slowMo=600]
 * @param {boolean} [opts.suppressWelcome=true] - Auto-close welcome tabs as they appear.
 *   Pass false in the welcome scenario so the test can open the page itself.
 * @returns {Promise<{ context: import("@playwright/test").BrowserContext, extensionId: string }>}
 */
export async function launchExtension(chromium, { slowMo = 600, suppressWelcome = true } = {}) {
  const extensionPath = path.resolve(__dirname, "../../");
  const profileDir    = process.env.CHROME_PROFILE
    || path.join(__dirname, "../.chrome-profile");
  const videosDir     = path.join(__dirname, "../videos");

  fs.mkdirSync(videosDir, { recursive: true });

  const launchOpts = {
    headless: false,
    slowMo,
    // Record every page in this context; videos are saved when context closes.
    // Size 1280×720 ensures all clips have a consistent resolution for stitching.
    recordVideo: {
      dir:  videosDir,
      size: { width: 1280, height: 720 },
    },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
    ],
  };

  const chromePath = resolveChromePath();
  if (chromePath) launchOpts.executablePath = chromePath;

  console.log("[e2e] extensionPath :", extensionPath);
  console.log("[e2e] profileDir     :", profileDir);
  console.log("[e2e] videosDir      :", videosDir);
  console.log("[e2e] executablePath :", launchOpts.executablePath ?? "(Playwright Chromium)");

  const context = await chromium.launchPersistentContext(profileDir, launchOpts);

  // Check already-registered workers first, then wait for the event.
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

  // Close any welcome tab opened by onInstalled (only fires on a fresh profile).
  // Also register a listener so any welcome tab that appears later in the test
  // run (e.g. from a service-worker restart) is dismissed automatically.
  // The welcome scenario passes suppressWelcome:false and opens the page itself.
  await new Promise(r => setTimeout(r, 1500));
  for (const p of context.pages()) {
    if (p.url().includes("welcome")) await p.close();
  }
  if (suppressWelcome) {
    context.on("page", async (page) => {
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 5_000 });
        if (page.url().includes("welcome")) await page.close();
      } catch { /* page already closed or navigated away */ }
    });
  }

  return { context, extensionId };
}
