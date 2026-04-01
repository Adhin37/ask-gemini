// ── options.js ────────────────────────────────────────────────
// Settings page: history, templates, appearance (theme + model),
// context menu actions, shortcut, about

const GEMINI_URL = "https://gemini.google.com/app";

const DEFAULT_TEMPLATES = [
  "Summarise: ",
  "Translate to English: ",
  "Fix this code:\n",
  "Explain simply: ",
  "Pros and cons of: ",
];

const DEFAULT_SUMMARIZE_PREFIX = "Summarise the following:\n\n";
const SUMMARIZE_PREFIX_MAX     = 300;

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
    document.getElementById(`section-${target}`)?.classList.add("active");
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. VERSION
// ══════════════════════════════════════════════════════════════════

const manifest = chrome.runtime.getManifest();
const ver = `v${manifest.version}`;
document.getElementById("extVersion").textContent   = ver;
document.getElementById("aboutVersion").textContent = `Version ${manifest.version}`;

// ══════════════════════════════════════════════════════════════════
// 3. SHORTCUT PAGE LINK
// ══════════════════════════════════════════════════════════════════

document.getElementById("shortcutPageLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// ══════════════════════════════════════════════════════════════════
// 4. THEME
// ══════════════════════════════════════════════════════════════════

let currentTheme = "auto";

function resolveTheme(pref) {
  if (pref === "light") return "light";
  if (pref === "dark")  return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(pref) {
  currentTheme = pref || "auto";
  const resolved = resolveTheme(currentTheme);
  document.body.classList.toggle("light", resolved === "light");
  document.querySelectorAll("#themeControl .seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === currentTheme);
  });
}

document.getElementById("themeControl")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  const val = btn.dataset.value;
  if (val === currentTheme) return;
  await chrome.storage.local.set({ askGeminiTheme: val });
  applyTheme(val);
});

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (currentTheme === "auto") applyTheme("auto");
});

// ══════════════════════════════════════════════════════════════════
// 5. MODEL PREFERENCE
// ══════════════════════════════════════════════════════════════════

let currentModel = "flash";

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
  await chrome.storage.local.set({ askGeminiModel: val });
  applyModel(val);
  const labels = { flash: "Fast", pro: "Pro", thinking: "Think" };
  showToast(`Model set to ${labels[val] || val}`);
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

async function loadHistory() {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  allHistory = askGeminiHistory;
  renderHistory(allHistory, searchInput.value.trim());
}

function renderHistory(items, query = "") {
  historyList.replaceChildren();
  const filtered = query
    ? items.filter(h => h.text.toLowerCase().includes(query.toLowerCase()))
    : items;

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    emptyState.querySelector("p").textContent    = query ? "No matches." : "No history yet.";
    emptyState.querySelector("span").textContent = query
      ? `No prompts containing "${query}".`
      : "Questions you send to Gemini will appear here.";
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
        <button class="hist-btn" title="Send to Gemini" data-action="send" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="hist-btn" title="Copy" data-action="copy" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button class="hist-btn danger" title="Delete" data-action="delete" data-text="${escAttr(item.text)}">
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

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const origChildren = [...btn.childNodes];
    btn.innerHTML = "<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\"><path d=\"M20 6L9 17l-5-5\" stroke=\"#7c6af7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
    setTimeout(() => { btn.replaceChildren(...origChildren); }, 1200);
    showToast("Copied to clipboard");
  } catch (_) { showToast("Copy failed"); }
}

async function deleteHistoryItem(text) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const updated = askGeminiHistory.filter(h => h.text !== text);
  await chrome.storage.local.set({ askGeminiHistory: updated });
  allHistory = updated;
  renderHistory(allHistory, searchInput.value.trim());
  showToast("Entry removed");
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
  showToast("History cleared");
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
// 7. TEMPLATES
// ══════════════════════════════════════════════════════════════════

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

let allTemplates       = [];
let editingIndex       = -1;
let pendingDeleteIndex = -1;

async function loadTemplates() {
  const { askGeminiTemplates } = await chrome.storage.local.get("askGeminiTemplates");
  if (!askGeminiTemplates) {
    await chrome.storage.local.set({ askGeminiTemplates: DEFAULT_TEMPLATES });
    allTemplates = [...DEFAULT_TEMPLATES];
  } else {
    allTemplates = askGeminiTemplates;
  }
  renderTemplates();
}

