// ── options.js ────────────────────────────────────────────────
// Settings page: history, templates, appearance (theme + model),
// context menu actions, shortcut, about

import {
  GEMINI_URL,
  DEFAULT_SUMMARIZE_PREFIX,
  DEFAULT_TEMPLATES_BY_MODEL,
  DEFAULT_PROMPT_ENG_RULES,
} from "../shared/constants.js";
import { t, localizeModelName } from "../shared/stringUtils.js";
import { applyI18n } from "../shared/i18nDom.js";

const PE_TEMPLATE_MAX = 400;

const SUMMARIZE_PREFIX_MAX = 300;

// ── Textarea auto-resize (max 7 visible lines, scrollbar beyond) ──
/**
 * Resizes a textarea to fit its content up to 7 visible lines.
 * @param {HTMLTextAreaElement} ta
 */
function autoResizeTextarea(ta) {
  const MAX_LINES = 7;
  ta.style.height = "auto";
  const style = getComputedStyle(ta);
  const lineHeight = parseFloat(style.lineHeight);
  const paddingV = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const maxHeight = lineHeight * MAX_LINES + paddingV;
  ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
}

// ══════════════════════════════════════════════════════════════════
// 1. SECTION NAVIGATION
// ══════════════════════════════════════════════════════════════════

document.querySelectorAll(".nav-item").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const target = link.dataset.section;
    document.querySelectorAll(".nav-item").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    link.classList.add("active");
    const section = document.getElementById(`section-${target}`);
    section?.classList.add("active");
    section?.querySelectorAll(".pe-rule-textarea").forEach(autoResizeTextarea);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. VERSION
// ══════════════════════════════════════════════════════════════════

const manifest = chrome.runtime.getManifest();
const ver = `v${manifest.version}`;
document.getElementById("extVersion").textContent   = ver;
document.getElementById("aboutVersion").textContent = t("options_about_version", manifest.version);

document.getElementById("brandLogoBtn").addEventListener("click", () => chrome.tabs.create({ url: GEMINI_URL }));
document.getElementById("aboutLogoBtn").addEventListener("click", () => chrome.tabs.create({ url: GEMINI_URL }));

// ══════════════════════════════════════════════════════════════════
// 3. SHORTCUT DISPLAY
// ══════════════════════════════════════════════════════════════════

const shortcutDisplay = document.getElementById("shortcutDisplay");
const shortcutEditBtn = document.getElementById("shortcutEditBtn");

/**
 * Renders the keyboard shortcut as styled <kbd> elements inside `shortcutDisplay`.
 * @param {string} shortcutStr  e.g. "Ctrl+Shift+L"
 */
function renderShortcutKeys(shortcutStr) {
  shortcutDisplay.replaceChildren();
  if (!shortcutStr) {
    const span = document.createElement("span");
    span.style.cssText = "color:var(--text-hint);font-size:12px";
    span.textContent = t("options_shortcut_not_set");
    shortcutDisplay.appendChild(span);
    return;
  }
  shortcutStr.split("+").forEach((part, i, arr) => {
    const kbd = document.createElement("kbd");
    kbd.textContent = part;
    shortcutDisplay.appendChild(kbd);
    if (i < arr.length - 1) {
      const sep = document.createElement("span");
      sep.className = "key-sep";
      sep.textContent = "+";
      shortcutDisplay.appendChild(sep);
    }
  });
}

/** Reads the registered keyboard shortcut from the browser and renders it. */
async function loadShortcut() {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find(c => c.name === "open_popup");
  renderShortcutKeys(cmd?.shortcut || "");
}

/** Opens the Chrome extensions shortcuts page in a new tab. */
function openShortcutSettings() {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}

shortcutEditBtn.addEventListener("click", openShortcutSettings);

document.getElementById("shortcutPageLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  openShortcutSettings();
});

// ══════════════════════════════════════════════════════════════════
// 4. THEME
// ══════════════════════════════════════════════════════════════════

let currentTheme = "auto";

/**
 * Applies the given theme preference to the document root and updates the segment control.
 * @param {"light"|"dark"|"auto"} pref
 */
function applyTheme(pref) {
  currentTheme = pref || "auto";
  document.documentElement.dataset.theme = currentTheme;
  document.documentElement.style.colorScheme =
    currentTheme === "light" ? "only light" :
    currentTheme === "dark"  ? "only dark"  : "";
  document.querySelectorAll("#themeControl .seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === currentTheme);
  });
}

