import { expect } from "@playwright/test";

/**
 * Opens the extension popup as a real floating window (type: "popup"),
 * identical to clicking the toolbar icon.
 *
 * @param {import("@playwright/test").BrowserContext} context
 * @param {string} extensionId
 * @returns {Promise<import("@playwright/test").Page>}
 */
export async function openPopupWindow(context, extensionId) {
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;

  const [popup] = await Promise.all([
    context.waitForEvent("page", {
      predicate: p => p.url().includes("popup.html"),
      timeout: 10_000,
    }),
    context.serviceWorkers()[0].evaluate((url) => {
      chrome.windows.create({ url, type: "popup", width: 400, height: 640, focused: true });
    }, popupUrl),
  ]);

  await popup.waitForLoadState("domcontentloaded");
  // Wait for popup.js's async init to finish — it marks the stored thinking
  // level active and focuses the input as its last step. Before that the static
  // HTML is showing (Send enabled, default hint), so an early drop/assert
  // races the init under load.
  await popup.waitForFunction(() =>
    document.querySelector(".model-opt.active") !== null &&
    document.activeElement?.id === "questionInput"
  );
  await popup.waitForTimeout(300); // let entry animations settle for the recording
  return popup;
}

/**
 * Puts the popup into a known thinking-level state and waits until the UI
 * reflects it. Clicks only when the current state differs, so the result
 * never depends on what an earlier test left in storage.
 *
 * @param {import("@playwright/test").Page} popup
 * @param {{ level?: "low"|"medium"|"high" }} [opts]
 * @returns {Promise<void>}
 */
export async function configurePopup(popup, { level = "low" } = {}) {
  const levelBtn = popup.locator(`.model-opt[data-level='${level}']`);
  if (!(await levelBtn.getAttribute("class"))?.includes("active")) await levelBtn.click();
  await expect(levelBtn).toHaveClass(/\bactive\b/);
}
