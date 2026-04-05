// ── popup.js ──────────────────────────────────────────────────
// Model switcher (Flash/Pro/Think), inline autocomplete, theme, history

import {
  GEMINI_URL,
  MAX_HISTORY,
  DEFAULT_TEMPLATES_BY_MODEL,
  INJECTION_PATTERNS,
} from "../shared/constants.js";

const MAX_CHARS = 2000;

// In floating-window mode the popup can be taller than the normal 360 px popup,
// so allow the textarea to grow proportionally. Clamped between 180 and 420 px.
const MAX_INPUT_H = Math.min(Math.max(180, Math.floor(window.innerHeight * 0.45)), 420);

// ══════════════════════════════════════════════════════════════════
// PROMPT INJECTION DETECTION
// ══════════════════════════════════════════════════════════════════

// INJECTION_PATTERNS is loaded from ../shared/constants.js

/**
 * Returns true if the text contains patterns that look like a prompt injection attempt.
 * @param {string} text
 * @returns {boolean}
 */
function detectPromptInjection(text) {
  return INJECTION_PATTERNS.some(re => re.test(text));
}

// ── DOM refs ───────────────────────────────────────────────────────
const input          = document.getElementById("questionInput");
const sendBtn        = document.getElementById("sendBtn");
const logoBtn        = document.getElementById("logoBtn");
const hint           = document.getElementById("hint");
const selBanner      = document.getElementById("selectionBanner");
const selText        = document.getElementById("selectionText");
const selClear       = document.getElementById("selectionClear");
const modelSwitcher  = document.getElementById("modelSwitcher");
const inputWrapper   = document.getElementById("inputWrapper");
// Dropdown (button-triggered)
const tmplDropdown   = document.getElementById("tmplDropdown");
const tmplList       = document.getElementById("tmplList");
const tmplEmpty      = document.getElementById("tmplEmpty");
const tmplCloseBtn   = document.getElementById("tmplCloseBtn");
const tmplTriggerBtn = document.getElementById("tmplTriggerBtn");
const tmplSettingsLink = document.getElementById("tmplSettingsLink");
// Inline AC strip
const acStrip        = document.getElementById("acStrip");
const acGhost        = document.getElementById("acGhost");
const acCounter      = document.getElementById("acCounter");
// File attachment
const attachBtn      = document.getElementById("attachBtn");
const fileInput      = document.getElementById("fileInput");
const fileChips      = document.getElementById("fileChips");
// Injection warning
const injectWarning  = document.getElementById("injectWarning");
const injectCancel   = document.getElementById("injectCancel");
const injectSendAnyway = document.getElementById("injectSendAnyway");
// Placeholder cycler
const phCycler       = document.getElementById("phCycler");

// ══════════════════════════════════════════════════════════════════
// 0. PLACEHOLDER CYCLER
// ══════════════════════════════════════════════════════════════════

const PLACEHOLDERS = [
  "Ask anything...",
  "/ for templates",
  "Shift+↵ for a new line",
  "Drag & drop images",
  "Summarize, translate, explain...",
  "Ask about the page you're reading",
];

let _phIdx    = 0;
let _phTimer  = null;

/** Advances the placeholder text to the next item with a fade animation. */
function phCycle() {
  phCycler.classList.remove("ph-enter");
  phCycler.classList.add("ph-exit");
  setTimeout(() => {
    _phIdx = (_phIdx + 1) % PLACEHOLDERS.length;
    phCycler.textContent = PLACEHOLDERS[_phIdx];
    phCycler.classList.remove("ph-exit");
    void phCycler.offsetWidth; // force reflow so animation restarts
    phCycler.classList.add("ph-enter");
  }, 250);
}

