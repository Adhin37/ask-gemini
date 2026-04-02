// ── background.js ─────────────────────────────────────────────────
// Service worker: context menus, icon badge feedback.

const GEMINI_URL = "https://gemini.google.com/app";

const DEFAULT_SUMMARIZE_PREFIX = "Summarise the following:\n\n";

// ══════════════════════════════════════════════════════════════════
// PROMPT ENGINEERING — defaults & detection
// ══════════════════════════════════════════════════════════════════

const DEFAULT_PROMPT_ENG_RULES = [
  {
    id: "code", label: "Code",
    hint: "Selection looks like code, or the page is a known code site",
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

// Known code-hosting / developer pages — boost "code" context detection
const _CODE_PAGE_RE = [
  /github\.com/, /gitlab\.com/, /bitbucket\.org/,
  /stackoverflow\.com/, /stackexchange\.com/,
  /codepen\.io/, /jsfiddle\.net/, /replit\.com/,
  /codesandbox\.io/, /npmjs\.com/, /pkg\.go\.dev/,
  /developer\.mozilla\.org/,
];

// Patterns that suggest the text is source code
const _CODE_TEXT_RE = [
  /^\s*(function[\s(]|class\s|def\s|import\s|const\s|let\s|var\s|if\s*\(|for\s*\(|while\s*\(|#include\s|public\s|private\s|<\?php|\bfn\b)/,
  /=>[\s{(]/,
  /[{};]\s*\n.*[{};]/s,
  /\b(return|typeof|instanceof|async|await|yield)\b/,
];

// Patterns that suggest an error or stack trace
const _ERROR_RE = [
  /\b\w*(Error|Exception|Fault|Panic)\b.*:/,
  /^\s+at\s+[\w.$<>[\]]+\s*\(/m,
  /\bTraceback\b/i,
  /line\s+\d+.*col(umn)?\s+\d+/i,
  /\b(segfault|fatal error|uncaught exception|unhandled rejection)\b/i,
];

/**
 * Returns the context id that best describes the selected text.
 * @param {string} text
 * @param {string} pageUrl
 * @returns {"url"|"error"|"code"|"question"|"data"|"term"|"article"}
 */
function detectContext(text, pageUrl) {
  const t   = text.trim();
  const url = pageUrl || "";

  if (/^https?:\/\/\S+$/.test(t))              return "url";
  if (_ERROR_RE.some(re => re.test(t)))          return "error";

  const isCodePage    = _CODE_PAGE_RE.some(re => re.test(url));
  const looksLikeCode = _CODE_TEXT_RE.some(re => re.test(t));
  if (isCodePage || looksLikeCode)               return "code";

  if (t.endsWith("?"))                           return "question";

  const words = t.split(/\s+/).filter(Boolean).length;
  if (words >= 2 && /^[\d\s.,;:\-+%$€£¥|/\n]+$/.test(t)) return "data";
  if (words <= 4)                                return "term";

  return "article";
}

/**
 * Applies the matching prompt-engineering rule to the selection.
 * @param {string} selection
 * @param {string} pageUrl
 * @param {{ rules: Array }} settings  — value of askGeminiPromptEng
 * @returns {string}
 */
function buildPromptEngMessage(selection, pageUrl, settings) {
  const rules     = (settings && settings.rules) ? settings.rules : DEFAULT_PROMPT_ENG_RULES;
  const contextId = detectContext(selection, pageUrl);

  const rule = rules.find(r => r.id === contextId && r.enabled !== false)
            || rules.find(r => r.id === "default"  && r.enabled !== false);

  if (!rule) return selection;
  return rule.template.replace(/\{selection\}/g, selection);
}

// ══════════════════════════════════════════════════════════════════
// 1. BADGE HELPERS
// ══════════════════════════════════════════════════════════════════

let _badgeClearTimer = null;

function _cancelClear() {
  if (_badgeClearTimer !== null) {
    clearTimeout(_badgeClearTimer);
    _badgeClearTimer = null;
  }
}

function _clearBadgeAfter(ms) {
  _cancelClear();
  _badgeClearTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    _badgeClearTimer = null;
  }, ms);
}

function setBadgeQueued() {
  _cancelClear();
  chrome.action.setBadgeBackgroundColor({ color: "#7c6af7" });
  chrome.action.setBadgeText({ text: "↑" });
}

function setBadgeSuccess() {
  _cancelClear();
  chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  chrome.action.setBadgeText({ text: "✓" });
  _clearBadgeAfter(2_000);
}

function setBadgeError() {
  _cancelClear();
  chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  chrome.action.setBadgeText({ text: "!" });
  _clearBadgeAfter(3_000);
}

// ══════════════════════════════════════════════════════════════════
// 2. STORAGE WATCHER
// ══════════════════════════════════════════════════════════════════

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.pendingMessage?.newValue) return;
  if (_fromContextMenu) {
    _fromContextMenu = false;
    return;
  }
  setBadgeQueued();
});

// ══════════════════════════════════════════════════════════════════
// 3. INJECTION RESULT LISTENER
// ══════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "injectionResult") return;
  msg.success ? setBadgeSuccess() : setBadgeError();
});

// ══════════════════════════════════════════════════════════════════
// 4. CONTEXT MENUS
// ══════════════════════════════════════════════════════════════════

const MENU_ITEMS = [
  {
    id:       "open-gemini-direct",
    title:    "Open Gemini",
    contexts: ["action"],
  },
  {
    id:       "open-gemini-page",
    title:    "Ask Gemini",
    contexts: ["page"],
  },
  {
    id:       "ask-gemini-selection",
    title:    'Ask Gemini: "%s"',
    contexts: ["selection"],
  },
];

/**
 * Recreates all context menus from scratch (idempotent).
 * Called from both onInstalled and onStartup so menus survive
 * service-worker restarts.
 */
function registerMenus() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.warn("[Ask Gemini] removeAll error (ignored):", chrome.runtime.lastError.message);
    }
    for (const item of MENU_ITEMS) {
      chrome.contextMenus.create(item, () => {
        if (chrome.runtime.lastError) {
          console.warn(`[Ask Gemini] create "${item.id}" error:`, chrome.runtime.lastError.message);
        }
      });
    }
  });
}

chrome.runtime.onStartup.addListener(registerMenus);

// Flag used to prevent the storage watcher from double-firing for
// context-menu submissions that write pendingMessage themselves.
let _fromContextMenu = false;

const MAX_HISTORY = 20;

/**
 * Shared helper: write the pending message + model to storage,
 * set the queued badge, and open (or focus) a Gemini tab.
 */
async function dispatchToGemini(message, model) {
  setBadgeQueued();
  _fromContextMenu = true;

  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const deduped = askGeminiHistory.filter(h => h.text !== message);
  deduped.unshift({ text: message, ts: Date.now() });

  await chrome.storage.local.set({
    pendingMessage:   message,
    pendingModel:     model,
    askGeminiHistory: deduped.slice(0, MAX_HISTORY),
  });

  chrome.tabs.create({ url: GEMINI_URL });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  // ── Open Gemini directly (no message) ─────────────────────────
  if (info.menuItemId === "open-gemini-direct" || info.menuItemId === "open-gemini-page") {
    chrome.tabs.create({ url: GEMINI_URL });
    return;
  }

  // ── Ask Gemini with selection ─────────────────────────────────
  if (info.menuItemId === "ask-gemini-selection" && info.selectionText) {
    const {
      askGeminiModel           = "flash",
      askGeminiSummarizePrefix = DEFAULT_SUMMARIZE_PREFIX,
      askGeminiPromptEng,
    } = await chrome.storage.local.get([
      "askGeminiModel", "askGeminiSummarizePrefix", "askGeminiPromptEng",
    ]);

    const selection = info.selectionText.trim();
    let message;

    if (askGeminiPromptEng?.enabled) {
      message = buildPromptEngMessage(selection, info.pageUrl || "", askGeminiPromptEng);
    } else {
      const prefix = askGeminiSummarizePrefix.trimEnd();
      message = prefix + "\n\n" + selection;
    }

    await dispatchToGemini(message, askGeminiModel);
    return;
  }
});

async function openPopup() {
  try {
    // Works normally when the browser toolbar is visible.
    await chrome.action.openPopup();
  } catch (_err) {
    // Fallback: floating popup window (works in fullscreen / from content script).
    const popupUrl = chrome.runtime.getURL("src/popup/popup.html");

    let left, top;
    try {
      const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const focusedWin = wins.find(w => w.focused);
      if (focusedWin) {
        left = Math.round((focusedWin.left ?? 0) + (focusedWin.width  ?? 0) / 2 - 200);
        top  = Math.round((focusedWin.top  ?? 0) + (focusedWin.height ?? 0) / 2 - 280);
      }
    } catch (_errWin) { console.warn(_errWin); }

    chrome.windows.create({
      url: popupUrl,
      type: "popup",
      width: 376,
      height: 270,
      left: left ?? 100,
      top: top ?? 100,
      focused: true,
    });
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== "open_popup") return;
  openPopup();
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/welcome/welcome.html"),
    });
  }
  if (typeof registerMenus === "function") registerMenus();
});