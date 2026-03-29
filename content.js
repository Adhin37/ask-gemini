// ── content.js ───────────────────────────────────────────────

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel"]);
  if (!data.pendingMessage) return;

  const message   = data.pendingMessage;
  const modelPref = data.pendingModel || "flash"; // 'flash' | 'pro' | 'thinking'
  await chrome.storage.local.remove(["pendingMessage", "pendingModel"]);

  // Let the SPA fully hydrate before we start poking the DOM
  await sleep(1200);

  // ── 1. Guarantee the right model is active ─────────────────────
  const modelConfirmed = await ensureModel(modelPref);

  if (!modelConfirmed) {
    console.warn(
      `[Ask Gemini] Could not confirm model "${modelPref}" after all retries.` +
      ` The page model may be different — proceeding with injection anyway.`
    );
  } else {
    console.info(`[Ask Gemini] Model confirmed: "${modelPref}"`);
  }

  // ── 2. Inject text and submit ───────────────────────────────────
  tryInject(message);
})();


// ══════════════════════════════════════════════════════════════════
// MODEL DETECTION
// ══════════════════════════════════════════════════════════════════

/**
 * Finds the model-selector trigger button and classifies its visible text.
 *
 * Returns 'flash' | 'pro' | 'thinking' | null.
 * null means the trigger was found but the text didn't match any known model,
 * OR the trigger wasn't found at all.
 */
function detectCurrentModel() {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return null;

  const label = triggerBtn.textContent.toLowerCase().trim();
  return classifyModelText(label);
}

/**
 * Maps a raw text string to one of our three model keys.
 *
 * Order matters: check 'thinking' before 'flash' so that
 * "Flash Thinking" is never misclassified as flash.
 */
function classifyModelText(text) {
  const t = text.toLowerCase();
  if (t.includes("think") || t.includes("reason"))          return "thinking";
  if (t.includes("pro") || t.includes("advanced"))          return "pro";
  if (t.includes("flash") || t.includes("gemini") ||
      t.includes("default") || t.includes("2.0") ||
      t.includes("1.5"))                                     return "flash";
  return null;
}

/**
 * Whether a dropdown option label matches the target model.
 * Handles "Flash Thinking" ≠ "Flash" disambiguation explicitly.
 */
function matchesTarget(optionText, target) {
  const t = optionText.toLowerCase();
  const hasThink = t.includes("think") || t.includes("reason");
  switch (target) {
    case "flash":
      // "Flash" yes, "Flash Thinking" no
      return t.includes("flash") && !hasThink;
    case "thinking":
      return hasThink;
    case "pro":
      // "Pro" / "Advanced" but not "Pro Thinking" variants
      return (t.includes("pro") || t.includes("advanced")) && !hasThink;
    default:
      return false;
  }
}

/**
 * Returns the trigger button that opens the model dropdown,
 * using the same multi-selector strategy as v1.3 but broadened.
 */
function findModelTrigger() {
  const selectors = [
    'button[aria-label*="model" i]',
    'button[data-test-id*="model" i]',
    '[class*="model-selector" i] button',
    '[class*="ModelSelector"] button',
    'mat-select[aria-label*="model" i]',
    'button[jsaction*="model" i]',
    // Gemini sometimes surfaces the current model as a chip/button in the toolbar
    '[data-model-id] button',
    'button[aria-haspopup="listbox"]',
    'button[aria-haspopup="menu"]',
  ];

  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const text = el.textContent.toLowerCase();
      // Only return elements that contain recognisable model vocabulary
      if (text.includes("flash") || text.includes("pro") ||
          text.includes("think") || text.includes("advanced") ||
          text.includes("gemini")) {
        return el;
      }
    }
  }
  return null;
}


// ══════════════════════════════════════════════════════════════════
// MODEL SWITCHING WITH VERIFICATION
// ══════════════════════════════════════════════════════════════════

/**
 * Main entry point for model management.
 *
 * Algorithm:
 *   for up to MAX_ATTEMPTS:
 *     1. detect current model
 *     2. if it matches target → done ✓
 *     3. if it doesn't (or detection failed) → attempt a DOM switch
 *     4. wait for the UI to settle, then loop back to step 1
 *
 * Returns true  if the model was confirmed correct at any point.
 * Returns false if we ran out of attempts without confirmation
 *              (caller proceeds anyway with a console warning).
 */
async function ensureModel(target) {
  const MAX_ATTEMPTS  = 4;
  const SETTLE_MS     = 700; // time after a click for the UI to update

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const current = detectCurrentModel();

    console.debug(
      `[Ask Gemini] ensureModel attempt ${attempt}/${MAX_ATTEMPTS}:` +
      ` current="${current}" target="${target}"`
    );

    if (current === target) {
      return true; // ✓ confirmed
    }

    // current === null means we couldn't read the model from the DOM.
    // On the last attempt, if we still can't detect anything, give up gracefully.
    if (current === null && attempt === MAX_ATTEMPTS) {
      return false;
    }

    // Attempt the switch and wait for the UI to settle before re-checking
    await performModelSwitch(target);
    await sleep(SETTLE_MS);
  }

  // Final check after the last switch attempt
  return detectCurrentModel() === target;
}

/**
 * Opens the model dropdown and clicks the option matching `target`.
 * Closes the dropdown gracefully if no match is found.
 */
async function performModelSwitch(target) {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) {
    console.debug("[Ask Gemini] performModelSwitch: trigger button not found");
    return;
  }

  triggerBtn.click();
  await sleep(500); // wait for dropdown animation

  // All plausible option container selectors
  const optionSelectors = [
    '[role="option"]',
    '[role="menuitem"]',
    '[role="listitem"]',
    'li[data-value]',
    '[class*="model-item" i]',
    '[class*="ModelOption"]',
  ];

  for (const sel of optionSelectors) {
    for (const opt of document.querySelectorAll(sel)) {
      if (matchesTarget(opt.textContent, target)) {
        console.debug(
          `[Ask Gemini] Clicking option: "${opt.textContent.trim()}" for target "${target}"`
        );
        opt.click();
        await sleep(400);
        return; // switch fired — let ensureModel() verify the result
      }
    }
  }

  // No matching option found — close the dropdown so the page isn't broken
  console.debug(`[Ask Gemini] No dropdown option found for "${target}" — closing`);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  await sleep(200);
}


// ══════════════════════════════════════════════════════════════════
// MESSAGE INJECTION & SUBMIT
// ══════════════════════════════════════════════════════════════════

async function tryInject(message) {
  const MAX_ATTEMPTS = 40;
  let attempts = 0;

  const attempt = async () => {
    attempts++;

    const input =
      document.querySelector("rich-textarea div[contenteditable='true']") ||
      document.querySelector("div[contenteditable='true'][data-testid]")  ||
      document.querySelector(".ql-editor")                                 ||
      document.querySelector("div[contenteditable='true']");

    if (!input) {
      if (attempts < MAX_ATTEMPTS) setTimeout(attempt, 300);
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
      document.querySelector('button[aria-label*="Send"]')     ||
      document.querySelector('button[aria-label*="send"]')     ||
      document.querySelector('button[data-mat-icon-name="send"]') ||
      document.querySelector('button.send-button')             ||
      document.querySelector('[jsname="Jt9E5"] button')        ||
      document.querySelector('button[jsaction*="send"]');

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true })
      );
      await sleep(50);
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true })
      );
    }
  };

  attempt();
}


// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }