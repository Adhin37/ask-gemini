// ── content.js ───────────────────────────────────────────────

// ── Status overlay ────────────────────────────────────────────
let _statusEl   = null;
let _cancelSpin = null;

/**
 * Creates (or updates) the floating status overlay and sets its label text.
 * @param {string} msg
 */
function showStatus(msg) {
  if (!_statusEl) {
    _statusEl = document.createElement("div");
    Object.assign(_statusEl.style, {
      position:      "fixed",
      top:           "20px",
      left:          "50%",
      transform:     "translateX(-50%)",
      zIndex:        "2147483647",
      display:       "flex",
      alignItems:    "center",
      gap:           "10px",
      background:    "rgba(20, 16, 54, 0.92)",
      color:         "#ede9ff",
      padding:       "11px 20px",
      borderRadius:  "999px",
      fontSize:      "13px",
      fontWeight:    "500",
      fontFamily:    "'Google Sans', sans-serif",
      border:        "1px solid rgba(167,139,250,0.35)",
      boxShadow:     "0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(167,139,250,0.1)",
      backdropFilter: "blur(8px)",
      opacity:       "0",
      transition:    "opacity 0.2s ease",
      pointerEvents: "none",
      userSelect:    "none",
      whiteSpace:    "nowrap",
    });

    const spinner = document.createElement("span");
    Object.assign(spinner.style, {
      width:        "14px",
      height:       "14px",
      border:       "2px solid rgba(167,139,250,0.25)",
      borderTop:    "2px solid #a78bfa",
      borderRadius: "50%",
      flexShrink:   "0",
      display:      "block",
    });

    const label = document.createElement("span");
    _statusEl.appendChild(spinner);
    _statusEl.appendChild(label);
    document.body.appendChild(_statusEl);

    requestAnimationFrame(() => { _statusEl.style.opacity = "1"; });

    // Animate spinner via rAF — avoids injecting a <style> into the page
    let angle = 0;
    let raf;
    const step = () => {
      angle = (angle + 8) % 360;
      spinner.style.transform = `rotate(${angle}deg)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    _cancelSpin = () => cancelAnimationFrame(raf);
  }

  _statusEl.querySelector("span:last-child").textContent = msg;
}

/** Fades out and removes the floating status overlay. */
function hideStatus() {
  if (!_statusEl) return;
  _cancelSpin?.();
  _cancelSpin = null;
  _statusEl.style.opacity = "0";
  const el = _statusEl;
  _statusEl = null;
  setTimeout(() => el.remove(), 250);
}

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel", "pendingFiles"]);
  if (!data.pendingMessage) return;

  const message   = data.pendingMessage;
  const modelPref = data.pendingModel || "flash";
  const files     = data.pendingFiles  || [];
  await chrome.storage.local.remove(["pendingMessage", "pendingModel", "pendingFiles"]);

  showStatus("Ask Gemini…");

  // ── 1. Wait for the model trigger button ───────────────────────
  const ready = await waitForElement(() => findModelTrigger(), 10_000);

  if (!ready) {
    console.warn("[Ask Gemini] Model trigger not found after 10 s — skipping model check");
    if (files.length > 0) {
      showStatus(`Uploading image${files.length > 1 ? "s" : ""}…`);
      await uploadFilesToGemini(files);
    }
    showStatus("Sending…");
    await injectMessage(message);
    hideStatus();
    return;
  }

  // ── 2. Guarantee the correct model is active ───────────────────
  if (readModelFromButton() !== modelPref) showStatus("Switching model…");
  const confirmed = await ensureModel(modelPref);
  if (!confirmed) {
    console.warn(
      `[Ask Gemini] Could not confirm model "${modelPref}" after switch. Proceeding anyway.`
    );
  } else {
    console.info(`[Ask Gemini] ✓ Model confirmed: "${modelPref}"`);
  }

  // ── 3. Upload any attached files and wait for processing ───────
  if (files.length > 0) {
    showStatus(`Uploading image${files.length > 1 ? "s" : ""}…`);
    await uploadFilesToGemini(files);
  }

  // ── 4. Inject the message and submit ───────────────────────────
  showStatus("Sending…");
  await injectMessage(message);
  hideStatus();
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
      clearInterval(poller);
      observer.disconnect();
      resolve(value);
    };

    const timer  = setTimeout(() => finish(false), timeoutMs);
    // Polling fallback: catches updates that don't fire a MutationObserver
    // (e.g. Angular text-node interpolation, async Angular CD cycles).
    const poller = setInterval(() => { if (predicate()) finish(true); }, 100);

    const observer = new MutationObserver(() => {
      if (predicate()) finish(true);
    });

    observer.observe(root, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      characterData:   true,   // catches Angular in-place text-node updates
      attributeFilter: ["aria-disabled", "disabled", "class", "tabindex"],
    });
  });
}


// ══════════════════════════════════════════════════════════════════
// MODEL TRIGGER
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the Gemini model-picker trigger button, or null if not found.
 * @returns {Element|null}
 */
function findModelTrigger() {
  return (
    document.querySelector('button[data-test-id="bard-mode-menu-button"]') ||
    document.querySelector('button[aria-label="Open mode picker"]')         ||
    null
  );
}

/**
 * Reads the currently active model from the trigger button label.
 * @returns {"flash"|"thinking"|"pro"|null}
 */
function readModelFromButton() {
  const btn = findModelTrigger();
  if (!btn) return null;

  const container =
    btn.querySelector('[data-test-id="logo-pill-label-container"]') ||
    btn.querySelector(".logo-pill-label-container");

  const span = container
    ? Array.from(container.querySelectorAll("span")).find(
        s => s.textContent.trim() && !s.querySelector("mat-icon")
      )
    : null;

  const text = span ? span.textContent.trim() : btn.textContent.trim();
  console.debug("[Ask Gemini] readModelFromButton:", JSON.stringify(text));
  return classifyModelText(text);
}


// ══════════════════════════════════════════════════════════════════
// MODEL CLASSIFICATION
// ══════════════════════════════════════════════════════════════════

/**
 * Maps a free-form model label string to a canonical model id.
 * @param {string} text
 * @returns {"flash"|"thinking"|"pro"|null}
 */
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

/**
 * Returns true if the dropdown option text corresponds to the target model.
 * @param {string} optionText
 * @param {"flash"|"thinking"|"pro"} target
 * @returns {boolean}
 */
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
// SHARED SELECTORS
// ══════════════════════════════════════════════════════════════════

/** Selectors tried in order to locate model-picker dropdown options. */
const OPTION_SELECTORS = [
  '[role="option"]', '[role="menuitem"]', '[role="listitem"]',
  "li[data-value]",  '[class*="model-item" i]',
];

/** Selectors tried in order to locate Gemini's send button. */
const SEND_SELECTORS = [
  'button.send-button[aria-label="Send message"]',
  "button.send-button",
  'button[aria-label="Send message"]',
  'button[aria-label*="Send" i].submit',
  'button.submit[aria-label*="Send" i]',
];

/**
 * Returns Gemini's contenteditable rich-text input element, or null.
 * @returns {Element|null}
 */
function findTextareaInput() {
  return (
    document.querySelector("rich-textarea div.ql-editor[contenteditable='true']") ||
    document.querySelector("rich-textarea div[contenteditable='true']")           ||
    document.querySelector("div.ql-editor[contenteditable='true']")               ||
    document.querySelector("div[contenteditable='true'][aria-label]")
  );
}

// ══════════════════════════════════════════════════════════════════
// MODEL DETECTION
// ══════════════════════════════════════════════════════════════════

/**
 * Detects the currently active model, opening the picker dropdown if the
 * button label alone is insufficient.
 * @returns {Promise<"flash"|"thinking"|"pro"|null>}
 */
async function _detectCurrentModel() {
  const quick = readModelFromButton();
  if (quick) {
    console.debug(`[Ask Gemini] _detectCurrentModel (fast path) → "${quick}"`);
    return quick;
  }

  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return null;

  triggerBtn.click();

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
  console.debug(`[Ask Gemini] _detectCurrentModel (slow path) → "${detected}"`);
  return detected;
}

/**
 * Heuristically determines whether a dropdown option element is the currently
 * selected/active one.
 * @param {Element} el
 * @returns {boolean}
 */
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

/**
 * Ensures the given model is active, switching if necessary, and waits for
 * the UI to confirm the change.
 * @param {"flash"|"thinking"|"pro"} target
 * @returns {Promise<boolean>} true if the correct model is confirmed active
 */
async function ensureModel(target) {
  const current = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel: current="${current}" target="${target}"`);

  if (current === target) {
    console.info("[Ask Gemini] Model already correct — no switch needed.");
    return true;
  }

  await performModelSwitch(target);

  // Give Angular's change-detection one tick to update the button label
  // before starting the observer/poller.
  await new Promise((r) => setTimeout(r, 150));

  const switched = await waitForCondition(
    () => readModelFromButton() === target,
    5_000,
    document.body
  );

  const after = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel after switch: "${after}" (observer resolved: ${switched})`);
  return after === target;
}

/**
 * Opens the model picker dropdown and clicks the option matching `target`.
 * Closes the dropdown without switching if no matching option is found.
 * @param {"flash"|"thinking"|"pro"} target
 */
async function performModelSwitch(target) {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) {
    console.debug("[Ask Gemini] performModelSwitch: trigger not found");
    return;
  }

  triggerBtn.click();

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
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════════

/**
 * Pastes all pending images into the Gemini input via ClipboardEvent,
 * then waits for Gemini to finish uploading them before returning.
 *
 * Strategy: dispatch a synthetic `paste` ClipboardEvent whose
 * `clipboardData` DataTransfer contains the image File. React apps
 * typically do not check `event.isTrusted` on paste events, so this
 * is processed the same way as a real Ctrl+V paste.
 *
 * Wait time: 5 s base + 2 s per MB of total payload.
 *
 * @param {{ name: string, type: string, size: number, data: string }[]} files
 */
async function uploadFilesToGemini(files) {
  if (!files || files.length === 0) return;

  // Find the Gemini contenteditable input to paste into
  const inputEl = await waitForElement(findTextareaInput, 10_000);

  if (!inputEl) {
    console.warn("[Ask Gemini] uploadFilesToGemini: input not found — skipping image paste");
    return;
  }

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  for (const fileData of files) {
    await pasteImageToInput(fileData, inputEl);
    // Small gap so Gemini registers each image separately
    await new Promise((r) => setTimeout(r, 400));
  }

  // Wait for Gemini's upload pipeline to process the images
  const waitMs = 5_000 + Math.ceil(totalBytes / (1024 * 1024)) * 2_000;
  console.info(`[Ask Gemini] Waiting ${waitMs} ms for image upload(s) to complete…`);
  await new Promise((r) => setTimeout(r, waitMs));
}

/**
 * Dispatches a synthetic paste event containing a single image File onto
 * the Gemini input element.
 *
 * @param {{ name: string, type: string, data: string }} fileData
 * @param {Element} inputEl
 */
async function pasteImageToInput(fileData, inputEl) {
  const { name, type, data } = fileData;

  const response = await fetch(data);
  const blob     = await response.blob();
  const file     = new File([blob], name, { type });

  const dt = new DataTransfer();
  dt.items.add(file);

  inputEl.focus();
  inputEl.dispatchEvent(new ClipboardEvent("paste", {
    bubbles:       true,
    cancelable:    true,
    clipboardData: dt,
  }));

  console.debug(`[Ask Gemini] pasteImageToInput: dispatched paste for "${name}"`);
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

/**
 * Injects `message` into the Gemini textarea and submits it.
 * Reports the outcome to the service worker via reportResult().
 * @param {string} message
 */
async function injectMessage(message) {
  // ── Find the textarea ─────────────────────────────────────────
  const input = await waitForElement(findTextareaInput, 10_000);

  if (!input) {
    console.error("[Ask Gemini] Input field not found within timeout.");
    reportResult(false);
    return;
  }

  // ── Inject text ───────────────────────────────────────────────
  input.focus();
  input.replaceChildren();

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

/**
 * Walks up the DOM from `inputEl` to find the nearest enabled send button.
 * @param {Element} inputEl
 * @returns {Element|null}
 */
function findSendButton(inputEl) {
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