/**
 * Shared image fixtures for e2e tests.
 *
 * Provides:
 *   - A canvas-based DataTransfer builder whose bytes pass the popup's magic-bytes check
 *   - Drag-and-drop helpers for simulating file drops onto the popup
 */

/**
 * Builds a real image File wrapped in a DataTransfer inside the given page's
 * browser context. Uses canvas.toDataURL so the bytes pass the popup's
 * magic-bytes validation for PNG, JPEG, and WebP.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} mimeType  e.g. "image/png"
 * @param {string} filename  e.g. "test.png"
 * @returns {Promise<import("@playwright/test").JSHandle>}
 */
export async function buildImageDataTransfer(page, mimeType, filename) {
  return page.evaluateHandle(([mime, fname]) => {
    const canvas = document.createElement("canvas");
    canvas.width  = 4;
    canvas.height = 4;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#3366cc";
    ctx.fillRect(0, 0, 4, 4);
    const dataUrl = canvas.toDataURL(mime, 0.9);
    const b64     = dataUrl.split(",")[1];
    const raw     = atob(b64);
    const bytes   = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], fname, { type: mime }));
    return transfer;
  }, [mimeType, filename]);
}

/**
 * Simulates a drag-and-drop onto #inputWrapper in the popup by dispatching
 * dragenter → dragover → drop with the given DataTransfer handle.
 *
 * @param {import("@playwright/test").Page} popup
 * @param {import("@playwright/test").JSHandle} dataTransfer
 * @returns {Promise<void>}
 */
export async function dropImageOnPopup(popup, dataTransfer) {
  await popup.dispatchEvent("#inputWrapper", "dragenter", { dataTransfer });
  await popup.waitForTimeout(200);
  await popup.dispatchEvent("#inputWrapper", "dragover",  { dataTransfer });
  await popup.waitForTimeout(200);
  await popup.dispatchEvent("#inputWrapper", "drop",      { dataTransfer });
}

/**
 * Convenience wrapper: builds a canvas-generated image DataTransfer, drops it
 * on the popup, and disposes the handle — all in one step.
 *
 * @param {import("@playwright/test").Page} popup
 * @param {string} mimeType  e.g. "image/png"
 * @param {string} filename  e.g. "test.png"
 * @returns {Promise<void>}
 */
export async function buildAndDropImage(popup, mimeType, filename) {
  const dt = await buildImageDataTransfer(popup, mimeType, filename);
  await dropImageOnPopup(popup, dt);
  await dt.dispose();
}

