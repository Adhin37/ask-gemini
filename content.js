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
 * dropdown. The current model name ("Fast", "Pro", "Thinking...") is in the
 * first plain <span> inside .logo-pill-label-container.
 * Returns 'flash' | 'pro' | 'thinking' | null.
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
 * Primary path: read the model label directly from the button text (no click,
 * no dropdown, no timing issues). The "Fast ▾" / "Pro ▾" / "Thinking ▾" span
 * inside the button is updated by Angular whenever the selection changes.
 *
 * Fallback: open the dropdown, find the checked option, close it.
 * Only used if the button-read returns null (layout not yet rendered).
 */
async function detectCurrentModel() {
  // ── Fast path: read label without touching the dropdown ────────
  const quick = readModelFromButton();
  if (quick) {
    console.debug(`[Ask Gemini] detectCurrentModel (fast path) → "${quick}"`);
    return quick;
  }

  // ── Slow path: open dropdown, inspect selected option ──────────
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) return null;

  triggerBtn.click();
  await sleep(550);

  let detected = null;
  const optionRoots = [
    '[role="option"]', '[role="menuitem"]', '[role="listitem"]',
    'li[data-value]', '[class*="model-item" i]', '[class*="ModelOption"]',
  ];

  outer: for (const sel of optionRoots) {
    for (const opt of document.querySelectorAll(sel)) {
      if (isSelectedOption(opt)) {
        detected = classifyModelText(opt.textContent);
        break outer;
      }
    }
  }

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(250);

  if (detected === null) detected = readModelFromButton();

  console.debug(`[Ask Gemini] detectCurrentModel (slow path) → "${detected}"`);
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
 * Ensures the correct model is active before message injection.
 *
 * 1. Read the button label (instant, no DOM side-effects).
 *    → Already correct? Return immediately — nothing to do.
 * 2. If wrong (or unreadable), open the dropdown once and click the target.
 * 3. Verify by re-reading the button label after the UI settles.
 */
async function ensureModel(target) {
  // ── Step 1: zero-cost check via button label ───────────────────
  const current = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel: current="${current}" target="${target}"`);

  if (current === target) {
    console.info(`[Ask Gemini] Model already correct — no switch needed.`);
    return true;
  }

  // ── Step 2: switch once ────────────────────────────────────────
  await performModelSwitch(target);
  await sleep(900); // let Angular update the button label

  // ── Step 3: verify ─────────────────────────────────────────────
  const after = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel after switch: "${after}"`);
  return after === target;
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

    // ── Find send button scoped to the input's toolbar, not the whole page ──
    // Walk up from the input until we find a container that also holds a
    // send button. This prevents accidentally clicking sidebar buttons.
    const sendBtn = findSendButton(input);

    if (sendBtn && !sendBtn.disabled) {
      console.debug("[Ask Gemini] Clicking send button:", sendBtn.getAttribute("aria-label") || sendBtn.className);
      sendBtn.click();
    } else {
      // Keyboard fallback: re-focus the exact input element, dispatch Enter
      // WITHOUT bubbles so it cannot propagate to sidebar handlers.
      console.debug("[Ask Gemini] Send button not found — using keyboard fallback");
      input.focus();
      await sleep(50);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: false, cancelable: true })
      );
      await sleep(50);
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: false })
      );
    }
  };

  attempt();
}

/**
 * Finds the send button by walking UP from the input element and searching
 * within each ancestor. Stops at the first ancestor that contains a match.
 * This ensures we only ever click a button that shares a toolbar with the input,
 * never a button in the sidebar or elsewhere on the page.
 */
function findSendButton(inputEl) {
  // Selectors derived from Gemini's actual DOM:
  //   aria-label="Send message", class="... send-button ... submit ..."
  //   mat-icon data-mat-icon-name="send" inside the button
  const SEND_SELECTORS = [
    'button.send-button',                        // class is stable across builds
    'button[aria-label="Send message"]',         // exact aria-label from the DOM
    'button[aria-label*="Send message" i]',      // case-insensitive variant
    'button.submit',                             // secondary class on the button
    'button[data-mat-icon-name="send"]',         // mat-icon attribute
  ];

  // Walk up from the input element. The send button is a sibling of
  // rich-textarea, so it will appear in querySelector results one level above.
  let node = inputEl.parentElement;
  while (node && node !== document.body) {
    for (const sel of SEND_SELECTORS) {
      const btn = node.querySelector(sel);
      // aria-disabled="false" means enabled; .disabled checks the DOM property
      if (btn && btn.getAttribute('aria-disabled') !== 'true' && !btn.disabled) {
        console.debug("[Ask Gemini] findSendButton: found via", sel);
        return btn;
      }
    }
    node = node.parentElement;
  }

  return null;
}


// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }