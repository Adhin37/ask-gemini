// ── content.js ───────────────────────────────────────────────

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel"]);
  if (!data.pendingMessage) return;

  const message   = data.pendingMessage;
  const modelPref = data.pendingModel || "flash"; // 'flash' | 'pro' | 'thinking'
  await chrome.storage.local.remove(["pendingMessage", "pendingModel"]);

  // ── 1. Wait for the page to be ready (trigger button present) ──
  const ready = await waitForModelTrigger(10_000);
  if (!ready) {
    // Page didn't render a model selector in time — inject anyway
    console.warn("[Ask Gemini] Model trigger not found after 10 s — skipping model check");
    tryInject(message);
    return;
  }

  // ── 2. Guarantee the correct model is active ───────────────────
  const confirmed = await ensureModel(modelPref);

  if (!confirmed) {
    console.warn(
      `[Ask Gemini] Could not confirm model "${modelPref}" after retries.` +
      ` Proceeding with injection anyway.`
    );
  } else {
    console.info(`[Ask Gemini] ✓ Model confirmed: "${modelPref}"`);
  }

  // ── 3. Inject the message and submit ───────────────────────────
  tryInject(message);
})();


// ══════════════════════════════════════════════════════════════════
// WAIT FOR MODEL TRIGGER
// ══════════════════════════════════════════════════════════════════

/**
 * Polls until findModelTrigger() returns a button, or `timeoutMs` elapses.
 * Returns the button element, or null on timeout.
 */
async function waitForModelTrigger(timeoutMs = 10_000) {
  const POLL_MS  = 250;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const btn = findModelTrigger();
    if (btn) return btn;
    await sleep(POLL_MS);
  }
  return null;
}

/**
 * Returns the button that opens Gemini's model-selection dropdown.
 * Must contain recognisable model vocabulary (avoids false positives).
 */
function findModelTrigger() {
  const selectors = [
    'button[aria-label*="model" i]',
    'button[data-test-id*="model" i]',
    '[class*="model-selector" i] button',
    '[class*="ModelSelector"] button',
    'mat-select[aria-label*="model" i]',
    'button[jsaction*="model" i]',
    '[data-model-id] button',
    'button[aria-haspopup="listbox"]',
    'button[aria-haspopup="menu"]',
  ];

  // Vocabulary that must appear in the button's text for it to qualify
  const MODEL_VOCAB = ["flash", "fast", "pro", "think", "reason", "advanced", "gemini", "quick"];

  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const text = el.textContent.toLowerCase();
      if (MODEL_VOCAB.some(w => text.includes(w))) return el;
    }
  }

  // Last-resort: any button whose aria-label or title smells like a model picker
  for (const el of document.querySelectorAll("button")) {
    const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
    if (MODEL_VOCAB.some(w => label.includes(w))) return el;
  }

  return null;
}


// ══════════════════════════════════════════════════════════════════
// MODEL CLASSIFICATION
// ══════════════════════════════════════════════════════════════════

/**
 * Maps a raw text string to one of our three model keys.
 *
 * "thinking" is checked FIRST so "Flash Thinking" is never misread as flash.
 * "fast" / "quick" / "answers quickly" are the real labels Gemini currently
 * uses for its default model — Gemini shows "Fast" not "Flash".
 */
function classifyModelText(text) {
  const t = text.toLowerCase();
  if (t.includes("think") || t.includes("reason"))               return "thinking";
  if (t.includes("pro") || t.includes("advanced"))               return "pro";
  if (t.includes("flash") || t.includes("fast") ||
      t.includes("quick") || t.includes("gemini") ||
      t.includes("default") || t.includes("2.") ||
      t.includes("1.5"))                                          return "flash";
  return null;
}

/**
 * Whether a dropdown option's text matches the desired target.
 * Handles "Flash Thinking" ≠ "Flash" and "Fast" = "Flash" explicitly.
 */
function matchesTarget(optionText, target) {
  const t = optionText.toLowerCase();
  const hasThink = t.includes("think") || t.includes("reason");
  const hasPro = t.includes("pro") || t.includes("advanced");

  switch (target) {
    case "flash":
      return (t.includes("flash") || t.includes("fast") || t.includes("quick")) && !hasThink && !hasPro;
    case "thinking":
      return hasThink;
    case "pro":
      return hasPro;
    default:
      return false;
  }
}


// ══════════════════════════════════════════════════════════════════
// MODEL DETECTION — dropdown-first, trigger-text fallback
// ══════════════════════════════════════════════════════════════════