document.getElementById("themeControl")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  const val = btn.dataset.value;
  if (val === currentTheme) return;
  await chrome.storage.sync.set({ askGeminiTheme: val });
  applyTheme(val);
});

// ══════════════════════════════════════════════════════════════════
// 5. MODEL PREFERENCE
// ══════════════════════════════════════════════════════════════════

let currentModel = "flash";

/**
 * Sets the active model and updates the model segment control.
 * @param {"flash"|"thinking"|"pro"} model
 */
function applyModel(model) {
  currentModel = model || "flash";
  document.querySelectorAll("#modelControl .seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === currentModel);
  });
}

document.getElementById("modelControl")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  const val = btn.dataset.value;
  if (val === currentModel) return;
  await chrome.storage.sync.set({ askGeminiModel: val });
  applyModel(val);
  showToast(t("options_toast_model_set", localizeModelName(val)));
});

// ══════════════════════════════════════════════════════════════════
// 6. HISTORY
// ══════════════════════════════════════════════════════════════════

const historyList   = document.getElementById("historyList");
const emptyState    = document.getElementById("emptyState");
const searchInput   = document.getElementById("historySearch");
const clearBtn      = document.getElementById("clearHistoryBtn");
const overlay       = document.getElementById("confirmOverlay");
const confirmOk     = document.getElementById("confirmOk");
const confirmCancel = document.getElementById("confirmCancel");

let allHistory = [];

/** Loads history from local storage and renders it. */
async function loadHistory() {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  allHistory = askGeminiHistory;
  renderHistory(allHistory, searchInput.value.trim());
}

/**
 * Renders the history list, optionally filtered by a search query.
 * @param {{ text: string, ts: number }[]} items
 * @param {string} [query=""]
 */
