// ── content.js ───────────────────────────────────────────────
import { t } from "../shared/stringUtils.js";
import { THINKING_LEVELS, DEFAULT_THINKING_LEVEL } from "../shared/constants.js";

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

/**
 * Picks the banner text for a failed upload.
 * @param {{ reason?: "signin-required" }} result
 * @returns {string}
 */
function uploadErrorMessage(result) {
  return result.reason === "signin-required"
    ? t("content_upload_signin_required")
    : t("content_upload_failed");
}

(async () => {
  const data = await chrome.storage.local.get(["pendingMessage", "pendingThinkingLevel", "pendingFiles"]);
  if (!data.pendingMessage) return;

  const message       = data.pendingMessage;
  const thinkingLevel = THINKING_LEVELS.includes(data.pendingThinkingLevel)
    ? data.pendingThinkingLevel
    : DEFAULT_THINKING_LEVEL;
  const files         = data.pendingFiles         || [];
  await chrome.storage.local.remove(["pendingMessage", "pendingThinkingLevel", "pendingFiles"]);

  showStatus(t("content_status_ask_gemini"));

  // ── 1. Wait for the mode-picker trigger AND the textarea ──────
  // Both must be present before we interact with the mode picker.
  // The textarea renders later in Angular's hydration cycle, so its
  // presence is a stronger "page is ready" signal than the button alone.
  const [ready] = await Promise.all([
    waitForElement(() => findModelTrigger(), 10_000),
    waitForElement(() => findTextareaInput(), 10_000),
  ]);

  if (!ready) {
    console.warn("[Ask Gemini] Mode picker not found after 10 s — skipping thinking level");
    if (files.length > 0) {
      showStatus(files.length > 1 ? t("content_status_uploading_other") : t("content_status_uploading_one"));
      const uploadResult = await uploadFilesToGemini(files);
      if (!uploadResult.success) {
        hideStatus();
        showUploadError(uploadErrorMessage(uploadResult));
        reportResult(false);
        return;
      }
    }
    showStatus(t("content_status_sending"));
    await injectMessage(message);
    hideStatus();
    return;
  }

  // ── 2. Guarantee the correct thinking level is active ─────────
  showStatus(t("content_status_setting_level"));
  const levelResult = await ensureThinkingLevel(thinkingLevel);
  if (levelResult === "disabled") {
    showStatus(t("content_status_thinking_unavailable"));
    await new Promise((r) => setTimeout(r, 2200));
  } else if (levelResult === "unsupported") {
    // Signed-out picker lists models only — nothing to set, send as is.
    console.info("[Ask Gemini] Mode picker has no thinking levels — sending with Gemini's default.");
  } else if (levelResult === "not-found") {
    console.warn(`[Ask Gemini] Could not set thinking level "${thinkingLevel}". Proceeding anyway.`);
  } else {
    console.info(`[Ask Gemini] ✓ Thinking level "${thinkingLevel}" (${levelResult})`);
  }

  // ── 3. Upload any attached files and verify ───────────────────
  if (files.length > 0) {
    showStatus(files.length > 1 ? t("content_status_uploading_other") : t("content_status_uploading_one"));
    const uploadResult = await uploadFilesToGemini(files);
    if (!uploadResult.success) {
      hideStatus();
      showUploadError(uploadErrorMessage(uploadResult));
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
// SHARED SELECTORS
// ══════════════════════════════════════════════════════════════════

/** Selectors tried in order to locate Gemini's send button. */
const SEND_SELECTORS = [
  'button[aria-label="Send message"]',            // inner button inside gem-icon-button wrapper
  "button.send-button",                           // class-based fallback
  'button.send-button[aria-label="Send message"]',
  'button[mat-icon-button][aria-label="Send message"]',
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
 * Selectors for the composer's "Upload & tools" menu trigger. Structural
 * selectors come first because the aria-label is localised.
 */
const UPLOAD_MENU_TRIGGER_SELECTORS = [
  'simplified-input-menu button[aria-haspopup="menu"]',
  '.leading-actions-wrapper button[aria-haspopup="menu"]',
  'button[aria-haspopup="menu"][aria-label*="upload" i]',
];

/** "Upload files" item inside that menu — disabled while signed out. */
const UPLOAD_MENU_ITEM_SELECTOR = '[data-test-id="local-images-files-uploader-button"]';

/**
 * Returns the "Upload & tools" menu trigger button, or null.
 * @returns {HTMLElement|null}
 */
function findUploadMenuTrigger() {
  for (const sel of UPLOAD_MENU_TRIGGER_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Locates a file input to upload through. Gemini (verified October 2026)
 * only mounts its file inputs inside the "Upload & tools" menu overlay and
 * removes them when the menu closes, so when none is in the DOM the menu is
 * opened first. While signed out every upload entry is disabled, which is
 * reported as `signinRequired` so the caller can fail fast.
 *
 * @returns {Promise<{ input: HTMLInputElement|null, openedMenu: boolean, signinRequired: boolean }>}
 */
async function revealFileInput() {
  const existing = findGeminiFileInput();
  if (existing) return { input: existing, openedMenu: false, signinRequired: false };

  const trigger = findUploadMenuTrigger();
  if (!trigger) return { input: null, openedMenu: false, signinRequired: false };

  trigger.click();
  await waitForElement(
    () => findGeminiFileInput() || document.querySelector(UPLOAD_MENU_ITEM_SELECTOR),
    3_000
  );
  const item = document.querySelector(UPLOAD_MENU_ITEM_SELECTOR);
  const signinRequired = !!item && isOptionDisabled(item);
  return {
    input: signinRequired ? null : findGeminiFileInput(),
    openedMenu: true,
    signinRequired,
  };
}

/**
 * Closes the "Upload & tools" menu if it is still open.
 * @returns {void}
 */
function closeUploadMenu() {
  if (findUploadMenuTrigger()?.getAttribute("aria-expanded") === "true") {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
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
// MODE PICKER (thinking level)
// ══════════════════════════════════════════════════════════════════

/**
 * Returns the Gemini mode-picker trigger button, or null if not found.
 * `data-test-id="bard-mode-menu-button"` and `[data-test-id="logo-pill-label-container"]`
 * are both still present in the current Gemini markup (verified October 2026).
 * @returns {Element|null}
 */
function findModelTrigger() {
  return (
    document.querySelector('[data-test-id="logo-pill-label-container"]')?.closest("button") ||
    document.querySelector('button[data-test-id="bard-mode-menu-button"]')                  ||
    document.querySelector("button.input-area-switch")                                       ||
    document.querySelector('button[aria-label^="Open mode picker"]')                         ||
    null
  );
}

/**
 * Selectors tried in order to locate the mode-picker rows. Primary: the
 * `<gem-menu-item>` rows of `gem-menu[data-test-id="gem-mode-menu"]`
 * (verified October 2026). The bare-role entries cover a future build that
 * renames the custom elements but keeps the ARIA roles.
 */
const OPTION_SELECTORS = [
  'gem-menu[data-test-id="gem-mode-menu"] gem-menu-item',
  'gem-menu-item[role="menuitem"]',
  '[role="menu"] [role="menuitem"]',
];

/**
 * English row labels per level. Only used when the picker does not list
 * exactly three level rows, since the labels are localised.
 */
const LEVEL_LABELS = { low: "low", medium: "medium", high: "high" };

/**
 * Returns the rows of the open mode picker (empty when it is closed).
 * @returns {Element[]}
 */
function findMenuRows() {
  for (const sel of OPTION_SELECTORS) {
    const rows = [...document.querySelectorAll(sel)];
    if (rows.length) return rows;
  }
  return [];
}

/**
 * Picks the thinking-level rows out of the picker rows. Gemini (verified
 * October 2026) lists one model row ("Auto", carrying `data-mode-id`)
 * followed by Low / Medium / High rows without that attribute. The
 * signed-out picker still lists models only (each row has `data-mode-id`,
 * plus the "Sign in" prompt), so it yields no level rows.
 * @param {Element[]} rows
 * @returns {Element[]} level rows in Low, Medium, High order
 */
function findLevelRows(rows) {
  return rows.filter((r) =>
    !r.hasAttribute("data-mode-id") && !(r.dataset.testId || "").includes("sign-in")
  );
}

/**
 * Returns the row for `level`. Matched by position because labels are
 * localised; falls back to the English label for an unexpected row count.
 * @param {Element[]} levelRows
 * @param {"low"|"medium"|"high"} level
 * @returns {Element|null}
 */
function findLevelRow(levelRows, level) {
  if (levelRows.length === THINKING_LEVELS.length) {
    return levelRows[THINKING_LEVELS.indexOf(level)] || null;
  }
  return levelRows.find((r) => rowLabel(r) === LEVEL_LABELS[level]) || null;
}

/**
 * Returns a row's lower-cased main label (without the sub-label).
 * @param {Element} row
 * @returns {string}
 */
function rowLabel(row) {
  return (row.querySelector(".label")?.textContent || row.textContent || "").trim().toLowerCase();
}

/**
 * True when a picker row carries the `selected` class or a selected/checked
 * ARIA state. The hover/focus `active` class is deliberately ignored.
 * @param {Element} el
 * @returns {boolean}
 */
function isRowSelected(el) {
  return el.classList.contains("selected") ||
         el.getAttribute("aria-selected") === "true" ||
         el.getAttribute("aria-checked")  === "true";
}

/**
 * Returns true if the picker row is locked (quota exhausted / not signed in / paywall).
 * @param {Element} el
 * @returns {boolean}
 */
function isOptionDisabled(el) {
  return el.getAttribute("aria-disabled") === "true" ||
         el.hasAttribute("disabled") ||
         el.disabled === true;
}

/**
 * Closes the mode picker and waits until its rows are gone. The `gem-menu`
 * only reacts to an Escape dispatched on the menu itself, not on `document`
 * (verified October 2026); toggling the trigger is the fallback.
 * @returns {Promise<void>}
 */
async function closeModePicker() {
  const menu = findMenuRows()[0]?.closest('gem-menu, [role="menu"]') || document;
  menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  const closed = await waitForCondition(() => findMenuRows().length === 0, 1_500);
  if (!closed && findMenuRows().length) {
    findModelTrigger()?.click();
    await waitForCondition(() => findMenuRows().length === 0, 1_500);
  }
}

/**
 * Opens the mode picker and selects the row for `level` unless it is already
 * selected. Gemini closes the picker itself after a row is clicked.
 *
 * - `"already"`     – the level was already active
 * - `"switched"`    – the row was clicked
 * - `"disabled"`    – the row is locked
 * - `"unsupported"` – the picker has no level rows (signed-out picker)
 * - `"not-found"`   – no trigger, no menu, or no matching row
 *
 * @param {"low"|"medium"|"high"} level
 * @returns {Promise<"already"|"switched"|"disabled"|"unsupported"|"not-found">}
 */
async function ensureThinkingLevel(level) {
  const trigger = findModelTrigger();
  if (!trigger) return "not-found";

  trigger.click();
  // 400 ms matches observed Angular menu render delay on the real Gemini page.
  await new Promise((r) => setTimeout(r, 400));
  const rows = await waitForElement(() => {
    const found = findMenuRows();
    return found.length ? found : null;
  }, 4_000);
  if (!rows) return "not-found";

  const levelRows = findLevelRows(rows);
  if (levelRows.length === 0) {
    await closeModePicker();
    return "unsupported";
  }

  const row = findLevelRow(levelRows, level);
  let status = null;
  if (!row)                       status = "not-found";
  else if (isOptionDisabled(row)) status = "disabled";
  else if (isRowSelected(row))    status = "already";
  if (status) {
    await closeModePicker();
    return status;
  }

  console.debug(`[Ask Gemini] Clicking level row "${rowLabel(row)}" for level="${level}"`);
  row.scrollIntoView({ block: "nearest" });
  row.click();
  await waitForCondition(() => findMenuRows().length === 0, 3_000);
  return "switched";
}


// ══════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════════

/**
 * Uploads all pending images to Gemini and verifies that upload chips appear
 * in the DOM before returning.
 *
 * Tries Gemini's native file input first (more reliable across MIME types,
 * opening the "Upload & tools" menu to mount it), falls back to a synthetic
 * ClipboardEvent paste. After all files are dispatched, polls
 * `UPLOAD_CHIP_SELECTORS` for the expected number of chips. Returns
 * immediately with `reason: "signin-required"` when Gemini has uploads
 * disabled (signed-out session).
 *
 * @param {{ name: string, type: string, size: number, data: string }[]} files
 * @returns {Promise<{ success: boolean, failedCount: number, reason?: "signin-required" }>}
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

  // Snapshot chip count before upload to detect additions
  const baselineCount = new Set(
    UPLOAD_CHIP_SELECTORS.flatMap((s) => [...container.querySelectorAll(s)])
  ).size;
  console.debug(`[Ask Gemini] uploadFilesToGemini: baselineCount=${baselineCount}`);

  const { input: fileInput, openedMenu, signinRequired } = await revealFileInput();
  console.debug(`[Ask Gemini] uploadFilesToGemini: fileInput=${fileInput ? "found (" + (fileInput.accept || "no accept attr") + ")" : "NOT FOUND"}, openedMenu=${openedMenu}, signinRequired=${signinRequired}`);

  if (signinRequired) {
    closeUploadMenu();
    console.warn("[Ask Gemini] Gemini uploads are disabled (signed out) — not sending");
    return { success: false, failedCount: files.length, reason: "signin-required" };
  }

  const fileObjects = await Promise.all(files.map(toFile));
  if (fileInput) {
    // The input is `multiple`, so every file goes through one change event.
    const dt = new DataTransfer();
    fileObjects.forEach((f) => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    console.debug(`[Ask Gemini] uploadFilesToGemini: dispatched ${fileObjects.length} file(s) via file input`);
    if (openedMenu) closeUploadMenu();
  } else {
    if (openedMenu) closeUploadMenu();
    for (const file of fileObjects) {
      pasteFileToInput(file, inputEl);
      // Small gap so Gemini registers each image separately
      await new Promise((r) => setTimeout(r, 400));
    }
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
 * Converts a stored file record (data URL) back into a File.
 * @param {{ name: string, type: string, data: string }} fileData
 * @returns {Promise<File>}
 */
async function toFile({ name, type, data }) {
  const blob = await (await fetch(data)).blob();
  return new File([blob], name, { type });
}

/**
 * Fallback upload path: dispatches a synthetic ClipboardEvent paste of one
 * File on Gemini's contenteditable, used when no file input can be located.
 *
 * @param {File} file
 * @param {Element} inputEl  Gemini's contenteditable
 * @returns {void}
 */
function pasteFileToInput(file, inputEl) {
  const dt = new DataTransfer();
  dt.items.add(file);
  inputEl.focus();
  inputEl.dispatchEvent(new ClipboardEvent("paste", {
    bubbles:       true,
    cancelable:    true,
    clipboardData: dt,
  }));
  console.debug(`[Ask Gemini] pasteFileToInput: dispatched paste (fallback) for "${file.name}"`);
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
    findModelTrigger, findMenuRows, findLevelRows, findLevelRow, ensureThinkingLevel,
    waitForElement, waitForCondition, revealFileInput, uploadErrorMessage,
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