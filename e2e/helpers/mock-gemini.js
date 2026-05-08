/**
 * Shared mock-Gemini route helper.
 *
 * Provides a single source of truth for the context.route() fulfillment
 * pattern that intercepts all https://gemini.google.com/** requests and
 * returns the local mock-gemini.html fixture.
 *
 * Used by the *-mock.spec.js scenario files that test behaviour which
 * cannot run against a free real-Gemini account (premium model switching,
 * locked-model fallback, upload-failure simulation).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * HTML body of the mock Gemini fixture, read once at module load.
 * @type {string}
 */
export const MOCK_HTML = fs.readFileSync(
  path.join(__dirname, "../fixtures/mock-gemini.html"),
  "utf8"
);

/**
 * Installs a context.route handler that fulfills every
 * https://gemini.google.com/** request with the local mock-gemini.html
 * fixture. Call once in beforeAll.
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @returns {Promise<void>}
 */
export async function enableMockGeminiRoute(context) {
  await context.route("https://gemini.google.com/**", route =>
    route.fulfill({ status: 200, contentType: "text/html", body: MOCK_HTML })
  );
}
