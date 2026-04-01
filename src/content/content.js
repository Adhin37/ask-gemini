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
 * @param {() => Element|null} getter
 * @param {number}             timeoutMs
 * @param {Element}            [root=document.body]
 * @returns {Promise<Element|null>}
 */
function waitForElement(getter, timeoutMs = 10_000, root = document.body) {
  return new Promise((resolve) => {
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
 * Waits until `predicate()` returns true, re-evaluated on every mutation.
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
// MODEL TRIGGER
// ══════════════════════════════════════════════════════════════════

function findModelTrigger() {
  return (
    document.querySelector('button[data-test-id="bard-mode-menu-button"]') ||
    document.querySelector('button[aria-label="Open mode picker"]')         ||
    null
  );
}

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
// MODEL DETECTION
// ══════════════════════════════════════════════════════════════════

async function detectCurrentModel() {
  const quick = readModelFromButton();
  if (quick) {
    console.debug(`[Ask Gemini] detectCurrentModel (fast path) → "${quick}"`);
    return quick;
  }

  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return null;

  triggerBtn.click();

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

  if (el.querySelector('mat-icon, svg, .icon, [class*="icon"]') !== null) return true;

  return false;
}


// ══════════════════════════════════════════════════════════════════
// MODEL SWITCHING WITH VERIFY
// ══════════════════════════════════════════════════════════════════

async function ensureModel(target) {
  const current = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel: current="${current}" target="${target}"`);

  if (current === target) {
    console.info("[Ask Gemini] Model already correct — no switch needed.");
    return true;
  }

  await performModelSwitch(target);

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

  console.debug(`[Ask Gemini] No option matched "${target}" — closing dropdown`);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}


// ══════════════════════════════════════════════════════════════════
// MESSAGE INJECTION & SUBMIT
// ══════════════════════════════════════════════════════════════════

/**
 * Sends the injection outcome back to the service worker so it can
 * update the toolbar badge. Uses sendMessage — the SW is guaranteed
 * awake at this point because it just wrote pendingMessage to storage
 * and opened this tab, so no keepalive is needed.
 */
function reportResult(success) {
  try {
    chrome.runtime.sendMessage({ type: "injectionResult", success });
  } catch (err) {
    // Extension was reloaded mid-injection — not actionable.
    console.warn("[Ask Gemini] reportResult: could not send —", err.message);
  }
}

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
    reportResult(false);
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
    reportResult(true);
  } else {
    // Keyboard fallback — dispatch Enter without bubbles to avoid sidebar handlers.
    console.debug("[Ask Gemini] Send button not ready — using keyboard fallback");
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: false, cancelable: true })
    );
    input.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: false })
    );
    // Keyboard fallback is still a best-effort submit — report success.
    reportResult(true);
  }
}

/* istanbul ignore next — test hook, never runs inside the real extension */
if (typeof globalThis !== "undefined" && globalThis.__TEST__) {
  Object.assign(globalThis.__TEST__, { classifyModelText, matchesTarget, waitForElement, waitForCondition });
}

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