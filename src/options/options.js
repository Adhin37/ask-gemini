// ── options.js ────────────────────────────────────────────────
// Settings page: history, templates, appearance (theme + model),
// context menu actions, shortcut, about

const GEMINI_URL = "https://gemini.google.com/app";

// ── Prompt Engineering defaults (mirrors background.js) ───────────
const DEFAULT_PROMPT_ENG_RULES = [
  {
    id: "code", label: "Code",
    hint: "Selection looks like code, or the page is a known code site (GitHub, Stack Overflow…)",
    enabled: true,
    template: "Analyze this code:\n1. **Purpose** — what does it do?\n2. **Logic** — how does it work step-by-step?\n3. **Issues** — any bugs, edge cases, or improvements?\n\n{selection}",
  },
  {
    id: "error", label: "Error / Bug",
    hint: "Selection contains an error message or stack trace",
    enabled: true,
    template: "Debug this systematically:\n1. **Root cause** — what is failing and why?\n2. **Fix** — provide the corrected code or command\n3. **Prevention** — how to avoid this in the future\n\n{selection}",
  },
  {
    id: "url", label: "URL",
    hint: "The entire selection is a URL",
    enabled: true,
    template: "For this URL, provide:\n- **Topic** — one-sentence summary\n- **Key points** — 3 bullet points\n- **Audience** — who is this aimed at?\n\n{selection}",
  },
  {
    id: "question", label: "Question",
    hint: "Selection ends with a question mark",
    enabled: true,
    template: "Answer this question:\n1. **Direct answer** — clear and concise\n2. **Why** — brief reasoning or evidence\n3. **Example** — concrete illustration if helpful\n\n{selection}",
  },
  {
    id: "data", label: "Data / Numbers",
    hint: "Selection is mostly numbers or structured data",
    enabled: true,
    template: "Analyze this data:\n1. **What it shows** — key metrics or values\n2. **Trends** — notable patterns or changes\n3. **Insight** — the most meaningful takeaway\n\n{selection}",
  },
  {
    id: "term", label: "Term / Keyword",
    hint: "Short selection of 4 words or fewer",
    enabled: true,
    template: "Explain \"{selection}\":\n- **Definition** — simple, jargon-free\n- **Practical use** — when and why it matters\n- **Common misconception** — what people often get wrong",
  },
  {
    id: "article", label: "Article / Text",
    hint: "Default for longer natural-language selections",
    enabled: true,
    template: "Summarize this text:\n**TL;DR:** one-sentence essence\n**Key points:**\n- Main argument\n- Supporting evidence (2–3 bullets)\n\n**Takeaway:** most actionable insight\n\n{selection}",
  },
  {
    id: "default", label: "Default (fallback)",
    hint: "Applied when no other rule matches or all others are disabled",
    enabled: true,
    template: "{selection}",
  },
];

const PE_TEMPLATE_MAX = 400;

const DEFAULT_TEMPLATES_BY_MODEL = {
  flash: [
    "Summarise: ",
    "Translate to English: ",
    "Explain simply: ",
    "Pros and cons of: ",
  ],
  thinking: [
    "Think through this step-by-step: ",
    "What are the edge cases for: ",
    "Analyze deeply: ",
  ],
  pro: [
    "Deep analysis of: ",
    "Fix this code:\n",
    "Compare and contrast: ",
    "Write a comprehensive report on: ",
  ],
};

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

document.getElementById("brandLogoBtn").addEventListener("click", () => chrome.tabs.create({ url: GEMINI_URL }));
document.getElementById("aboutLogoBtn").addEventListener("click", () => chrome.tabs.create({ url: GEMINI_URL }));

// ══════════════════════════════════════════════════════════════════
// 3. SHORTCUT DISPLAY
// ══════════════════════════════════════════════════════════════════

const shortcutDisplay = document.getElementById("shortcutDisplay");
const shortcutEditBtn = document.getElementById("shortcutEditBtn");