/**
 * Returns 'flash' | 'pro' | 'thinking' | null.
 *
 * Strategy:
 *  1. Open the model dropdown.
 *  2. Scan all options for a "selected" marker:
 *       a. aria-selected="true"
 *       b. aria-checked="true"
 *       c. A Material Design selection class (mat-selected, mat-active, …)
 *       d. A child element that looks like a checkmark / tick icon
 *         (Gemini renders a filled-circle check SVG next to the active model)
 *  3. Classify the winning option's text.
 *  4. Close the dropdown.
 *  5. Fall back to reading the trigger button's text directly if step 2
 *     found nothing (trigger may surface the model name as text on some
 *     Gemini versions).
 */
async function detectCurrentModel() {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return null;

  // If the button already displays the target, don't bother opening the menu.
  const initialText = classifyModelText(triggerBtn.textContent);
  if (initialText) {
    console.debug(`[Ask Gemini] Trigger already shows: "${initialText}"`);
  }

  // ── Open the dropdown ──────────────────────────────────────────
  triggerBtn.click();
  await sleep(550);

  let detected = null;

  const optionRoots = [
    '[role="option"]',
    '[role="menuitem"]',
    '[role="listitem"]',
    'li[data-value]',
    '[class*="model-item" i]',
    '[class*="ModelOption"]',
  ];

  outer: for (const sel of optionRoots) {
    for (const opt of document.querySelectorAll(sel)) {
      if (isSelectedOption(opt)) {
        detected = classifyModelText(opt.textContent);
        break outer;
      }
    }
  }

  // ── Close the dropdown ─────────────────────────────────────────
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(250);

  // ── Fallback: read trigger button text ─────────────────────────
  if (detected === null) {
    detected = classifyModelText(triggerBtn.textContent);
  }

  console.debug(`[Ask Gemini] detectCurrentModel → "${detected}"`);
  return detected;
}

/**
 * Heuristics for identifying the "selected" option inside Gemini's dropdown.
 *
 * Gemini (Angular/Material) marks the active item with at least one of:
 *   • aria-selected="true"
 *   • aria-checked="true"
 *   • class containing "selected", "active", or "mat-selected"
 *   • A child SVG / element whose class suggests a checkmark/tick
 *     (Gemini renders a filled-circle ✓ as an SVG next to the active model;
 *      other options don't have that child, so child-count differs)
 */
function isSelectedOption(el) {
  if (el.getAttribute("aria-selected") === "true") return true;
  if (el.getAttribute("aria-checked") === "true") return true;

  const cls = (el.className || "").toLowerCase();
  if (cls.includes("selected") || cls.includes("active") || cls.includes("focused")) return true;

  // Gemini usually renders a 'check' or 'radio_button_checked' icon only for the active model.
  const hasCheckIcon = el.querySelector('mat-icon, svg, .icon, [class*="icon"]') !== null;
  
  // In many Gemini versions, the UNSELECTED items have no SVG/Icon, 
  // while the SELECTED item has one.
  if (hasCheckIcon) return true;

  return false;
}


// ══════════════════════════════════════════════════════════════════
// MODEL SWITCHING WITH VERIFY LOOP
// ══════════════════════════════════════════════════════════════════

/**
 * Detect → compare → switch → verify, up to MAX_ATTEMPTS rounds.
 * Returns true if the correct model is confirmed at any point.
 */
async function ensureModel(target) {
  const MAX_ATTEMPTS = 3;
  const SETTLE_MS    = 800;

  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const current = await detectCurrentModel();

    console.debug(`[Ask Gemini] ensureModel (${i}/${MAX_ATTEMPTS}): current="${current}" target="${target}"`);

    if (current === target) return true;

    // Couldn't detect on last attempt — give up
    if (current === null && i === MAX_ATTEMPTS) return false;

    await performModelSwitch(target);
    await sleep(SETTLE_MS);
  }

  // One last check after the final switch
  const final = await detectCurrentModel();
  return final === target;
}

/**
 * Opens the model dropdown and clicks the option matching `target`.
 * Escapes gracefully if no matching option is found.
 */
async function performModelSwitch(target) {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) {
    console.debug("[Ask Gemini] performModelSwitch: trigger not found");
    return;
  }

  triggerBtn.click();
  await sleep(500);

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
        console.debug(`[Ask Gemini] Clicking: "${opt.textContent.trim()}" for target="${target}"`);
        opt.click();
        await sleep(400);
        return;
      }
    }
  }

  // No match — close dropdown to leave page clean
  console.debug(`[Ask Gemini] No option matched "${target}" — closing dropdown`);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
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
      document.querySelector('button[aria-label*="Send"]')        ||
      document.querySelector('button[aria-label*="send"]')        ||
      document.querySelector('button[data-mat-icon-name="send"]') ||
      document.querySelector('button.send-button')                ||
      document.querySelector('[jsname="Jt9E5"] button')           ||
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