/** Shows/hides the placeholder cycler based on whether the input has content. */
function phUpdate() {
  if (input.value.length > 0) {
    phCycler.classList.add("ph-hidden");
    if (_phTimer) { clearInterval(_phTimer); _phTimer = null; }
  } else {
    if (phCycler.classList.contains("ph-hidden")) {
      phCycler.textContent = PLACEHOLDERS[_phIdx];
      phCycler.classList.remove("ph-hidden");
      void phCycler.offsetWidth;
      phCycler.classList.add("ph-enter");
    }
    if (!_phTimer) _phTimer = setInterval(phCycle, 5000);
  }
}

// ══════════════════════════════════════════════════════════════════
// 1. THEME
// ══════════════════════════════════════════════════════════════════

let currentTheme = "auto";

/**
 * Applies the given theme preference to the document root.
 * @param {"light"|"dark"|"auto"} pref
 */
function applyTheme(pref) {
  currentTheme = pref || "auto";
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.style.colorScheme =
    currentTheme === "light" ? "only light" :
    currentTheme === "dark"  ? "only dark"  : "";
}

// ══════════════════════════════════════════════════════════════════
// 2. MODEL SWITCHER  (flash | pro | thinking)
// ══════════════════════════════════════════════════════════════════

let currentModel = "flash";

/**
 * Sets the active model and updates the model-switcher button states.
 * @param {"flash"|"thinking"|"pro"} model
 */
function applyModel(model) {
  currentModel = model || "flash";
  document.querySelectorAll(".model-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.model === currentModel);
  });
}

modelSwitcher.addEventListener("click", async (e) => {
  const btn = e.target.closest(".model-opt");
  if (!btn || btn.dataset.model === currentModel) return;
  await chrome.storage.sync.set({ askGeminiModel: btn.dataset.model });
  applyModel(btn.dataset.model);
  await loadTemplatesForModel(btn.dataset.model);
  renderDropdownList();
  dismissAC();
});

// ══════════════════════════════════════════════════════════════════
// 3. TEMPLATES — storage & button-triggered dropdown
// ══════════════════════════════════════════════════════════════════

let templates = [];

/**
 * Loads the template list for the given model from storage into `templates`.
 * @param {"flash"|"thinking"|"pro"} model
 */
async function loadTemplatesForModel(model) {
  const { askGeminiTemplates } = await chrome.storage.sync.get("askGeminiTemplates");
  const defaults = DEFAULT_TEMPLATES_BY_MODEL[model] || DEFAULT_TEMPLATES_BY_MODEL.flash;
  if (!askGeminiTemplates) {
    templates = [...defaults];
  } else if (Array.isArray(askGeminiTemplates)) {
    // Migration compat: old flat array belongs to flash
    templates = model === "flash" ? askGeminiTemplates : [...defaults];
  } else {
    templates = askGeminiTemplates[model] ?? [...defaults];
  }
}