function renderHistory(items, query = "") {
  historyList.replaceChildren();
  const filtered = query
    ? items.filter(h => h.text.toLowerCase().includes(query.toLowerCase()))
    : items;

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    emptyState.querySelector("p").textContent    = query ? t("options_history_no_matches_title") : t("options_history_empty_title");
    emptyState.querySelector("span").textContent = query
      ? t("options_history_no_matches_sub", query)
      : t("options_history_empty_sub");
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "history-item";
    el.style.animationDelay = `${idx * 18}ms`;

    const displayText = query ? highlightMatch(item.text, query) : escapeHtml(item.text);

    el.innerHTML = `
      <span class="history-idx">${idx + 1}</span>
      <div class="history-body">
        <div class="history-text">${displayText}</div>
        <div class="history-time">${formatTime(item.ts)}</div>
      </div>
      <div class="history-actions">
        <button class="hist-btn" title="${t("options_history_send_title")}" data-action="send" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="hist-btn" title="${t("options_history_copy_title")}" data-action="copy" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button class="hist-btn danger" title="${t("options_history_delete_title")}" data-action="delete" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    el.addEventListener("click", (e) => {
      if (e.target.closest(".hist-btn")) return;
      sendPrompt(item.text);
    });

    el.querySelectorAll(".hist-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const text   = btn.dataset.text;
        const action = btn.dataset.action;
        if (action === "send")   sendPrompt(text);
        if (action === "copy")   await copyToClipboard(text, btn);
        if (action === "delete") await deleteHistoryItem(text);
      });
    });

    historyList.appendChild(el);
  });
}

/**
 * Writes `text` as a pending message to storage and opens/focuses a Gemini tab.
 * @param {string} text
 */
async function sendPrompt(text) {
  await chrome.storage.local.set({ pendingMessage: text });
  const tabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { url: GEMINI_URL, active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: GEMINI_URL });
  }
}

/**
 * Copies `text` to the clipboard and briefly shows a checkmark on `btn`.
 * @param {string}      text
 * @param {HTMLElement} btn
 */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const origChildren = [...btn.childNodes];
    btn.innerHTML = "<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M20 6L9 17l-5-5\" stroke=\"#7c6af7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
    setTimeout(() => { btn.replaceChildren(...origChildren); }, 1200);
    showToast(t("options_toast_copied"));
  } catch (_) { showToast(t("options_toast_copy_failed")); }
}

/**
 * Removes the history entry matching `text` from storage and re-renders the list.
 * @param {string} text
 */
async function deleteHistoryItem(text) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const updated = askGeminiHistory.filter(h => h.text !== text);
  await chrome.storage.local.set({ askGeminiHistory: updated });
  allHistory = updated;
  renderHistory(allHistory, searchInput.value.trim());
  showToast(t("options_toast_entry_removed"));
}

clearBtn.addEventListener("click", () => {
  if (allHistory.length === 0) return;
  overlay.classList.add("visible");
});

confirmCancel.addEventListener("click", () => overlay.classList.remove("visible"));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("visible"); });

confirmOk.addEventListener("click", async () => {
  await chrome.storage.local.set({ askGeminiHistory: [] });
  allHistory = [];
  renderHistory([]);
  overlay.classList.remove("visible");
  showToast(t("options_toast_history_cleared"));
});

searchInput.addEventListener("input", () => {
  renderHistory(allHistory, searchInput.value.trim());
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.askGeminiHistory) {
    allHistory = changes.askGeminiHistory.newValue ?? [];
    renderHistory(allHistory, searchInput.value.trim());
  }
});

// ══════════════════════════════════════════════════════════════════
// 7. TEMPLATES  (per-model)
// ══════════════════════════════════════════════════════════════════

const TMPL_MODELS = ["flash", "thinking", "pro"];

const addTemplateBtn    = document.getElementById("addTemplateBtn");
const tmplFormCard      = document.getElementById("tmplFormCard");
const tmplFormLabel     = document.getElementById("tmplFormLabel");
const tmplTextarea      = document.getElementById("tmplTextarea");
const tmplCharCount     = document.getElementById("tmplCharCount");
const tmplCancelBtn     = document.getElementById("tmplCancelBtn");
const tmplSaveBtn       = document.getElementById("tmplSaveBtn");
const tmplCardList      = document.getElementById("tmplCardList");
const tmplEmptyState    = document.getElementById("tmplEmptyState");
const tmplDeleteOverlay = document.getElementById("tmplDeleteOverlay");
const tmplDeleteBody    = document.getElementById("tmplDeleteBody");
const tmplDeleteCancel  = document.getElementById("tmplDeleteCancel");
const tmplDeleteConfirm = document.getElementById("tmplDeleteConfirm");
const tmplModelTabs     = document.getElementById("tmplModelTabs");

let allTemplatesByModel = { flash: [], thinking: [], pro: [] };
let activeTemplateModel = "flash";
let editingIndex        = -1;
let pendingDeleteIndex  = -1;

/**
 * Returns the template array for the currently active model tab.
 * @returns {string[]}
 */
function getActiveTemplates() { return allTemplatesByModel[activeTemplateModel] || []; }

/** Persists `allTemplatesByModel` to sync storage. */
async function saveTemplates() {
  await chrome.storage.sync.set({ askGeminiTemplates: allTemplatesByModel });
}

/** Loads per-model templates from sync storage, migrating legacy flat arrays if needed. */
async function loadTemplates() {
  const { askGeminiTemplates, askGeminiModel } = await chrome.storage.sync.get(["askGeminiTemplates", "askGeminiModel"]);

  // Default active tab to current model pref
  if (askGeminiModel && TMPL_MODELS.includes(askGeminiModel)) {
    activeTemplateModel = askGeminiModel;
  }

  if (!askGeminiTemplates) {
    // First run — seed all models with defaults
    allTemplatesByModel = {
      flash:    [...DEFAULT_TEMPLATES_BY_MODEL.flash],
      thinking: [...DEFAULT_TEMPLATES_BY_MODEL.thinking],
      pro:      [...DEFAULT_TEMPLATES_BY_MODEL.pro],
    };
    await saveTemplates();
  } else if (Array.isArray(askGeminiTemplates)) {
    // Migration: old flat array → assign to flash, seed others
    allTemplatesByModel = {
      flash:    askGeminiTemplates,
      thinking: [...DEFAULT_TEMPLATES_BY_MODEL.thinking],
      pro:      [...DEFAULT_TEMPLATES_BY_MODEL.pro],
    };
    await saveTemplates();
  } else {
    // Normal load — ensure all model keys exist
    allTemplatesByModel = {
      flash:    askGeminiTemplates.flash    ?? [...DEFAULT_TEMPLATES_BY_MODEL.flash],
      thinking: askGeminiTemplates.thinking ?? [...DEFAULT_TEMPLATES_BY_MODEL.thinking],
      pro:      askGeminiTemplates.pro      ?? [...DEFAULT_TEMPLATES_BY_MODEL.pro],
    };
  }

  renderModelTabs();
  renderTemplates();
}

/** Updates model tab active states and badge counts. */
function renderModelTabs() {
  tmplModelTabs.querySelectorAll(".tmpl-model-tab").forEach(btn => {
    const model = btn.dataset.model;
    btn.classList.toggle("active", model === activeTemplateModel);
    const badge = btn.querySelector(".tmpl-tab-badge");
    if (badge) badge.textContent = (allTemplatesByModel[model] || []).length;
  });
}

/** Re-renders the template card list for the active model. */
function renderTemplates() {
  tmplCardList.replaceChildren();
  const templates = getActiveTemplates();

  if (templates.length === 0) {
    tmplEmptyState.style.display = "flex";
    return;
  }
  tmplEmptyState.style.display = "none";

  templates.forEach((tpl, idx) => {
    const el = document.createElement("div");
    el.className = "tmpl-card";
    el.style.animationDelay = `${idx * 18}ms`;

    const displayHtml = escapeHtml(tpl).replace(/\n/g, '<span class="newline-sym">↵\n</span>');

    el.innerHTML = `
      <span class="tmpl-card-idx">${idx + 1}</span>
      <div class="tmpl-card-text">${displayHtml}</div>
      <div class="tmpl-card-actions">
        <button class="hist-btn" title="${t("options_tmpl_edit_title")}" data-action="edit" data-idx="${idx}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="hist-btn danger" title="${t("options_tmpl_delete_title")}" data-action="delete" data-idx="${idx}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    el.querySelectorAll(".hist-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const i      = parseInt(btn.dataset.idx, 10);
        if (action === "edit")   openEditForm(i);
        if (action === "delete") confirmDeleteTemplate(i);
      });
    });

    tmplCardList.appendChild(el);
  });
}

// Tab switching
tmplModelTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".tmpl-model-tab");
  if (!btn || btn.dataset.model === activeTemplateModel) return;

  // Close form if open
  if (tmplFormCard.style.display !== "none") {
    tmplFormCard.style.display = "none";
    tmplTextarea.value = "";
    editingIndex = -1;
  }

  activeTemplateModel = btn.dataset.model;
  renderModelTabs();
  renderTemplates();
});

addTemplateBtn.addEventListener("click", () => {
  editingIndex = -1;
  tmplFormLabel.textContent = t("options_tmpl_form_new", localizeModelName(activeTemplateModel));
  tmplTextarea.value = "";
  tmplSaveBtn.disabled = true;
  updateCharCount();
  tmplFormCard.style.display = "block";
  tmplTextarea.focus();
  tmplFormCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

/**
 * Opens the template edit form pre-filled with the template at `idx`.
 * @param {number} idx
 */
function openEditForm(idx) {
  editingIndex = idx;
  tmplFormLabel.textContent = t("options_tmpl_form_edit", String(idx + 1), localizeModelName(activeTemplateModel));
  tmplTextarea.value = getActiveTemplates()[idx];
  updateCharCount();
  tmplSaveBtn.disabled = tmplTextarea.value.trim().length === 0;
  tmplFormCard.style.display = "block";
  tmplTextarea.focus();
  tmplFormCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/** Updates the character counter and over-limit styling for the template textarea. */
function updateCharCount() {
  const len = tmplTextarea.value.length;
  const max = 400;
  tmplCharCount.textContent = `${len} / ${max}`;
  tmplCharCount.classList.toggle("warn", len > max * 0.8 && len <= max);
  tmplCharCount.classList.toggle("over", len > max);
}

tmplTextarea.addEventListener("input", () => {
  updateCharCount();
  tmplSaveBtn.disabled = tmplTextarea.value.trim().length === 0 || tmplTextarea.value.length > 400;
});

tmplCancelBtn.addEventListener("click", () => {
  tmplFormCard.style.display = "none";
  tmplTextarea.value = "";
  editingIndex = -1;
});

tmplSaveBtn.addEventListener("click", async () => {
  const val = tmplTextarea.value;
  if (!val.trim() || val.length > 400) return;

  const templates = getActiveTemplates();
  if (editingIndex >= 0) {
    templates[editingIndex] = val;
  } else {
    templates.push(val);
  }
  allTemplatesByModel[activeTemplateModel] = templates;

  await saveTemplates();
  tmplFormCard.style.display = "none";
  tmplTextarea.value = "";
  const wasEditing = editingIndex >= 0;
  editingIndex = -1;
  renderModelTabs();
  renderTemplates();
  showToast(wasEditing ? t("options_toast_tmpl_updated") : t("options_toast_tmpl_saved"));
});

/**
 * Shows the delete-confirmation overlay for the template at `idx`.
 * @param {number} idx
 */
function confirmDeleteTemplate(idx) {
  pendingDeleteIndex = idx;
  const preview = getActiveTemplates()[idx].replace(/\n/g, "↵").slice(0, 60);
  tmplDeleteBody.textContent = t("options_tmpl_delete_body", preview);
  tmplDeleteOverlay.classList.add("visible");
}

tmplDeleteCancel.addEventListener("click", () => {
  tmplDeleteOverlay.classList.remove("visible");
  pendingDeleteIndex = -1;
});

tmplDeleteOverlay.addEventListener("click", (e) => {
  if (e.target === tmplDeleteOverlay) {
    tmplDeleteOverlay.classList.remove("visible");
    pendingDeleteIndex = -1;
  }
});

tmplDeleteConfirm.addEventListener("click", async () => {
  if (pendingDeleteIndex < 0) return;
  const templates = getActiveTemplates();
  templates.splice(pendingDeleteIndex, 1);
  allTemplatesByModel[activeTemplateModel] = templates;
  await saveTemplates();
  tmplDeleteOverlay.classList.remove("visible");
  pendingDeleteIndex = -1;
  renderModelTabs();
  renderTemplates();
  showToast(t("options_toast_tmpl_deleted"));
});

// ══════════════════════════════════════════════════════════════════
// 8. CONTEXT MENU ACTIONS  ← NEW
// ══════════════════════════════════════════════════════════════════

const summarizePrefixTextarea  = document.getElementById("summarizePrefixTextarea");
const summarizePrefixCharCount = document.getElementById("summarizePrefixCharCount");
const summarizePrefixSaveBtn   = document.getElementById("summarizePrefixSaveBtn");
const summarizePrefixResetBtn  = document.getElementById("summarizePrefixResetBtn");
const ctxPreviewPrefix         = document.getElementById("ctxPreviewPrefix");

/** Syncs the summarize-prefix preview text from the textarea value. */
function syncSummarizePreview() {
  if (!ctxPreviewPrefix) return;
  const raw = summarizePrefixTextarea.value.trimEnd();
  ctxPreviewPrefix.textContent = raw.replace(/\n/g, " ↵ ") + (raw ? "\n\n" : "");
}

/** Updates the character counter and over-limit styling for the summarize-prefix textarea. */
function updateSummarizePrefixCharCount() {
  const len = summarizePrefixTextarea.value.length;
  summarizePrefixCharCount.textContent = `${len} / ${SUMMARIZE_PREFIX_MAX}`;
  summarizePrefixCharCount.classList.toggle("warn", len > SUMMARIZE_PREFIX_MAX * 0.8 && len <= SUMMARIZE_PREFIX_MAX);
  summarizePrefixCharCount.classList.toggle("over", len > SUMMARIZE_PREFIX_MAX);
  summarizePrefixSaveBtn.disabled =
    summarizePrefixTextarea.value.trim().length === 0 ||
    len > SUMMARIZE_PREFIX_MAX;
}

summarizePrefixTextarea.addEventListener("input", () => {
  updateSummarizePrefixCharCount();
  syncSummarizePreview();
});

summarizePrefixSaveBtn.addEventListener("click", async () => {
  const val = summarizePrefixTextarea.value;
  if (!val.trim() || val.length > SUMMARIZE_PREFIX_MAX) return;
  await chrome.storage.sync.set({ askGeminiSummarizePrefix: val });
  showToast(t("options_toast_summarize_saved"));
});

summarizePrefixResetBtn.addEventListener("click", async () => {
  summarizePrefixTextarea.value = DEFAULT_SUMMARIZE_PREFIX;
  updateSummarizePrefixCharCount();
  await chrome.storage.sync.set({ askGeminiSummarizePrefix: DEFAULT_SUMMARIZE_PREFIX });
  showToast(t("options_toast_reset_default"));
});

/** Loads the summarize prefix from sync storage and populates the textarea. */
async function loadContextMenuSettings() {
  const { askGeminiSummarizePrefix = DEFAULT_SUMMARIZE_PREFIX } =
    await chrome.storage.sync.get("askGeminiSummarizePrefix");
  summarizePrefixTextarea.value = askGeminiSummarizePrefix;
  updateSummarizePrefixCharCount();
  syncSummarizePreview();
}

// ══════════════════════════════════════════════════════════════════
// 9. PROMPT ENGINEERING
// ══════════════════════════════════════════════════════════════════

const promptEngToggle       = document.getElementById("promptEngToggle");
const promptEngRulesWrap    = document.getElementById("promptEngRules");
const summarizePrefixSection = document.getElementById("summarizePrefixSection");

// Current in-memory copy of the full PE settings object
let _peSettings = { enabled: false, rules: [] };

// Per-rule save debounce timers keyed by rule id
const _peDebounce = {};

/**
 * Shows or hides the PE rules panel and the summarize-prefix section.
 * @param {boolean} enabled
 */
function _peSetVisibility(enabled) {
  promptEngRulesWrap.style.display    = enabled ? "block" : "none";
  summarizePrefixSection.style.display = enabled ? "none"  : "block";
}

/**
 * Merges saved rules with defaults so newly added default rules are
 * always present even on older saved settings.
 */
function _mergeRules(saved) {
  return DEFAULT_PROMPT_ENG_RULES.map(def => {
    const found = saved.find(r => r.id === def.id);
    return found ? { ...def, ...found } : { ...def };
  });
}

/**
 * Builds and returns a DOM card element for a single prompt-engineering rule.
 * @param {{ id: string, label: string, hint: string, enabled: boolean, template: string }} rule
 * @returns {HTMLElement}
 */
function _buildRuleCard(rule) {
  const card = document.createElement("div");
  card.className = "card pe-rule-card";
  card.dataset.ruleId = rule.id;

  // ── Header row ───────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "pe-rule-header";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle-switch toggle-sm";
  toggleLabel.title = rule.enabled ? t("options_pe_rule_disable_title") : t("options_pe_rule_enable_title");
  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.className = "pe-rule-toggle";
  toggleInput.checked = rule.enabled !== false;
  const toggleTrack = document.createElement("span");
  toggleTrack.className = "toggle-track";
  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleTrack);

  const labelEl = document.createElement("span");
  labelEl.className = "pe-rule-label";
  labelEl.textContent = rule.label;

  const hintWrap = document.createElement("span");
  hintWrap.className = "pe-rule-hint-wrap";

  const hintIcon = document.createElement("span");
  hintIcon.className = "pe-rule-hint-icon";
  hintIcon.textContent = "?";

  const hintTooltip = document.createElement("span");
  hintTooltip.className = "pe-rule-hint-tooltip";
  hintTooltip.textContent = rule.hint;

  hintWrap.appendChild(hintIcon);
  hintWrap.appendChild(hintTooltip);

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-ghost btn-xs pe-rule-reset";
  resetBtn.textContent = t("options_pe_rule_reset_btn");
  resetBtn.title = t("options_pe_rule_reset_title");

  header.appendChild(toggleLabel);
  header.appendChild(labelEl);
  header.appendChild(hintWrap);
  header.appendChild(resetBtn);
  card.appendChild(header);

  // ── Textarea ──────────────────────────────────────────────────
  const textarea = document.createElement("textarea");
  textarea.className = "tmpl-textarea pe-rule-textarea";
  textarea.rows = 1;
  textarea.maxLength = PE_TEMPLATE_MAX;
  textarea.value = rule.template;
  textarea.placeholder = t("options_pe_rule_placeholder");
  card.appendChild(textarea);

  // ── Char count + preview row ──────────────────────────────────
  const metaRow = document.createElement("div");
  metaRow.className = "pe-rule-meta";

  const charCount = document.createElement("span");
  charCount.className = "tmpl-char-count pe-rule-char-count";
  _updatePeCharCount(charCount, textarea.value.length);

  const previewWrap = document.createElement("div");
  previewWrap.className = "ctx-preview-wrap pe-preview-wrap";
  const previewLabel = document.createElement("span");
  previewLabel.className = "ctx-preview-label";
  previewLabel.textContent = t("options_pe_preview_label");
  const previewBox = document.createElement("div");
  previewBox.className = "ctx-preview-box";
  const previewText = document.createElement("span");
  previewText.className = "ctx-preview-text";
  _updatePePreview(previewText, textarea.value);
  previewBox.appendChild(previewText);
  previewWrap.appendChild(previewLabel);
  previewWrap.appendChild(previewBox);

  metaRow.appendChild(charCount);
  metaRow.appendChild(previewWrap);
  card.appendChild(metaRow);

  // ── Wire up events ────────────────────────────────────────────
  toggleInput.addEventListener("change", () => {
    const r = _peSettings.rules.find(x => x.id === rule.id);
    if (r) r.enabled = toggleInput.checked;
    toggleLabel.title = toggleInput.checked ? t("options_pe_rule_disable_title") : t("options_pe_rule_enable_title");
    _peScheduleSave(rule.id);
  });

  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
    autoResizeTextarea(textarea);
    _updatePeCharCount(charCount, len);
    _updatePePreview(previewText, textarea.value);
    const r = _peSettings.rules.find(x => x.id === rule.id);
    if (r) r.template = textarea.value;
    _peScheduleSave(rule.id);
  });

  resetBtn.addEventListener("click", () => {
    const def = DEFAULT_PROMPT_ENG_RULES.find(x => x.id === rule.id);
    if (!def) return;
    textarea.value = def.template;
    autoResizeTextarea(textarea);
    const r = _peSettings.rules.find(x => x.id === rule.id);
    if (r) r.template = def.template;
    _updatePeCharCount(charCount, def.template.length);
    _updatePePreview(previewText, def.template);
    _peScheduleSave(rule.id);
    showToast(t("options_toast_rule_reset"));
  });

  return card;
}