function renderShortcutKeys(shortcutStr) {
  shortcutDisplay.replaceChildren();
  if (!shortcutStr) {
    const span = document.createElement("span");
    span.style.cssText = "color:var(--text-hint);font-size:12px";
    span.textContent = "Not set";
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

async function loadShortcut() {
  const commands = await chrome.commands.getAll();
  const cmd = commands.find(c => c.name === "open_popup");
  renderShortcutKeys(cmd?.shortcut || "");
}

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
  await chrome.storage.local.set({ askGeminiTheme: val });
  applyTheme(val);
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
// 7. TEMPLATES  (per-model)
// ══════════════════════════════════════════════════════════════════

const TMPL_MODELS       = ["flash", "thinking", "pro"];
const TMPL_MODEL_LABELS = { flash: "Fast", thinking: "Think", pro: "Pro" };

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

function getActiveTemplates() { return allTemplatesByModel[activeTemplateModel] || []; }

async function saveTemplates() {
  await chrome.storage.local.set({ askGeminiTemplates: allTemplatesByModel });
}

async function loadTemplates() {
  const { askGeminiTemplates, askGeminiModel } = await chrome.storage.local.get(["askGeminiTemplates", "askGeminiModel"]);

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

function renderModelTabs() {
  tmplModelTabs.querySelectorAll(".tmpl-model-tab").forEach(btn => {
    const model = btn.dataset.model;
    btn.classList.toggle("active", model === activeTemplateModel);
    const badge = btn.querySelector(".tmpl-tab-badge");
    if (badge) badge.textContent = (allTemplatesByModel[model] || []).length;
  });
}

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
  tmplFormLabel.textContent = `New template — ${TMPL_MODEL_LABELS[activeTemplateModel]}`;
  tmplTextarea.value = "";
  tmplSaveBtn.disabled = true;
  updateCharCount();
  tmplFormCard.style.display = "block";
  tmplTextarea.focus();
  tmplFormCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function openEditForm(idx) {
  editingIndex = idx;
  tmplFormLabel.textContent = `Edit template ${idx + 1} — ${TMPL_MODEL_LABELS[activeTemplateModel]}`;
  tmplTextarea.value = getActiveTemplates()[idx];
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
  showToast(wasEditing ? "Template updated" : "Template saved");
});

function confirmDeleteTemplate(idx) {
  pendingDeleteIndex = idx;
  const preview = getActiveTemplates()[idx].replace(/\n/g, "↵").slice(0, 60);
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
  const templates = getActiveTemplates();
  templates.splice(pendingDeleteIndex, 1);
  allTemplatesByModel[activeTemplateModel] = templates;
  await saveTemplates();
  tmplDeleteOverlay.classList.remove("visible");
  pendingDeleteIndex = -1;
  renderModelTabs();
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
// 9. PROMPT ENGINEERING
// ══════════════════════════════════════════════════════════════════

const promptEngToggle       = document.getElementById("promptEngToggle");
const promptEngRulesWrap    = document.getElementById("promptEngRules");
const summarizePrefixSection = document.getElementById("summarizePrefixSection");

// Current in-memory copy of the full PE settings object
let _peSettings = { enabled: false, rules: [] };

// Per-rule save debounce timers keyed by rule id
const _peDebounce = {};

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

function _buildRuleCard(rule) {
  const card = document.createElement("div");
  card.className = "card pe-rule-card";
  card.dataset.ruleId = rule.id;

  // ── Header row ───────────────────────────────────────────────
  const header = document.createElement("div");
  header.className = "pe-rule-header";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle-switch toggle-sm";
  toggleLabel.title = rule.enabled ? "Disable rule" : "Enable rule";
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

  const hintEl = document.createElement("span");
  hintEl.className = "pe-rule-hint";
  hintEl.textContent = rule.hint;

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-ghost btn-xs pe-rule-reset";
  resetBtn.textContent = "Reset";
  resetBtn.title = "Reset to default template";

  header.appendChild(toggleLabel);
  header.appendChild(labelEl);
  header.appendChild(hintEl);
  header.appendChild(resetBtn);
  card.appendChild(header);

  // ── Textarea ──────────────────────────────────────────────────
  const textarea = document.createElement("textarea");
  textarea.className = "tmpl-textarea pe-rule-textarea";
  textarea.rows = 3;
  textarea.maxLength = PE_TEMPLATE_MAX;
  textarea.value = rule.template;
  textarea.placeholder = "Template — use {selection} for the selected text";
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
  previewLabel.textContent = "Preview";
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
    toggleLabel.title = toggleInput.checked ? "Disable rule" : "Enable rule";
    _peScheduleSave(rule.id);
  });

  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
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
    const r = _peSettings.rules.find(x => x.id === rule.id);
    if (r) r.template = def.template;
    _updatePeCharCount(charCount, def.template.length);
    _updatePePreview(previewText, def.template);
    _peScheduleSave(rule.id);
    showToast("Rule reset to default");
  });

  return card;
}

function _updatePeCharCount(el, len) {
  el.textContent = `${len} / ${PE_TEMPLATE_MAX}`;
  el.classList.toggle("warn", len > PE_TEMPLATE_MAX * 0.8 && len <= PE_TEMPLATE_MAX);
  el.classList.toggle("over", len > PE_TEMPLATE_MAX);
}

function _updatePePreview(el, template) {
  el.textContent = template.replace(/\{selection\}/g, "…your selected text…");
}

function _peScheduleSave(ruleId) {
  clearTimeout(_peDebounce[ruleId]);
  _peDebounce[ruleId] = setTimeout(async () => {
    await chrome.storage.local.set({ askGeminiPromptEng: _peSettings });
    showToast("Saved");
  }, 400);
}

function renderPromptEngRules(rules) {
  promptEngRulesWrap.replaceChildren();
  rules.forEach(rule => {
    promptEngRulesWrap.appendChild(_buildRuleCard(rule));
  });

  // Reset-all button at the bottom of the rules list
  const footer = document.createElement("div");
  footer.className = "pe-rules-footer";
  const resetAllBtn = document.createElement("button");
  resetAllBtn.className = "btn-ghost";
  resetAllBtn.textContent = "Reset all rules to defaults";
  resetAllBtn.addEventListener("click", async () => {
    _peSettings.rules = _mergeRules([]);
    await chrome.storage.local.set({ askGeminiPromptEng: _peSettings });
    renderPromptEngRules(_peSettings.rules);
    showToast("All rules reset to defaults");
  });
  footer.appendChild(resetAllBtn);
  promptEngRulesWrap.appendChild(footer);
}

promptEngToggle.addEventListener("change", async () => {
  _peSettings.enabled = promptEngToggle.checked;
  _peSetVisibility(_peSettings.enabled);
  await chrome.storage.local.set({ askGeminiPromptEng: _peSettings });
  showToast(_peSettings.enabled ? "Prompt engineering enabled" : "Prompt engineering disabled");
});

async function loadPromptEngSettings() {
  const { askGeminiPromptEng } = await chrome.storage.local.get("askGeminiPromptEng");
  _peSettings = {
    enabled: askGeminiPromptEng?.enabled ?? false,
    rules:   _mergeRules(askGeminiPromptEng?.rules ?? []),
  };
  promptEngToggle.checked = _peSettings.enabled;
  _peSetVisibility(_peSettings.enabled);
  renderPromptEngRules(_peSettings.rules);
}

// ══════════════════════════════════════════════════════════════════
// 10. HELPERS
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
// 11. INIT
// ══════════════════════════════════════════════════════════════════

(async () => {
  const data = await chrome.storage.local.get(["askGeminiTheme", "askGeminiModel"]);
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
    escapeHtml, escAttr, highlightMatch, formatTime,
    renderHistory, renderTemplates, loadHistory, loadTemplates, loadContextMenuSettings, loadPromptEngSettings,
    updateCharCount, updateSummarizePrefixCharCount,
    _setAllHistory:          (h) => { allHistory          = h; },
    _setAllTemplatesByModel: (t) => { allTemplatesByModel = t; },
    _setActiveTemplateModel: (m) => { activeTemplateModel = m; },
    _setCurrentTheme:        (v) => { currentTheme        = v; },
    _setCurrentModel:        (v) => { currentModel        = v; },
  });
}