/** Re-renders the template dropdown list from the current `templates` array. */
function renderDropdownList() {
  tmplList.replaceChildren();
  if (templates.length === 0) { tmplEmpty.classList.add("visible"); return; }
  tmplEmpty.classList.remove("visible");

  templates.forEach(tpl => {
    const el = document.createElement("button");
    el.className = "tmpl-item";
    const display = tpl.replace(/\n/g, "↵").slice(0, 60);
    el.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="tmpl-item-text">${escapeHtml(display)}</span>`;
    el.addEventListener("click", () => { insertTemplate(tpl); closeDropdown(); });
    tmplList.appendChild(el);
  });
}

/**
 * Inserts the given template string into the input and moves the cursor to the end.
 * @param {string} tpl
 */
function insertTemplate(tpl) {
  input.value = tpl;
  input.dispatchEvent(new Event("input"));
  input.selectionStart = input.selectionEnd = input.value.length;
  input.focus();
}

// Dropdown open/close — with flow-in / flow-out panel animation
/**
 * Plays the flow-in or flow-out animation on the template trigger button.
 * @param {"in"|"out"} direction
 */
function animateTriggerBtn(direction) {
  const addCls    = direction === "in" ? "tmpl-flow-in"  : "tmpl-flow-out";
  const removeCls = direction === "in" ? "tmpl-flow-out" : "tmpl-flow-in";
  tmplTriggerBtn.classList.remove(removeCls);
  void tmplTriggerBtn.offsetWidth;
  tmplTriggerBtn.classList.add(addCls);
  const duration = direction === "in" ? 500 : 300;
  setTimeout(() => tmplTriggerBtn.classList.remove(addCls), duration);
}

/** Opens the template dropdown panel. */
function openDropdown() {
  clearTimeout(_closeTimer);
  tmplDropdown.style.display = "";      // clear any inline display:none
  tmplDropdown.classList.remove("hiding");
  tmplDropdown.classList.add("visible");
  tmplTriggerBtn.classList.add("active");
  animateTriggerBtn("in");
}

let _closeTimer = null;
/** Closes the template dropdown panel with a hide animation. */
function closeDropdown() {
  if (!tmplDropdown.classList.contains("visible")) return;
  tmplDropdown.classList.remove("visible");
  tmplDropdown.classList.add("hiding");
  tmplTriggerBtn.classList.remove("active");
  animateTriggerBtn("out");
  clearTimeout(_closeTimer);
  _closeTimer = setTimeout(() => {
    tmplDropdown.classList.remove("hiding");
    tmplDropdown.style.display = "none";
  }, 200);
}

/** Toggles the template dropdown open/closed. */
function toggleDropdown() { tmplDropdown.classList.contains("visible") ? closeDropdown() : openDropdown(); }

tmplTriggerBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleDropdown(); });
tmplCloseBtn.addEventListener("click", () => closeDropdown());
tmplSettingsLink.addEventListener("click", () => { closeDropdown(); chrome.runtime.openOptionsPage(); window.close(); });
document.addEventListener("click", (e) => {
  if (!tmplDropdown.contains(e.target) && e.target !== tmplTriggerBtn) closeDropdown();
});

// ══════════════════════════════════════════════════════════════════
// 4. INLINE AUTOCOMPLETE  (typing-mode)
//
//  Triggers when:
//    • The first non-whitespace character on the current line is '/'
//    • The cursor is not inside a fenced code block  (``` … ```)
//    • At least one template matches the text after '/'
//
//  Keys:
//    Tab   — cycle to next match (or accept if only one)
//    Enter — accept current match (don't submit)
//    Esc   — dismiss without accepting
//
//  Any other keystroke re-filters live; if no match → dismiss.
// ══════════════════════════════════════════════════════════════════

const ac = {
  active:    false,
  lineStart: 0,     // index in textarea.value where current line begins
  matches:   [],    // filtered template strings
  idx:       0,     // currently highlighted match
};

// ── helpers ───────────────────────────────────────────────────────

/**
 * Returns true if the cursor position `pos` is inside a fenced code block.
 * @param {string} text
 * @param {number} pos
 * @returns {boolean}
 */
function isInsideCodeBlock(text, pos) {
  // Count ``` fence markers before cursor; odd count = inside block
  let count = 0, search = 0;
  while (true) {
    const found = text.indexOf("```", search);
    if (found === -1 || found >= pos) break;
    count++;
    search = found + 3;
  }
  return (count % 2) !== 0;
}

/**
 * Returns null if AC should not fire, or
 * { lineStart, query } where query is the text after '/' on the line.
 */
function getACContext() {
  const val = input.value;
  const pos = input.selectionStart;

  // Only trigger when cursor is at end of selection (no selection range)
  if (input.selectionEnd !== pos) return null;

  // Find start of current line
  const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
  const lineContent = val.substring(lineStart, pos);

  // Line must start with '/' (allowing leading spaces is intentionally excluded
  // so it's truly "start of line" semantics, like a terminal command)
  if (!lineContent.startsWith("/")) return null;

  // Must not be inside a fenced code block
  if (isInsideCodeBlock(val, pos)) return null;

  // The query is everything after the '/'
  const query = lineContent.slice(1);

  return { lineStart, query };
}

/**
 * Returns templates whose text starts with `query` (case-insensitive).
 * @param {string} query
 * @returns {string[]}
 */
function filterTemplates(query) {
  const q = query.toLowerCase();
  // Match templates whose text (after trimming) starts with the query
  // Case-insensitive prefix match
  return templates.filter(t => t.toLowerCase().startsWith(q));
}

// ── AC state changes ──────────────────────────────────────────────

/**
 * Activates the autocomplete strip with the given matches.
 * @param {number}   lineStart  Index in textarea.value where the current line begins.
 * @param {string[]} matches    Filtered template strings.
 * @param {number}   [idx=0]    Initially highlighted match index.
 */
function openAC(lineStart, matches, idx = 0) {
  ac.active    = true;
  ac.lineStart = lineStart;
  ac.matches   = matches;
  ac.idx       = idx;
  inputWrapper.classList.add("ac-active");
  acStrip.classList.add("visible");
  renderACStrip();
}

/** Updates the AC strip UI to reflect the current match and typed prefix. */
function renderACStrip() {
  const match = ac.matches[ac.idx];
  const typedLen = input.value.length - ac.lineStart - 1; // chars typed after '/'

  // Split the match into the part already typed (green) and the rest (ghost)
  const typed      = match.slice(0, typedLen);           // what's already there sans '/'
  const completion = match.slice(typedLen);              // what tab would add

  // Display with newline symbol
  const typedHtml      = escapeHtml(typed.replace(/\n/g, "↵"));
  const completionHtml = escapeHtml(completion.replace(/\n/g, "↵"));

  acGhost.innerHTML = `<span class="ac-typed">/${typedHtml}</span><span class="ac-completion">${completionHtml}</span>`;

  acCounter.textContent = ac.matches.length > 1
    ? `${ac.idx + 1}/${ac.matches.length}`
    : "";
}

/** Hides the AC strip and resets autocomplete state. */
function dismissAC() {
  if (!ac.active) return;
  ac.active = false;
  acStrip.classList.remove("visible");
  inputWrapper.classList.remove("ac-active");
  acGhost.replaceChildren();
  acCounter.textContent = "";
}

/** Accepts the currently highlighted AC match, replacing the typed prefix with the full template. */
function acceptAC() {
  if (!ac.active || ac.matches.length === 0) return;

  const val    = input.value;
  const match  = ac.matches[ac.idx];
  const pos    = input.selectionStart;

  // Replace from lineStart to current cursor with the template
  const before = val.substring(0, ac.lineStart);
  const after  = val.substring(pos);
  input.value  = before + match + after;

  // Place cursor at end of inserted template
  const newPos = ac.lineStart + match.length;
  input.selectionStart = input.selectionEnd = newPos;

  input.dispatchEvent(new Event("input"));
  dismissAC();
}

/** Advances to the next AC match, wrapping around. */
function cycleAC() {
  ac.idx = (ac.idx + 1) % ac.matches.length;
  renderACStrip();
}

// ── the main AC update — called on every 'input' event ───────────

/** Re-evaluates autocomplete state after each input event. */
function updateAC() {
  const ctx = getACContext();

  if (!ctx) { dismissAC(); return; }

  const { lineStart, query } = ctx;
  const matches = filterTemplates(query);

  if (matches.length === 0) { dismissAC(); return; }

  if (ac.active) {
    // Update in place — preserve idx if possible
    ac.lineStart = lineStart;
    ac.matches   = matches;
    ac.idx       = Math.min(ac.idx, matches.length - 1);
    renderACStrip();
  } else {
    openAC(lineStart, matches, 0);
  }
}

// ══════════════════════════════════════════════════════════════════
// 5. FILE ATTACHMENT
// ══════════════════════════════════════════════════════════════════

const MAX_FILES     = 4;
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB per file

let attachedFiles = []; // File[]

/**
 * Reads a File as a base64-encoded data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Re-renders the file chip list from the current `attachedFiles` array. */
function renderFileChips() {
  fileChips.querySelectorAll(".file-chip-thumb").forEach(img => URL.revokeObjectURL(img.src));
  fileChips.replaceChildren();
  attachedFiles.forEach((file, i) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";

    const img = document.createElement("img");
    img.className = "file-chip-thumb";
    img.alt = "";
    img.src = URL.createObjectURL(file);
    chip.appendChild(img);

    const nameEl = document.createElement("span");
    nameEl.className = "file-chip-name";
    nameEl.textContent = file.name;
    chip.appendChild(nameEl);

    const removeBtn = document.createElement("button");
    removeBtn.className = "file-chip-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", () => {
      attachedFiles.splice(i, 1);
      renderFileChips();
      updateSendBtn();
    });
    chip.appendChild(removeBtn);
    fileChips.appendChild(chip);
  });

  attachBtn.classList.toggle("has-files", attachedFiles.length > 0);
}