/**
 * Updates a PE rule's character counter element.
 * @param {HTMLElement} el
 * @param {number}      len
 */
function _updatePeCharCount(el, len) {
  el.textContent = `${len} / ${PE_TEMPLATE_MAX}`;
  el.classList.toggle("warn", len > PE_TEMPLATE_MAX * 0.8 && len <= PE_TEMPLATE_MAX);
  el.classList.toggle("over", len > PE_TEMPLATE_MAX);
}

/**
 * Renders a PE rule template preview, replacing {selection} with placeholder text.
 * @param {HTMLElement} el
 * @param {string}      template
 */
function _updatePePreview(el, template) {
  el.textContent = template.replace(/\{selection\}/g, t("options_pe_preview_placeholder"));
}

/**
 * Debounces saving the PE settings after a rule change (400 ms delay).
 * @param {string} ruleId
 */
function _peScheduleSave(ruleId) {
  clearTimeout(_peDebounce[ruleId]);
  _peDebounce[ruleId] = setTimeout(async () => {
    await chrome.storage.sync.set({ askGeminiPromptEng: _peSettings });
    showToast(t("options_toast_saved"));
  }, 400);
}

/**
 * Re-renders all PE rule cards plus the reset-all footer button.
 * @param {{ id: string, label: string, hint: string, enabled: boolean, template: string }[]} rules
 */
