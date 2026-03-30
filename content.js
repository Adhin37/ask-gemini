// ── content.js ───────────────────────────────────────────────

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel"]);
  if (!data.pendingMessage) return;

  const message   = data.pendingMessage;
  const modelPref = data.pendingModel || "flash";
  await chrome.storage.local.remove(["pendingMessage", "pendingModel"]);

  // ── 1. Wait for the model trigger button ───────────────────────
  const ready = await waitForElement(() => findModelTrigger(), 10_000);

  if (!ready) {
    console.warn("[Ask Gemini] Model trigger not found after 10 s — skipping model check");
    await injectMessage(message);
    return;
  }

  // ── 2. Guarantee the correct model is active ───────────────────
  const confirmed = await ensureModel(modelPref);
  if (!confirmed) {
    console.warn(
      `[Ask Gemini] Could not confirm model "${modelPref}" after switch. Proceeding anyway.`
    );
  } else {
    console.info(`[Ask Gemini] ✓ Model confirmed: "${modelPref}"`);
  }

  // ── 3. Inject the message and submit ───────────────────────────
  await injectMessage(message);
})();


// ══════════════════════════════════════════════════════════════════
// CORE OBSERVER UTILITIES
// ══════════════════════════════════════════════════════════════════

/**
 * Waits until `getter()` returns a truthy value, using a MutationObserver
 * to avoid busy-polling. Falls back to a timeout.
 *
 * @param {() => Element|null} getter  — Called on every DOM mutation and once immediately.
 * @param {number}             timeoutMs
 * @param {Element}            [root=document.body]  — Subtree to observe.
 * @returns {Promise<Element|null>}
 */
function waitForElement(getter, timeoutMs = 10_000, root = document.body) {
  return new Promise((resolve) => {
    // Check synchronously first — element may already be present.
    const el = getter();
    if (el) { resolve(el); return; }

    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    const observer = new MutationObserver(() => {
      const el = getter();
      if (el) finish(el);
    });

    observer.observe(root, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ["aria-disabled", "disabled", "contenteditable", "class", "tabindex"],
    });
  });
}

/**
 * Waits until `predicate()` returns true, re-evaluated on every mutation
 * inside `root`. Useful for watching attribute changes on a known element.
 *
 * @param {() => boolean} predicate
 * @param {number}        timeoutMs
 * @param {Element}       [root=document.body]
 * @returns {Promise<boolean>}
 */
function waitForCondition(predicate, timeoutMs = 5_000, root = document.body) {
  return new Promise((resolve) => {
    if (predicate()) { resolve(true); return; }

    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    const observer = new MutationObserver(() => {
      if (predicate()) finish(true);
    });

    observer.observe(root, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ["aria-disabled", "disabled", "class", "tabindex"],
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// WAIT FOR MODEL TRIGGER
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the model-picker trigger button using its stable data-test-id.
 */
function findModelTrigger() {
  return (
    document.querySelector('button[data-test-id="bard-mode-menu-button"]') ||
    document.querySelector('button[aria-label="Open mode picker"]')         ||
    null
  );
}

/**
 * Reads the active model directly from the button label without opening the
 * dropdown. Returns 'flash' | 'pro' | 'thinking' | null.
 */
function readModelFromButton() {
  const btn = findModelTrigger();
  if (!btn) return null;

  const container =
    btn.querySelector('[data-test-id="logo-pill-label-container"]') ||
    btn.querySelector('.logo-pill-label-container');

  const span = container
    ? Array.from(container.querySelectorAll('span')).find(
        s => s.textContent.trim() && !s.querySelector('mat-icon')
      )
    : null;

  const text = span ? span.textContent.trim() : btn.textContent.trim();
  console.debug('[Ask Gemini] readModelFromButton:', JSON.stringify(text));
  return classifyModelText(text);
}


// ══════════════════════════════════════════════════════════════════
// MODEL CLASSIFICATION
// ══════════════════════════════════════════════════════════════════

function classifyModelText(text) {
  const t = text.toLowerCase();
  if (t.includes("think") || t.includes("reason"))               return "thinking";
  if (t.includes("pro")   || t.includes("advanced"))             return "pro";
  if (t.includes("flash") || t.includes("fast") ||
      t.includes("quick") || t.includes("gemini") ||
      t.includes("default") || t.includes("2.") ||
      t.includes("1.5"))                                          return "flash";
  return null;
}

function matchesTarget(optionText, target) {
  const t        = optionText.toLowerCase();
  const hasThink = t.includes("think") || t.includes("reason");
  const hasPro   = t.includes("pro")   || t.includes("advanced");

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
// MODEL DETECTION — button-text primary, dropdown fallback
// ══════════════════════════════════════════════════════════════════

async function detectCurrentModel() {
  // Fast path — read without touching the dropdown.
  const quick = readModelFromButton();
  if (quick) {
    console.debug(`[Ask Gemini] detectCurrentModel (fast path) → "${quick}"`);
    return quick;
  }

  // Slow path — open dropdown, inspect selected option.
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return null;

  triggerBtn.click();

  // Wait for at least one option to appear in the DOM.
  const OPTION_SELECTORS = [
    '[role="option"]', '[role="menuitem"]', '[role="listitem"]',
    'li[data-value]',  '[class*="model-item" i]',
  ];
  const anyOption = () => OPTION_SELECTORS.some(s => document.querySelector(s));

  await waitForCondition(anyOption, 2_000);

  let detected = null;
  for (const sel of OPTION_SELECTORS) {
    for (const opt of document.querySelectorAll(sel)) {
      if (isSelectedOption(opt)) {
        detected = classifyModelText(opt.textContent);
        break;
      }
    }
    if (detected) break;
  }

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  // Wait for dropdown to collapse.
  await waitForCondition(
    () => !OPTION_SELECTORS.some(s => document.querySelector(s)),
    1_000
  );

  if (detected === null) detected = readModelFromButton();
  console.debug(`[Ask Gemini] detectCurrentModel (slow path) → "${detected}"`);
  return detected;
}

function isSelectedOption(el) {
  if (el.getAttribute("aria-selected") === "true") return true;
  if (el.getAttribute("aria-checked")  === "true") return true;

  const cls = (el.className || "").toLowerCase();
  if (cls.includes("selected") || cls.includes("active") || cls.includes("focused")) return true;

  // Gemini renders a check icon only on the active model option.
  if (el.querySelector('mat-icon, svg, .icon, [class*="icon"]') !== null) return true;

  return false;
}


// ══════════════════════════════════════════════════════════════════
// MODEL SWITCHING WITH VERIFY
// ══════════════════════════════════════════════════════════════════

/**
 * Ensures the correct model is active.
 * 1. Read label (zero-cost).
 * 2. If wrong, open dropdown, click target.
 * 3. Wait for button label to update (MutationObserver), then verify.
 */
async function ensureModel(target) {
  const current = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel: current="${current}" target="${target}"`);

  if (current === target) {
    console.info("[Ask Gemini] Model already correct — no switch needed.");
    return true;
  }

  await performModelSwitch(target);

  // Wait for the button label text to change to the target model.
  const btn = findModelTrigger();
  const labelContainer = btn
    ? btn.querySelector('[data-test-id="logo-pill-label-container"]') ||
      btn.querySelector('.logo-pill-label-container') ||
      btn
    : document.body;

  const switched = await waitForCondition(
    () => readModelFromButton() === target,
    3_000,
    labelContainer
  );

  const after = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel after switch: "${after}" (observer resolved: ${switched})`);
  return after === target;
}

/**
 * Opens the model dropdown and clicks the option matching `target`.
 */
async function performModelSwitch(target) {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) {
    console.debug("[Ask Gemini] performModelSwitch: trigger not found");
    return;
  }

  triggerBtn.click();

  const OPTION_SELECTORS = [
    '[role="option"]', '[role="menuitem"]', '[role="listitem"]',
    'li[data-value]',  '[class*="model-item" i]',
  ];

  // Wait for options to appear in the DOM.
  await waitForElement(
    () => OPTION_SELECTORS.reduce((found, s) => found || document.querySelector(s), null),
    2_000
  );

  for (const sel of OPTION_SELECTORS) {
    for (const opt of document.querySelectorAll(sel)) {
      if (matchesTarget(opt.textContent, target)) {
        console.debug(`[Ask Gemini] Clicking: "${opt.textContent.trim()}" for target="${target}"`);
        opt.click();
        return;
      }
    }
  }

  // No match — close the dropdown cleanly.
  console.debug(`[Ask Gemini] No option matched "${target}" — closing dropdown`);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}


// ══════════════════════════════════════════════════════════════════
// MESSAGE INJECTION & SUBMIT
// ══════════════════════════════════════════════════════════════════

/**
 * Waits for the contenteditable input, injects `message`, then waits
 * for the send button to become enabled before clicking it.
 * All waits use MutationObserver — no fixed timeouts.
 */
async function injectMessage(message) {
  // ── Find the textarea ─────────────────────────────────────────
  const input = await waitForElement(
    () =>
      document.querySelector("rich-textarea div.ql-editor[contenteditable='true']") ||
      document.querySelector("rich-textarea div[contenteditable='true']")           ||
      document.querySelector("div.ql-editor[contenteditable='true']")               ||
      document.querySelector("div[contenteditable='true'][aria-label]"),
    10_000
  );

  if (!input) {
    console.error("[Ask Gemini] Input field not found within timeout.");
    return;
  }

  // ── Inject text ───────────────────────────────────────────────
  input.focus();
  input.innerHTML = "";

  const inserted = document.execCommand("insertText", false, message);

  if (!inserted || input.innerText.trim() !== message.trim()) {
    input.innerText = message;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ── Wait for send button to become active ─────────────────────
  // From the DOM: aria-disabled flips from "true" → "false" once Gemini's
  // Angular state detects the non-empty input.
  const inputArea =
    input.closest('[data-node-type="input-area"]') ||
    input.closest(".input-area")                   ||
    document.body;

  const sendBtn = await waitForElement(
    () => {
      const btn = findSendButton(input);
      return btn && btn.getAttribute("aria-disabled") !== "true" && !btn.disabled
        ? btn
        : null;
    },
    5_000,
    inputArea
  );

  if (sendBtn) {
    console.debug(
      "[Ask Gemini] Clicking send button:",
      sendBtn.getAttribute("aria-label") || sendBtn.className
    );
    sendBtn.click();
  } else {
    // Keyboard fallback — dispatch Enter without bubbles to avoid sidebar handlers.
    console.debug("[Ask Gemini] Send button not ready — using keyboard fallback");
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: false, cancelable: true })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup",   { key: "Enter", keyCode: 13, bubbles: false })
    );
  }
}

/**
 * Walks UP from the input element to find a send button that shares the same
 * toolbar/input-area ancestor. This prevents accidentally clicking sidebar buttons.
 *
 * Selectors derived from the actual Gemini DOM snapshot:
 *   - button.send-button.submit[aria-label="Send message"]
 *   - data-mat-icon-name="send" inside the button
 */
function findSendButton(inputEl) {
  const SEND_SELECTORS = [
    'button.send-button[aria-label="Send message"]',
    'button.send-button',
    'button[aria-label="Send message"]',
    'button[aria-label*="Send" i].submit',
    'button.submit[aria-label*="Send" i]',
  ];

  let node = inputEl.parentElement;
  while (node && node !== document.body) {
    for (const sel of SEND_SELECTORS) {
      const btn = node.querySelector(sel);
      if (btn && btn.getAttribute("aria-disabled") !== "true" && !btn.disabled) {
        console.debug("[Ask Gemini] findSendButton: found via", sel);
        return btn;
      }
    }
    node = node.parentElement;
  }

  return null;
}