/**
 * Returns true if the file's leading bytes match a known safe image format.
 * Rejects SVG (can embed arbitrary text prompts) and unrecognised magic bytes.
 * @param {File} file
 * @returns {Promise<boolean>}
 */
function validateImageMagicBytes(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b = new Uint8Array(e.target.result);
      const isJpeg = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
      const isPng  = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
      const isGif  = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
      const isWebP = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
                  && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
      const isBmp  = b[0] === 0x42 && b[1] === 0x4D;
      const isTiff = (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A)
                  || (b[0] === 0x4D && b[1] === 0x4D && b[3] === 0x2A);
      resolve(isJpeg || isPng || isGif || isWebP || isBmp || isTiff);
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 12));
  });
}

// ── Hint bar state ────────────────────────────────────────────────
let _shiftHeld       = false;
let _defaultHintActive = true;

/** Resets the hint bar to the default "↵ Send" / "Shift+↵ Newline" text. */
function setDefaultHint() {
  _defaultHintActive = true;
  hint.textContent   = _shiftHeld ? "Shift+↵ Newline" : "↵ Send";
  hint.style.color   = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Shift" && !_shiftHeld) {
    _shiftHeld = true;
    if (_defaultHintActive) hint.textContent = "Shift+↵ Newline";
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") {
    _shiftHeld = false;
    if (_defaultHintActive) hint.textContent = "↵ Send";
  }
});

/**
 * Displays a transient error message in the hint bar, then restores the default.
 * @param {string} msg
 */
function showFileError(msg) {
  _defaultHintActive = false;
  hint.textContent = msg;
  hint.style.color = "#f05050";
  setTimeout(() => setDefaultHint(), 3000);
}

/**
 * Validates and adds files from a FileList to `attachedFiles`, showing errors
 * for rejected items and enforcing the MAX_FILES limit.
 * @param {FileList} fileList
 */
async function addFiles(fileList) {
  const candidates = Array.from(fileList);
  const toAdd = [];

  for (const file of candidates) {
    // Block SVG — can contain embedded text prompts and scripts
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      showFileError(`"${file.name}" rejected: SVG files are not allowed`);
      console.warn(`[Ask Gemini] "${file.name}" rejected: SVG files are not allowed`);
      continue;
    }
    if (!file.type.startsWith("image/")) {
      showFileError(`"${file.name}" is not an image`);
      console.warn(`[Ask Gemini] "${file.name}" is not an image — skipped`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      showFileError(`"${file.name}" exceeds 4 MB`);
      console.warn(`[Ask Gemini] "${file.name}" exceeds 4 MB — skipped`);
      continue;
    }
    // Validate magic bytes to ensure the file content matches its declared type
    const validBytes = await validateImageMagicBytes(file);
    if (!validBytes) {
      showFileError(`"${file.name}" rejected: file content does not match image format`);
      console.warn(`[Ask Gemini] "${file.name}" rejected: magic bytes do not match an image format`);
      continue;
    }
    toAdd.push(file);
  }

  const slots = MAX_FILES - attachedFiles.length;
  if (toAdd.length > slots) {
    showFileError(`Max ${MAX_FILES} images — ${toAdd.length - slots} file${toAdd.length - slots > 1 ? "s" : ""} skipped`);
  }
  attachedFiles.push(...toAdd.slice(0, slots));
  renderFileChips();
  updateSendBtn();
}

/** Enables or disables the send button based on input length and char limit. */
function updateSendBtn() {
  const len = input.value.length;
  sendBtn.disabled = input.value.trim().length === 0 || len > MAX_CHARS;
}

attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) addFiles(fileInput.files);
  fileInput.value = ""; // reset so the same file can be re-selected
});

// Drag & drop onto the input wrapper
inputWrapper.addEventListener("dragenter", (e) => {
  if (e.dataTransfer.types.includes("Files")) {
    e.preventDefault();
    inputWrapper.classList.add("drag-over");
  }
});
inputWrapper.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    inputWrapper.classList.add("drag-over");
  }
});
inputWrapper.addEventListener("dragleave", (e) => {
  if (!inputWrapper.contains(e.relatedTarget)) {
    inputWrapper.classList.remove("drag-over");
  }
});
inputWrapper.addEventListener("drop", (e) => {
  e.preventDefault();
  inputWrapper.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
});

// ══════════════════════════════════════════════════════════════════
// 6. INPUT EVENTS
// ══════════════════════════════════════════════════════════════════

input.addEventListener("input", () => {
  // Auto-resize
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, MAX_INPUT_H) + "px";

  // Char counter / hint
  const len = input.value.length;
  if (len > MAX_CHARS * 0.8) {
    const rem = MAX_CHARS - len;
    _defaultHintActive = false;
    hint.textContent = rem >= 0 ? `${rem} chars left` : `${Math.abs(rem)} over limit`;
    hint.style.color = rem < 0 ? "#f05050" : rem < 200 ? "#f0a04b" : "";
  } else {
    setDefaultHint();
  }

  updateSendBtn();
  chrome.storage.session.set({ askGeminiDraft: input.value });

  phUpdate();
  updateAC();
});

input.addEventListener("keydown", (e) => {
  // ── AC key handling (highest priority) ───────────────────────
  if (ac.active) {
    if (e.key === "Tab") {
      e.preventDefault(); // never insert tab
      if (ac.matches.length === 1) {
        acceptAC();
      } else {
        cycleAC();
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // accept, don't submit
      acceptAC();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      dismissAC();
      return;
    }
    // Any other key: let it through, updateAC() will re-evaluate on 'input'
    return;
  }

  // ── Normal key handling ───────────────────────────────────────
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askGemini();
  }
  if (e.key === "Escape") {
    closeDropdown();
  }
});

// ══════════════════════════════════════════════════════════════════
// 7. SELECTED-TEXT AUTO-FILL
// ══════════════════════════════════════════════════════════════════

/**
 * Reads the active tab's selected text and pre-fills the input with it.
 * @returns {Promise<boolean>} true if a selection was applied
 */
async function tryAutoFillSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim() ?? "",
    });

    const selected = results?.[0]?.result;
    // Selection always takes priority over the saved draft.
    if (selected && selected.length > 0 && selected.length <= MAX_CHARS) {
      input.value = selected;
      input.dispatchEvent(new Event("input"));
      input.select();
      const preview = selected.length > 58 ? selected.slice(0, 58) + "…" : selected;
      selText.textContent = `"${preview}"`;
      selBanner.classList.add("visible");
      return true; // signal: selection was applied
    }
    return false;
  } catch (_) { /* tab not scriptable */ }
}

selClear.addEventListener("click", () => {
  selBanner.classList.remove("visible");
  input.value = "";
  chrome.storage.session.remove("askGeminiDraft");
  input.dispatchEvent(new Event("input"));
  input.focus();
});

// ══════════════════════════════════════════════════════════════════
// 8. HISTORY
// ══════════════════════════════════════════════════════════════════

/**
 * Prepends `message` to the local history, deduplicating and capping at MAX_HISTORY.
 * @param {string} message
 */
