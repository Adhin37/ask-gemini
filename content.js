// ── content.js v1.3 ───────────────────────────────────────────────
// Runs on gemini.google.com — reads pending message + model pref,
// optionally switches model, then injects & submits.

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel"]);
  if (!data.pendingMessage) return;

  const message   = data.pendingMessage;
  const modelPref = data.pendingModel || "flash"; // 'flash' | 'pro' | 'thinking'
  await chrome.storage.local.remove(["pendingMessage", "pendingModel"]);

  // Give the SPA a moment to fully render
  await sleep(1200);

  // 1. Best-effort model switch (only for pro / thinking)
  if (modelPref !== "flash") {
    await trySelectModel(modelPref);
  }

  // 2. Inject text and submit
  const MAX_ATTEMPTS = 40;
  let attempts = 0;

  const tryInject = async () => {
    attempts++;

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
      document.querySelector('button[aria-label*="Send"]') ||
      document.querySelector('button[aria-label*="send"]') ||
      document.querySelector('button[data-mat-icon-name="send"]') ||
      document.querySelector('button.send-button') ||
      document.querySelector('[jsname="Jt9E5"] button') ||
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
  // Terms to look for in dropdown options per model
  const targetTerms = {
    pro:      ["pro", "advanced", "1.5 pro", "2.0 pro", "2.5 pro"],
    thinking: ["think", "reasoning", "deep think", "flash thinking"],
  };
  const terms = targetTerms[target] || [];
  if (terms.length === 0) return;

  // Try to open a model selector button
  const triggerSelectors = [
    'button[aria-label*="model" i]',
    'button[data-test-id*="model" i]',
    '[class*="model-selector"] button',
    '[class*="ModelSelector"] button',
    'mat-select[aria-label*="model" i]',
    'button[jsaction*="model" i]',
  ];

  let triggerBtn = null;
  for (const sel of triggerSelectors) {
    const el = document.querySelector(sel);
    if (el) { triggerBtn = el; break; }
  }
  if (!triggerBtn) return;

  triggerBtn.click();
  await sleep(500);

  // Find the matching option in any open dropdown/menu
  const optionSelectors = ['[role="option"]', '[role="menuitem"]', '[role="listitem"]', 'li[data-value]'];
  for (const sel of optionSelectors) {
    for (const opt of document.querySelectorAll(sel)) {
      const label = opt.textContent.toLowerCase();
      if (terms.some(t => label.includes(t))) {
        opt.click();
        await sleep(400);
        return;
      }
    }
  }

  // No match — close dropdown gracefully
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(200);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }