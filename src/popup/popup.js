// ── popup.js ──────────────────────────────────────────────────
// Model switcher (Flash/Pro/Think), inline autocomplete, theme, history

const GEMINI_URL  = "https://gemini.google.com/app";
const MAX_CHARS   = 2000;
const MAX_HISTORY = 20;

const DEFAULT_TEMPLATES = [
  "Summarise: ",
  "Translate to English: ",
  "Fix this code:\n",
  "Explain simply: ",
  "Pros and cons of: ",
];

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

// ══════════════════════════════════════════════════════════════════
// 1. THEME
// ══════════════════════════════════════════════════════════════════

let currentTheme = "auto";

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

function applyModel(model) {
  currentModel = model || "flash";
  document.querySelectorAll(".model-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.model === currentModel);
  });
}

modelSwitcher.addEventListener("click", async (e) => {
  const btn = e.target.closest(".model-opt");
  if (!btn || btn.dataset.model === currentModel) return;
  await chrome.storage.local.set({ askGeminiModel: btn.dataset.model });
  applyModel(btn.dataset.model);
});

// ══════════════════════════════════════════════════════════════════
// 3. TEMPLATES — storage & button-triggered dropdown
// ══════════════════════════════════════════════════════════════════

let templates = [];

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

function insertTemplate(tpl) {
  input.value = tpl;
  input.dispatchEvent(new Event("input"));
  input.selectionStart = input.selectionEnd = input.value.length;
  input.focus();
}

// Dropdown open/close — with flow-in / flow-out panel animation
function animateTriggerBtn(direction) {
  const addCls    = direction === "in" ? "tmpl-flow-in"  : "tmpl-flow-out";
  const removeCls = direction === "in" ? "tmpl-flow-out" : "tmpl-flow-in";
  tmplTriggerBtn.classList.remove(removeCls);
  void tmplTriggerBtn.offsetWidth;
  tmplTriggerBtn.classList.add(addCls);
  const duration = direction === "in" ? 500 : 300;
  setTimeout(() => tmplTriggerBtn.classList.remove(addCls), duration);
}

function openDropdown() {
  clearTimeout(_closeTimer);
  tmplDropdown.style.display = "";      // clear any inline display:none
  tmplDropdown.classList.remove("hiding");
  tmplDropdown.classList.add("visible");
  tmplTriggerBtn.classList.add("active");
  animateTriggerBtn("in");
}

let _closeTimer = null;
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

function filterTemplates(query) {
  const q = query.toLowerCase();
  // Match templates whose text (after trimming) starts with the query
  // Case-insensitive prefix match
  return templates.filter(t => t.toLowerCase().startsWith(q));
}

// ── AC state changes ──────────────────────────────────────────────

function openAC(lineStart, matches, idx = 0) {
  ac.active    = true;
  ac.lineStart = lineStart;
  ac.matches   = matches;
  ac.idx       = idx;
  inputWrapper.classList.add("ac-active");
  acStrip.classList.add("visible");
  renderACStrip();
}

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

function dismissAC() {
  if (!ac.active) return;
  ac.active = false;
  acStrip.classList.remove("visible");
  inputWrapper.classList.remove("ac-active");
  acGhost.replaceChildren();
  acCounter.textContent = "";
}

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

function cycleAC() {
  ac.idx = (ac.idx + 1) % ac.matches.length;
  renderACStrip();
}

// ── the main AC update — called on every 'input' event ───────────

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderFileChips() {
  fileChips.replaceChildren();
  attachedFiles.forEach((file, i) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";

    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.className = "file-chip-thumb";
      img.alt = "";
      img.src = URL.createObjectURL(file);
      chip.appendChild(img);
    } else {
      // Generic file icon (SVG via DOM, no innerHTML)
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "file-chip-icon");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p1.setAttribute("d", "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z");
      p1.setAttribute("stroke", "currentColor");
      p1.setAttribute("stroke-width", "2");
      p1.setAttribute("stroke-linejoin", "round");
      const p2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      p2.setAttribute("points", "14 2 14 8 20 8");
      p2.setAttribute("stroke", "currentColor");
      p2.setAttribute("stroke-width", "2");
      p2.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p1);
      svg.appendChild(p2);
      chip.appendChild(svg);
    }

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

function addFiles(fileList) {
  const toAdd = Array.from(fileList).filter(file => {
    if (file.size > MAX_FILE_SIZE) {
      console.warn(`[Ask Gemini] File "${file.name}" exceeds 4 MB — skipped`);
      return false;
    }
    return true;
  });
  const slots = MAX_FILES - attachedFiles.length;
  attachedFiles.push(...toAdd.slice(0, slots));
  renderFileChips();
  updateSendBtn();
}

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
  input.style.height = Math.min(input.scrollHeight, 180) + "px";

  // Char counter / hint
  const len = input.value.length;
  if (len > MAX_CHARS * 0.8) {
    const rem = MAX_CHARS - len;
    hint.textContent = rem >= 0 ? `${rem} chars left` : `${Math.abs(rem)} over limit`;
    hint.style.color = rem < 0 ? "#f05050" : rem < 200 ? "#f0a04b" : "";
  } else {
    hint.textContent = "↵ Enter to send";
    hint.style.color = "";
  }

  updateSendBtn();
  chrome.storage.session.set({ askGeminiDraft: input.value });

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

async function saveToHistory(message) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const deduped = askGeminiHistory.filter(h => h.text !== message);
  deduped.unshift({ text: message, ts: Date.now() });
  await chrome.storage.local.set({ askGeminiHistory: deduped.slice(0, MAX_HISTORY) });
}

// ══════════════════════════════════════════════════════════════════
// 9. SEND
// ══════════════════════════════════════════════════════════════════

sendBtn.addEventListener("click", () => askGemini());

async function askGemini() {
  const message = input.value.trim();
  if (!message || message.length > MAX_CHARS) return;

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
  const data = await chrome.storage.local.get(["askGeminiTheme", "askGeminiModel", "askGeminiTemplates"]);

  applyTheme(data.askGeminiTheme || "auto");
  applyModel(data.askGeminiModel || "flash");

  // Seed templates
  if (data.askGeminiTemplates) {
    templates = data.askGeminiTemplates;
  } else {
    await chrome.storage.local.set({ askGeminiTemplates: DEFAULT_TEMPLATES });
    templates = [...DEFAULT_TEMPLATES];
  }
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

  input.focus();
})();