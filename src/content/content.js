// ── content.js ───────────────────────────────────────────────
import { t, localizeModelName } from "../shared/stringUtils.js";

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

/**
 * Shows a red error banner fixed at the top of the Gemini page.
 * Auto-dismisses after 6 s.
 * @param {string} msg
 */
function showUploadError(msg) {
  const banner = document.createElement("div");
  Object.assign(banner.style, {
    position:       "fixed",
    top:            "20px",
    left:           "50%",
    transform:      "translateX(-50%)",
    zIndex:         "2147483647",
    background:     "rgba(80, 20, 20, 0.95)",
    color:          "#ffd4d4",
    padding:        "11px 20px",
    borderRadius:   "999px",
    fontSize:       "13px",
    fontWeight:     "500",
    fontFamily:     "'Google Sans', sans-serif",
    border:         "1px solid rgba(250,100,100,0.5)",
    boxShadow:      "0 4px 24px rgba(0,0,0,0.4)",
    backdropFilter: "blur(8px)",
    transition:     "opacity 0.3s ease",
    whiteSpace:     "nowrap",
    cursor:         "default",
  });
  banner.textContent = msg;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.style.opacity = "0";
    setTimeout(() => banner.remove(), 300);
  }, 6_000);
}

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingModel", "pendingFiles"]);
  if (!data.pendingMessage) return;

  const message   = data.pendingMessage;
  const modelPref = data.pendingModel || "flash";
  const files     = data.pendingFiles  || [];
  await chrome.storage.local.remove(["pendingMessage", "pendingModel", "pendingFiles"]);

  showStatus(t("content_status_ask_gemini"));

  // ── 1. Wait for the model trigger button AND the textarea ─────
  // Both must be present before we interact with the model picker.
  // The textarea renders later in Angular's hydration cycle, so its
  // presence is a stronger "page is ready" signal than the button alone.
  const [ready] = await Promise.all([
    waitForElement(() => findModelTrigger(), 10_000),
    waitForElement(() => findTextareaInput(), 10_000),
  ]);

  if (!ready) {
    console.warn("[Ask Gemini] Model trigger not found after 10 s — skipping model check");
    if (files.length > 0) {
      showStatus(files.length > 1 ? t("content_status_uploading_other") : t("content_status_uploading_one"));
      const uploadResult = await uploadFilesToGemini(files);
      if (!uploadResult.success) {
        hideStatus();
        showUploadError(t("content_upload_failed"));
        reportResult(false);
        return;
      }
    }
    showStatus(t("content_status_sending"));
    await injectMessage(message);
    hideStatus();
    return;
  }

  // ── 2. Guarantee the correct model is active ───────────────────
  if (readModelFromButton() !== modelPref) showStatus(t("content_status_switching_model"));
  const modelResult = await ensureModel(modelPref);
  if (modelResult.fellBack === "flash") {
    showStatus(t("content_status_model_unavailable", { model: localizeModelName(modelPref) }));
    await new Promise((r) => setTimeout(r, 2200));
  } else if (!modelResult.confirmed) {
    console.warn(
      `[Ask Gemini] Could not confirm model "${modelPref}" after switch. Proceeding anyway.`
    );
  } else {
    console.info(`[Ask Gemini] ✓ Model confirmed: "${modelPref}"`);
  }

  // ── 3. Upload any attached files and verify ───────────────────
  if (files.length > 0) {
    showStatus(files.length > 1 ? t("content_status_uploading_other") : t("content_status_uploading_one"));
    const uploadResult = await uploadFilesToGemini(files);
    if (!uploadResult.success) {
      hideStatus();
      showUploadError(t("content_upload_failed"));
      reportResult(false);
      return;
    }
  }

  // ── 4. Inject the message and submit ───────────────────────────
  showStatus(t("content_status_sending"));
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
    document.querySelector("button.input-area-switch")                      ||
    document.querySelector('button[aria-label="Open mode picker"]')         ||
    null
  );
}

/**
 * Reads the currently active model from the trigger button label.
 * Tries icon classification first (locale-stable), then text.
 * @returns {"flash"|"thinking"|"pro"|null}
 */
function readModelFromButton() {
  const btn = findModelTrigger();
  if (!btn) return null;

  const iconResult = iconNameOf(btn);
  if (iconResult && ICON_TO_MODEL[iconResult]) return ICON_TO_MODEL[iconResult];

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
  return classifyModelTextLegacy(text);
}


// ══════════════════════════════════════════════════════════════════
// MODEL CLASSIFICATION
// ══════════════════════════════════════════════════════════════════

// ── Locale-stable icon → model map ───────────────────────────
// Material icon glyph names observed in the Gemini model picker.
// Add entries here as Gemini updates its icon set.
const ICON_TO_MODEL = {
  bolt: "flash", auto_awesome: "flash", lightning_bolt: "flash",
  bulb: "thinking", lightbulb: "thinking", psychology: "thinking", neurology: "thinking",
  star: "pro", workspace_premium: "pro", workspace_premium_filled: "pro",
};

/**
 * Extracts the Material icon glyph name from within an element, trying
 * the attribute and content conventions used by Gemini's Angular build.
 * @param {Element} el
 * @returns {string|null}
 */
function iconNameOf(el) {
  const mi = el.querySelector("mat-icon");
  if (!mi) return null;
  return mi.getAttribute("data-mat-icon-name")
      || mi.getAttribute("fonticon")
      || (mi.querySelector("use")?.getAttribute("href") || "").split("#").pop()
      || mi.textContent.trim()
      || null;
}

/**
 * Classifies a dropdown option using three layers in priority order:
 * (a) Material icon glyph name — locale-stable.
 * (b) DOM index within the option list (0=flash, 1=thinking, 2=pro).
 *     Pass -1 to skip this layer (e.g. when reading the selected option).
 * (c) English text substring match — legacy fallback.
 * @param {Element} el
 * @param {number}  indexInGroup
 * @returns {"flash"|"thinking"|"pro"|null}
 */
function classifyOption(el, indexInGroup) {
  const icon = iconNameOf(el);
  if (icon && ICON_TO_MODEL[icon]) return ICON_TO_MODEL[icon];

  if (indexInGroup === 0) return "flash";
  if (indexInGroup === 1) return "thinking";
  if (indexInGroup === 2) return "pro";

  return classifyModelTextLegacy(el.textContent);
}

/**
 * Maps a free-form model label string to a canonical model id.
 * Kept as legacy fallback for non-icon, non-ordered detection paths.
 * @param {string} text
 * @returns {"flash"|"thinking"|"pro"|null}
 */
function classifyModelTextLegacy(text) {
  const lower = text.toLowerCase();
  if (lower.includes("think") || lower.includes("reason"))               return "thinking";
  if (lower.includes("pro")   || lower.includes("advanced"))             return "pro";
  if (lower.includes("flash") || lower.includes("fast") ||
      lower.includes("quick") || lower.includes("gemini") ||
      lower.includes("default") || lower.includes("2.") ||
      lower.includes("1.5"))                                              return "flash";
  return null;
}

/**
 * Maps a free-form model label string to a canonical model id.
 * @param {string} text
 * @returns {"flash"|"thinking"|"pro"|null}
 */
function classifyModelText(text) {
  return classifyModelTextLegacy(text);
}

/**
 * Returns true if the dropdown option text corresponds to the target model.
 * Legacy text-only check retained for the __TEST__ export.
 * @param {string} optionText
 * @param {"flash"|"thinking"|"pro"} target
 * @returns {boolean}
 */
function matchesTarget(optionText, target) {
  const firstLine = optionText.trim().split("\n")[0].trim();
  const lower     = firstLine.toLowerCase();

  switch (target) {
    case "flash":
      // Reject options that also contain thinking/pro markers — those take priority.
      if (lower.includes("think") || lower.includes("reason")) return false;
      if (lower.includes("pro") || lower.includes("advanced")) return false;
      return lower.includes("flash") || lower.includes("fast") || lower.includes("quick");
    case "thinking":
      return lower.includes("think") || lower.includes("reason");
    case "pro":
      return (lower.includes("pro") || lower.includes("advanced")) &&
             !lower.includes("think") && !lower.includes("reason");
    default:
      return false;
  }
}


// ══════════════════════════════════════════════════════════════════
// SHARED SELECTORS
// ══════════════════════════════════════════════════════════════════

/**
 * Selectors tried in order to locate model-picker dropdown options.
 * Primary: Material Design menu items used by the real Gemini UI.
 * Fallbacks cover layout variants and possible future DOM changes.
 */
const OPTION_SELECTORS = [
  "button.mat-mdc-menu-item",
  '[role="menuitem"]',
  '[role="option"]',
  '[role="listitem"]',
  "li[data-value]",
  '[class*="model-item" i]',
];

/** Selectors tried in order to locate Gemini's send button. */
const SEND_SELECTORS = [
  "button.send-button",                           // locale-stable class, primary
  'button.send-button[aria-label="Send message"]',
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

/** Selectors tried in order to locate Gemini's hidden file-upload input. */
const FILE_INPUT_SELECTORS = [
  'input[type="file"][accept*="image"]',
  'input[type="file"]',
];

/**
 * Returns Gemini's hidden file input element, or null.
 * @returns {HTMLInputElement|null}
 */
function findGeminiFileInput() {
  for (const sel of FILE_INPUT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Selectors tried in order to detect upload-chip / thumbnail elements that
 * Gemini renders after a file is successfully attached.
 *
 * `img[src^="blob:"]` is the most reliable cross-version signal: Gemini
 * creates a local object URL (URL.createObjectURL) for the preview thumbnail
 * as soon as a file is accepted, regardless of Angular component class names.
 *
 * To verify / extend for a future Gemini DOM change:
 *   1. Open gemini.google.com, manually attach a file.
 *   2. Run in DevTools console:
 *        [...document.querySelectorAll('img[src^="blob:"]')]
 *        // or inspect the element near the textarea for the chip class.
 *   3. Add the matching selector here.
 */
const UPLOAD_CHIP_SELECTORS = [
  'img[src^="blob:"]',           // object-URL preview thumbnail — version-stable
  "input-media-card",            // Angular custom element used in older Gemini builds
  "uploader-file-card",
  '[data-test-id*="media"]',
  '[data-test-id*="upload"]',
  '[class*="upload-chip" i]',
  '[class*="image-chip" i]',
  '[class*="file-chip" i]',
  '[class*="image-preview" i]',
  '[class*="attachment-chip" i]',
  '[class*="file-attachment" i]',
  '[class*="attachment" i] img',
  ".image-attachment",
];

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
        // Skip DOM-order fallback (-1) — we are identifying the selected option,
        // not scanning by position.
        detected = classifyOption(opt, -1);
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

/**
 * Returns true if the picker option is locked (quota exhausted / not signed in / paywall).
 * @param {Element} el
 * @returns {boolean}
 */
function isOptionDisabled(el) {
  return el.getAttribute("aria-disabled") === "true" ||
         el.hasAttribute("disabled") ||
         el.disabled === true;
}


// ══════════════════════════════════════════════════════════════════
// MODEL SWITCHING WITH VERIFY
// ══════════════════════════════════════════════════════════════════

/**
 * Ensures the given model is active, switching if necessary, and waits for
 * the UI to confirm the change. Retries up to MAX_ATTEMPTS times in case
 * the page is still initialising (e.g. Angular hasn't settled after a redirect).
 *
 * When the requested option is disabled (quota / sign-in) and `target` is
 * "thinking" or "pro", falls back to "flash" instead of retrying, and returns
 * `{ confirmed, fellBack: "flash", reason: "locked" }`.
 *
 * @param {"flash"|"thinking"|"pro"} target
 * @param {number} [_attempt]
 * @returns {Promise<{confirmed: boolean, fellBack?: "flash", reason?: "locked"}>}
 */
async function ensureModel(target, _attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const current = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel attempt ${_attempt}/${MAX_ATTEMPTS}: current="${current}" target="${target}"`);

  if (current === target) {
    console.info("[Ask Gemini] Model already correct — no switch needed.");
    return { confirmed: true };
  }

  const switchStatus = await performModelSwitch(target);

  // If the option is locked and the user asked for a premium model, fall back
  // to flash immediately — no point retrying a disabled button.
  if (switchStatus === "disabled" && target !== "flash") {
    console.warn(`[Ask Gemini] Model "${target}" is locked (quota / sign-in) — falling back to "flash"`);
    const fallbackResult = await ensureModel("flash");
    return { confirmed: fallbackResult.confirmed, fellBack: "flash", reason: "locked" };
  }

  // Wait for the dropdown to close — that's the reliable signal Angular
  // processed the option click (avoids an arbitrary fixed sleep).
  await waitForCondition(
    () => !OPTION_SELECTORS.some(s => document.querySelector(s)),
    3_000
  );

  const switched = await waitForCondition(
    () => readModelFromButton() === target,
    5_000,
    document.body
  );

  const after = readModelFromButton();
  console.debug(`[Ask Gemini] ensureModel after switch: "${after}" (observer resolved: ${switched})`);

  if (after === target) return { confirmed: true };

  if (_attempt < MAX_ATTEMPTS) {
    console.debug(`[Ask Gemini] Model switch not confirmed — retrying (${_attempt + 1}/${MAX_ATTEMPTS})…`);
    await new Promise((r) => setTimeout(r, 500));
    return ensureModel(target, _attempt + 1);
  }

  return { confirmed: false };
}

/**
 * Opens the model picker dropdown and clicks the option matching `target`.
 * Waits specifically for the target option to appear (not just any option)
 * to avoid premature resolution when other [role="option"] elements exist
 * elsewhere on the page. Closes the dropdown if no match is found.
 * @param {"flash"|"thinking"|"pro"} target
 * @returns {Promise<"switched"|"disabled"|"not-found">}
 */
async function performModelSwitch(target) {
  const triggerBtn = findModelTrigger();
  if (!triggerBtn) {
    console.debug("[Ask Gemini] performModelSwitch: trigger not found");
    return "not-found";
  }

  triggerBtn.click();

  // Wait for the Material menu panel to open before querying options.
  // 400 ms matches the observed render delay on the real Gemini page.
  await new Promise((r) => setTimeout(r, 400));

  const targetOption = await waitForElement(
    () => {
      for (const sel of OPTION_SELECTORS) {
        const opts = [...document.querySelectorAll(sel)];
        for (let i = 0; i < opts.length; i++) {
          if (classifyOption(opts[i], i) === target) return opts[i];
        }
      }
      return null;
    },
    4_000
  );

  if (!targetOption) {
    console.debug(`[Ask Gemini] No option matched "${target}" — closing dropdown`);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return "not-found";
  }

  if (isOptionDisabled(targetOption)) {
    console.debug(`[Ask Gemini] Option "${target}" is disabled (quota/sign-in) — closing dropdown`);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return "disabled";
  }

  console.debug(`[Ask Gemini] Clicking: "${(targetOption.innerText || targetOption.textContent).trim().slice(0, 50)}" for target="${target}"`);
  targetOption.scrollIntoView({ block: "nearest" });
  targetOption.click();
  return "switched";
}


// ══════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════════

/**
 * Uploads all pending images to Gemini and verifies that upload chips appear
 * in the DOM before returning.
 *
 * Tries Gemini's native file input first (more reliable across MIME types),
 * falls back to a synthetic ClipboardEvent paste. After all files are
 * dispatched, polls `UPLOAD_CHIP_SELECTORS` for the expected number of chips.
 *
 * @param {{ name: string, type: string, size: number, data: string }[]} files
 * @returns {Promise<{ success: boolean, failedCount: number }>}
 */
async function uploadFilesToGemini(files) {
  if (!files || files.length === 0) return { success: true, failedCount: 0 };

  const inputEl = await waitForElement(findTextareaInput, 10_000);
  if (!inputEl) {
    console.warn("[Ask Gemini] uploadFilesToGemini: input not found — skipping image paste");
    return { success: false, failedCount: files.length };
  }

  // Scope chip detection to the nearest recognisable input-area ancestor.
  // Fallback order: mock/data-attr → class-based → rich-textarea parent → body.
  const container = inputEl.closest("[data-node-type=\"input-area\"]")
    || inputEl.closest(".input-area")
    || inputEl.closest("[class*='input-area' i]")
    || inputEl.closest("[class*='chat-input' i]")
    || inputEl.closest("rich-textarea")?.parentElement?.parentElement
    || document.body;

  console.debug(`[Ask Gemini] uploadFilesToGemini: container=${container.tagName}${container.id ? "#" + container.id : ""}${container.className ? "." + [...container.classList].join(".") : ""}`);
  console.debug(`[Ask Gemini] uploadFilesToGemini: fileInput=${findGeminiFileInput() ? "found (" + (findGeminiFileInput().accept || "no accept attr") + ")" : "NOT FOUND — will use paste fallback"}`);

  // Snapshot chip count before upload to detect additions
  const baselineCount = new Set(
    UPLOAD_CHIP_SELECTORS.flatMap((s) => [...container.querySelectorAll(s)])
  ).size;
  console.debug(`[Ask Gemini] uploadFilesToGemini: baselineCount=${baselineCount}`);

  for (const fileData of files) {
    await pasteImageToInput(fileData, inputEl);
    // Small gap so Gemini registers each image separately
    await new Promise((r) => setTimeout(r, 400));
  }

  // Poll for chips — 8 s base + 3 s per file
  const verifyMs = 8_000 + files.length * 3_000;
  console.info(`[Ask Gemini] Verifying upload chips (timeout ${verifyMs} ms)…`);
  const verified = await waitForUploadChips(container, baselineCount, files.length, verifyMs);

  if (!verified) {
    // Log what IS in the container to diagnose selector mismatches
    const allChipEls = UPLOAD_CHIP_SELECTORS.flatMap((s) => {
      const els = [...container.querySelectorAll(s)];
      if (els.length) console.debug(`[Ask Gemini] selector "${s}" matched ${els.length} el(s)`);
      return els;
    });
    console.warn(`[Ask Gemini] Upload verification failed — chips not detected in DOM (unique: ${new Set(allChipEls).size})`);
    return { success: false, failedCount: files.length };
  }

  return { success: true, failedCount: 0 };
}

/**
 * Dispatches a single image File into the Gemini input.
 *
 * Primary path: assigns the file to Gemini's native `<input type="file">`
 * and fires a `change` event — goes through the browser's upload pipeline
 * and avoids MIME filtering applied by Gemini's clipboard paste handler.
 *
 * Fallback: synthetic ClipboardEvent paste on the contenteditable, used
 * when the file input cannot be located.
 *
 * @param {{ name: string, type: string, data: string }} fileData
 * @param {Element} inputEl  Gemini's contenteditable (used for paste fallback)
 */
async function pasteImageToInput(fileData, inputEl) {
  const { name, type, data } = fileData;
  const blob = await (await fetch(data)).blob();
  const file = new File([blob], name, { type });
  const dt   = new DataTransfer();
  dt.items.add(file);

  const fileInput = findGeminiFileInput();
  if (fileInput) {
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    console.debug(`[Ask Gemini] pasteImageToInput: dispatched via file input for "${name}"`);
    return;
  }

  // Fallback: synthetic ClipboardEvent paste
  inputEl.focus();
  inputEl.dispatchEvent(new ClipboardEvent("paste", {
    bubbles:       true,
    cancelable:    true,
    clipboardData: dt,
  }));
  console.debug(`[Ask Gemini] pasteImageToInput: dispatched paste (fallback) for "${name}"`);
}

/**
 * Polls until `expectedCount` new upload-chip elements have appeared under
 * `root` compared to `baselineCount`, or until `timeoutMs` elapses.
 *
 * @param {Element} root
 * @param {number}  baselineCount  chip count before upload
 * @param {number}  expectedCount  how many new chips to wait for
 * @param {number}  timeoutMs
 * @returns {Promise<boolean>}
 */
async function waitForUploadChips(root, baselineCount, expectedCount, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const unique = new Set(
      UPLOAD_CHIP_SELECTORS.flatMap((s) => [...root.querySelectorAll(s)])
    );
    if (unique.size >= baselineCount + expectedCount) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
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
  Object.assign(globalThis.__TEST__, {
    classifyModelText, classifyModelTextLegacy, matchesTarget,
    classifyOption, iconNameOf, ICON_TO_MODEL,
    waitForElement, waitForCondition,
  });
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