function renderTemplates() {
  tmplCardList.replaceChildren();

  if (allTemplates.length === 0) {
    tmplEmptyState.style.display = "flex";
    return;
  }
  tmplEmptyState.style.display = "none";

  allTemplates.forEach((tpl, idx) => {
    const el = document.createElement("div");
    el.className = "tmpl-card";
    el.style.animationDelay = `${idx * 18}ms`;

    const displayHtml = escapeHtml(tpl).replace(/\n/g, '<span class="newline-sym">↵\n</span>');

    el.innerHTML = `
      <span class="tmpl-card-idx">${idx + 1}</span>
      <div class="tmpl-card-text">${displayHtml}</div>
      <div class="tmpl-card-actions">
        <button class="hist-btn" title="Edit" data-action="edit" data-idx="${idx}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="hist-btn danger" title="Delete" data-action="delete" data-idx="${idx}">
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

addTemplateBtn.addEventListener("click", () => {
  editingIndex = -1;
  tmplFormLabel.textContent = "New template";
  tmplTextarea.value = "";
  tmplSaveBtn.disabled = true;
  updateCharCount();
  tmplFormCard.style.display = "block";
  tmplTextarea.focus();
  tmplFormCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function openEditForm(idx) {
  editingIndex = idx;
  tmplFormLabel.textContent = `Edit template ${idx + 1}`;
  tmplTextarea.value = allTemplates[idx];
  updateCharCount();
  tmplSaveBtn.disabled = tmplTextarea.value.trim().length === 0;
  tmplFormCard.style.display = "block";
  tmplTextarea.focus();
  tmplFormCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

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

  if (editingIndex >= 0) {
    allTemplates[editingIndex] = val;
  } else {
    allTemplates.push(val);
  }

  await chrome.storage.local.set({ askGeminiTemplates: allTemplates });
  tmplFormCard.style.display = "none";
  tmplTextarea.value = "";
  const wasEditing = editingIndex >= 0;
  editingIndex = -1;
  renderTemplates();
  showToast(wasEditing ? "Template updated" : "Template saved");
});

function confirmDeleteTemplate(idx) {
  pendingDeleteIndex = idx;
  const preview = allTemplates[idx].replace(/\n/g, "↵").slice(0, 60);
  tmplDeleteBody.textContent = `"${preview}" will be permanently removed.`;
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
  allTemplates.splice(pendingDeleteIndex, 1);
  await chrome.storage.local.set({ askGeminiTemplates: allTemplates });
  tmplDeleteOverlay.classList.remove("visible");
  pendingDeleteIndex = -1;
  renderTemplates();
  showToast("Template deleted");
});

// ══════════════════════════════════════════════════════════════════
// 8. CONTEXT MENU ACTIONS  ← NEW
// ══════════════════════════════════════════════════════════════════

const summarizePrefixTextarea  = document.getElementById("summarizePrefixTextarea");
const summarizePrefixCharCount = document.getElementById("summarizePrefixCharCount");
const summarizePrefixSaveBtn   = document.getElementById("summarizePrefixSaveBtn");
const summarizePrefixResetBtn  = document.getElementById("summarizePrefixResetBtn");
const ctxPreviewPrefix         = document.getElementById("ctxPreviewPrefix");

function syncSummarizePreview() {
  if (!ctxPreviewPrefix) return;
  const raw = summarizePrefixTextarea.value.trimEnd();
  ctxPreviewPrefix.textContent = raw.replace(/\n/g, " ↵ ") + (raw ? "\n\n" : "");
}

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
  await chrome.storage.local.set({ askGeminiSummarizePrefix: val });
  showToast("Summarize prefix saved");
});

summarizePrefixResetBtn.addEventListener("click", async () => {
  summarizePrefixTextarea.value = DEFAULT_SUMMARIZE_PREFIX;
  updateSummarizePrefixCharCount();
  await chrome.storage.local.set({ askGeminiSummarizePrefix: DEFAULT_SUMMARIZE_PREFIX });
  showToast("Reset to default");
});

async function loadContextMenuSettings() {
  const { askGeminiSummarizePrefix = DEFAULT_SUMMARIZE_PREFIX } =
    await chrome.storage.local.get("askGeminiSummarizePrefix");
  summarizePrefixTextarea.value = askGeminiSummarizePrefix;
  updateSummarizePrefixCharCount();
  syncSummarizePreview();
}

// ══════════════════════════════════════════════════════════════════
// 9. HELPERS
// ══════════════════════════════════════════════════════════════════

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) {
  return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return escaped.replace(re, "<mark>$1</mark>");
}
function formatTime(ts) {
  if (!ts) return "";
  const d    = new Date(ts);
  const diff = Date.now() - d;
  if (diff < 60_000)      return "just now";
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

let toastTimer;
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
// 10. INIT
// ══════════════════════════════════════════════════════════════════

(async () => {
  const data = await chrome.storage.local.get(["askGeminiTheme", "askGeminiModel"]);
  applyTheme(data.askGeminiTheme || "auto");
  applyModel(data.askGeminiModel || "flash");
  await loadHistory();
  await loadTemplates();
  await loadContextMenuSettings();
})();

/* istanbul ignore next — test hook, never runs inside the real extension */
if (typeof globalThis !== "undefined" && globalThis.__TEST__) {
  Object.assign(globalThis.__TEST__, {
    escapeHtml, escAttr, highlightMatch, formatTime, resolveTheme,
    renderHistory, renderTemplates, loadHistory, loadTemplates, loadContextMenuSettings,
    updateCharCount, updateSummarizePrefixCharCount,
    _setAllHistory:    (h) => { allHistory    = h; },
    _setAllTemplates:  (t) => { allTemplates  = t; },
    _setCurrentTheme:  (v) => { currentTheme  = v; },
    _setCurrentModel:  (v) => { currentModel  = v; },
  });
}