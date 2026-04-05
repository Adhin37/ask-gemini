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
 * @returns {Promise<{ context: import("@playwright/test").BrowserContext, extensionId: string }>}
 */
export async function launchExtension(chromium, { slowMo = 600 } = {}) {
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

  // Close the welcome tab opened by background.js on first install.
  await new Promise(r => setTimeout(r, 1500));
  for (const p of context.pages()) {
    if (p.url().includes("welcome")) {
      await p.close();
    }
  }

  return { context, extensionId };
}
