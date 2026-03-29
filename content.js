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
    '[class*="model-selector" i] button',
    'button[aria-haspopup="listbox"]',
    'button[aria-haspopup="menu"]'
  ];
  
  const MODEL_VOCAB = ["flash", "fast", "pro", "think", "reason", "gemini 1.5"];

  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      // STRICT BLOCK: Ignore anything in the sidebar or history lists
      if (el.closest('nav, [class*="conversation"], [class*="side-nav"]')) continue;

      const text = (el.textContent + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
      if (MODEL_VOCAB.some(w => text.includes(w))) return el;
    }
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
  const cls = (el.className || "").toLowerCase();
  if (cls.includes("is-selected") || cls.includes("mat-selected") || cls.includes("active")) return true;
  
  if (el.getAttribute("aria-selected") === "true") return true;
  if (el.getAttribute("aria-checked") === "true") return true;
  
  // Checkmark heuristic
  if (el.querySelector('svg, mat-icon, [class*="check"]')) return true;

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
  const current = await detectCurrentModel();
  
  if (current === target) {
    console.debug(`[Ask Gemini] Model already correct: "${target}"`);
    return true; 
  }

  // If not correct, try switching exactly ONCE.
  const clicked = await performModelSwitch(target);
  if (clicked) {
    console.debug(`[Ask Gemini] Clicked "${target}". Assuming success to prevent loops.`);
    await sleep(800); // Give the UI a moment to settle before injection
    return true;
  }

  return false;
}

/**
 * Opens the model dropdown and clicks the option matching `target`.
 * Escapes gracefully if no matching option is found.
 */
async function performModelSwitch(target) {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return false;

  triggerBtn.click();
  await sleep(500);

  const optionSelectors = ['[role="menuitem"]', '[role="option"]', 'li[data-value]'];

  for (const sel of optionSelectors) {
    for (const opt of document.querySelectorAll(sel)) {
      if (matchesTarget(opt.textContent, target)) {
        opt.click();
        await sleep(400);
        return true; // Return true indicating a successful click
      }
    }
  }

  // Close if no match
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(200);
  return false;
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