function renderPromptEngRules(rules) {
  promptEngRulesWrap.replaceChildren();
  rules.forEach(rule => {
    promptEngRulesWrap.appendChild(_buildRuleCard(rule));
  });
  promptEngRulesWrap.querySelectorAll(".pe-rule-textarea").forEach(autoResizeTextarea);

  // Reset-all button at the bottom of the rules list
  const footer = document.createElement("div");
  footer.className = "pe-rules-footer";
  const resetAllBtn = document.createElement("button");
  resetAllBtn.className = "btn-ghost";
  resetAllBtn.textContent = t("options_pe_reset_all_btn");
  resetAllBtn.addEventListener("click", () => {
    document.getElementById("peResetAllOverlay").classList.add("visible");
  });
  footer.appendChild(resetAllBtn);
  promptEngRulesWrap.appendChild(footer);
}

promptEngToggle.addEventListener("change", async () => {
  _peSettings.enabled = promptEngToggle.checked;
  _peSetVisibility(_peSettings.enabled);
  await chrome.storage.sync.set({ askGeminiPromptEng: _peSettings });
  showToast(_peSettings.enabled ? t("options_toast_pe_enabled") : t("options_toast_pe_disabled"));
});

/** Loads prompt-engineering settings from sync storage and renders the rule cards. */
async function loadPromptEngSettings() {
  const { askGeminiPromptEng } = await chrome.storage.sync.get("askGeminiPromptEng");
  _peSettings = {
    enabled: askGeminiPromptEng?.enabled ?? false,
    rules:   _mergeRules(askGeminiPromptEng?.rules ?? []),
  };
  promptEngToggle.checked = _peSettings.enabled;
  _peSetVisibility(_peSettings.enabled);
  renderPromptEngRules(_peSettings.rules);
}