async function saveToHistory(message) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const deduped = askGeminiHistory.filter(h => h.text !== message);
  deduped.unshift({ text: message, ts: Date.now() });
  await chrome.storage.local.set({ askGeminiHistory: deduped.slice(0, MAX_HISTORY) });
}

// ══════════════════════════════════════════════════════════════════
// 9. SEND
// ══════════════════════════════════════════════════════════════════

let _injectionAcknowledged = false;

/** Shows the prompt-injection warning banner. */
function showInjectWarning() { injectWarning.classList.add("visible"); }
/** Hides the prompt-injection warning banner. */
function hideInjectWarning() { injectWarning.classList.remove("visible"); }

injectCancel.addEventListener("click", () => hideInjectWarning());
injectSendAnyway.addEventListener("click", () => {
  hideInjectWarning();
  _injectionAcknowledged = true;
  askGemini();
});

sendBtn.addEventListener("click", () => askGemini());

/**
 * Validates the input, writes the pending message (and any attached files) to
 * storage, saves it to history, then opens/focuses the Gemini tab.
 */
async function askGemini() {
  const message = input.value.trim();
  if (!message || message.length > MAX_CHARS) return;

  if (detectPromptInjection(message) && !_injectionAcknowledged) {
    showInjectWarning();
    return;
  }
  _injectionAcknowledged = false;

  sendBtn.classList.add("sending");
  sendBtn.disabled = true;
  input.disabled   = true;
  dismissAC();

  try {
    const storagePayload = { pendingMessage: message, pendingModel: currentModel };

    if (attachedFiles.length > 0) {
      storagePayload.pendingFiles = await Promise.all(
        attachedFiles.map(async (f) => ({
          name: f.name,
          type: f.type,
          size: f.size,
          data: await fileToBase64(f),
        }))
      );
      attachedFiles = [];
      renderFileChips();
    }

    await chrome.storage.local.set(storagePayload);
    await saveToHistory(message);
    chrome.storage.session.remove("askGeminiDraft");
    input.value = "";

    const tabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { url: GEMINI_URL, active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: GEMINI_URL });
    }
  } catch (err) {
    console.error("Ask Gemini error:", err);
    sendBtn.classList.remove("sending");
    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
    return;
  }
  setTimeout(() => window.close(), 120);
}

// ══════════════════════════════════════════════════════════════════
// 10. FOOTER BUTTONS
// ══════════════════════════════════════════════════════════════════

logoBtn.addEventListener("click", () => { chrome.tabs.create({ url: GEMINI_URL }); window.close(); });

// ══════════════════════════════════════════════════════════════════
// 11. HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * Escapes HTML special characters to prevent XSS when interpolating into markup.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* istanbul ignore next — test hook, never runs inside the real extension */
if (typeof globalThis !== "undefined" && globalThis.__TEST__) {
  Object.assign(globalThis.__TEST__, { escapeHtml, isInsideCodeBlock, filterTemplates, saveToHistory });
}

// ══════════════════════════════════════════════════════════════════
// 12. INIT
// ══════════════════════════════════════════════════════════════════

sendBtn.disabled = true;

(async () => {
  const data = await chrome.storage.sync.get(["askGeminiTheme", "askGeminiModel"]);

  applyTheme(data.askGeminiTheme || "auto");
  applyModel(data.askGeminiModel || "flash");

  await loadTemplatesForModel(currentModel);
  renderDropdownList();

  // Priority: selection > draft.
  // 1. Check for selected text first — if found, it fills the input and we stop.
  // 2. Only if no selection, restore the saved draft.
  const selectionApplied = await tryAutoFillSelection();
  if (!selectionApplied) {
    const { askGeminiDraft: draft } = await chrome.storage.session.get("askGeminiDraft");
    if (draft) {
      input.value = draft;
      input.dispatchEvent(new Event("input"));
      input.selectionStart = input.selectionEnd = draft.length;
    }
  }

  phUpdate();
  input.focus();
})();