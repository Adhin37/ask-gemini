// ── content.js ────────────────────────────────────────────────────
// Runs on gemini.google.com — reads any pending message from storage
// and injects it into the Gemini input, then submits.

(async () => {
  const data = await chrome.storage.local.get("pendingMessage");
  if (!data.pendingMessage) return;

  const message = data.pendingMessage;
  await chrome.storage.local.remove("pendingMessage");

  const MAX_ATTEMPTS = 40;
  let attempts = 0;

  const tryInject = async () => {
    attempts++;

    // Gemini uses a shadow-DOM rich textarea; try several selectors
    const input =
      document.querySelector("rich-textarea div[contenteditable='true']") ||
      document.querySelector("div[contenteditable='true'][data-testid]") ||
      document.querySelector(".ql-editor") ||
      document.querySelector("div[contenteditable='true']");

    if (!input) {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(tryInject, 300);
      }
      return;
    }

    // Focus the input
    input.focus();

    // Clear any existing placeholder content
    input.innerHTML = "";

    // Insert text via execCommand (most reliable cross-browser approach for CE divs)
    const inserted = document.execCommand("insertText", false, message);

    // Fallback: manually fire the input event if execCommand didn't work
    if (!inserted || input.innerText.trim() !== message.trim()) {
      input.innerText = message;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Give React/Angular time to sync state
    await sleep(600);

    // Try to click the send button
    const sendBtn =
      document.querySelector('button[aria-label*="Send"]') ||
      document.querySelector('button[aria-label*="send"]') ||
      document.querySelector('button[data-mat-icon-name="send"]') ||
      document.querySelector('button.send-button') ||
      document.querySelector('[jsname="Jt9E5"] button') ||
      document.querySelector('button[jsaction*="send"]');

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      // Fallback: simulate Enter key
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true })
      );
      await sleep(50);
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true })
      );
    }
  };

  // Give the SPA a moment to fully render before injecting
  setTimeout(tryInject, 1200);
})();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