const peResetAllOverlay  = document.getElementById("peResetAllOverlay");
const peResetAllCancel   = document.getElementById("peResetAllCancel");
const peResetAllConfirm  = document.getElementById("peResetAllConfirm");

peResetAllCancel.addEventListener("click", () => peResetAllOverlay.classList.remove("visible"));
peResetAllOverlay.addEventListener("click", (e) => {
  if (e.target === peResetAllOverlay) peResetAllOverlay.classList.remove("visible");
});
peResetAllConfirm.addEventListener("click", async () => {
  peResetAllOverlay.classList.remove("visible");
  _peSettings.rules = _mergeRules([]);
  await chrome.storage.sync.set({ askGeminiPromptEng: _peSettings });
  renderPromptEngRules(_peSettings.rules);
  showToast(t("options_toast_rules_reset_all"));
});

// ══════════════════════════════════════════════════════════════════
// 10. HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * Resolves "auto" to the actual OS-level light/dark preference.
 * @param {"light"|"dark"|"auto"} pref
 * @returns {"light"|"dark"}
 */
function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Escapes HTML special characters to prevent XSS when interpolating into markup.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/**
 * Escapes characters that are unsafe inside HTML attribute values.
 * @param {string} s
 * @returns {string}
 */
function escAttr(s) {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/**
 * Returns HTML with all occurrences of `query` in `text` wrapped in <mark>.
 * @param {string} text
 * @param {string} query
 * @returns {string}
 */
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return escaped.replace(re, "<mark>$1</mark>");
}
/**
 * Formats a Unix timestamp as a human-readable relative time string.
 * @param {number} ts  Unix timestamp in milliseconds.
 * @returns {string}
 */
