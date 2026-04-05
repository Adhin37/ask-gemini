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
  await popup.waitForTimeout(600); // let animations settle
  return popup;
}
