// ── content.js ───────────────────────────────────────────────
// Runs on gemini.google.com — reads any pending message from storage,
// optionally switches the model, then injects & submits.

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel"]);
  if (!data.pendingMessage) return;

  const message    = data.pendingMessage;
  const modelPref  = data.pendingModel || "flash"; // 'flash' | 'pro'
  await chrome.storage.local.remove(["pendingMessage", "pendingModel"]);

  // Give the SPA a moment to fully render before interacting
  await sleep(1200);

  // 1. Optionally switch model (best-effort; Gemini's DOM may vary)
  if (modelPref === "pro") {
    await trySelectModel("pro");
  }

  // 2. Inject text and submit
  const MAX_ATTEMPTS = 40;
  let attempts = 0;

  const tryInject = async () => {
    attempts++;

    // Gemini uses a shadow-DOM rich textarea — try several selectors
    const input =
      document.querySelector("rich-textarea div[contenteditable='true']") ||
      document.querySelector("div[contenteditable='true'][data-testid]") ||
      document.querySelector(".ql-editor") ||
      document.querySelector("div[contenteditable='true']");

    if (!input) {
      if (attempts < MAX_ATTEMPTS) setTimeout(tryInject, 300);
      return;
    }

    input.focus();
    input.innerHTML = "";

    const inserted = document.execCommand("insertText", false, message);

    if (!inserted || input.innerText.trim() !== message.trim()) {
      input.innerText = message;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await sleep(600);

    const sendBtn =
      document.querySelector('button[aria-label*="Send"]')            ||
      document.querySelector('button[aria-label*="send"]')            ||
      document.querySelector('button[data-mat-icon-name="send"]')     ||
      document.querySelector('button.send-button')                    ||
      document.querySelector('[jsname="Jt9E5"] button')               ||
      document.querySelector('button[jsaction*="send"]');

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true }));
      await sleep(50);
      input.dispatchEvent(new KeyboardEvent("keyup",  { key: "Enter", keyCode: 13, bubbles: true }));
    }
  };

  tryInject();
})();

// ── Model selector (best-effort) ──────────────────────────────────
async function trySelectModel(target) {
  // Attempt 1: look for a model chip / selector button in the toolbar
  const modelTriggerSelectors = [
    'button[aria-label*="model" i]',
    'button[data-test-id*="model" i]',
    '[class*="model-selector"] button',
    '[class*="ModelSelector"] button',
    'button[jsaction*="model" i]',
    'mat-select[aria-label*="model" i]',
  ];

  let triggerBtn = null;
  for (const sel of modelTriggerSelectors) {
    const el = document.querySelector(sel);
    if (el) { triggerBtn = el; break; }
  }

  if (!triggerBtn) return; // selector unavailable — proceed with default

  triggerBtn.click();
  await sleep(500);

  // Attempt 2: find the "Pro" / "Advanced" option in any open dropdown/menu
  const optionSelectors = [
    '[role="option"]',
    '[role="menuitem"]',
    '[role="listitem"]',
    'li[data-value]',
  ];

  const proTerms = ["pro", "advanced", "1.5 pro", "2.0 pro", "ultra"];

  for (const sel of optionSelectors) {
    const opts = document.querySelectorAll(sel);
    for (const opt of opts) {
      const label = opt.textContent.toLowerCase();
      if (proTerms.some(t => label.includes(t))) {
        opt.click();
        await sleep(400);
        return;
      }
    }
  }

  // If no Pro option found, close the dropdown (press Escape) and continue
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(200);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