function formatTime(ts) {
  if (!ts) return "";
  const d    = new Date(ts);
  const diff = Date.now() - d;
  if (diff < 60_000)      return t("options_time_just_now");
  if (diff < 3_600_000)   return t("options_time_minutes_ago", String(Math.floor(diff / 60_000)));
  if (diff < 86_400_000)  return t("options_time_hours_ago",   String(Math.floor(diff / 3_600_000)));
  if (diff < 604_800_000) return t("options_time_days_ago",    String(Math.floor(diff / 86_400_000)));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

let toastTimer;
/**
 * Shows a brief toast notification at the bottom of the page.
 * @param {string} msg
 */
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

// ══════════════════════════════════════════════════════════════════
// 11. INIT
// ══════════════════════════════════════════════════════════════════

(async () => {
  applyI18n();
  const data = await chrome.storage.sync.get(["askGeminiTheme", "askGeminiModel"]);
  applyTheme(data.askGeminiTheme || "auto");
  applyModel(data.askGeminiModel || "flash");
  await loadShortcut();
  await loadHistory();
  await loadTemplates();
  await loadContextMenuSettings();
  await loadPromptEngSettings();
})();

/* istanbul ignore next — test hook, never runs inside the real extension */
if (typeof globalThis !== "undefined" && globalThis.__TEST__) {
  Object.assign(globalThis.__TEST__, {
    escapeHtml, escAttr, highlightMatch, formatTime, resolveTheme,
    renderHistory, renderTemplates, loadHistory, loadTemplates, loadContextMenuSettings, loadPromptEngSettings,
    updateCharCount, updateSummarizePrefixCharCount,
    _setAllHistory:          (h) => { allHistory          = h; },
    _setAllTemplatesByModel: (t) => { allTemplatesByModel = t; },
    _setAllTemplates:        (t) => { allTemplatesByModel = t; },
    _setActiveTemplateModel: (m) => { activeTemplateModel = m; },
    _setCurrentTheme:        (v) => { currentTheme        = v; },
    _setCurrentModel:        (v) => { currentModel        = v; },
  });
}