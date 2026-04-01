// ── background.js ─────────────────────────────────────────────────
// Service worker: context menus, icon badge feedback.

const GEMINI_URL = "https://gemini.google.com/app";

const DEFAULT_SUMMARIZE_PREFIX = "Summarise the following:\n\n";

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

/**
 * Shared helper: write the pending message + model to storage,
 * set the queued badge, and open (or focus) a Gemini tab.
 */
async function dispatchToGemini(message, model) {
  setBadgeQueued();
  _fromContextMenu = true;

  await chrome.storage.local.set({
    pendingMessage: message,
    pendingModel:   model,
  });

  chrome.tabs.create({ url: GEMINI_URL });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  // ── Open Gemini directly (no message) ─────────────────────────
  if (info.menuItemId === "open-gemini-direct" || info.menuItemId === "open-gemini-page") {
    chrome.tabs.create({ url: GEMINI_URL });
    return;
  }

  // ── Ask Gemini with prefix + selection ────────────────────────
  if (info.menuItemId === "ask-gemini-selection" && info.selectionText) {
    const {
      askGeminiModel           = "flash",
      askGeminiSummarizePrefix = DEFAULT_SUMMARIZE_PREFIX,
    } = await chrome.storage.local.get(["askGeminiModel", "askGeminiSummarizePrefix"]);

    const prefix  = askGeminiSummarizePrefix.trimEnd();
    const message = prefix + "\n\n" + info.selectionText.trim();

    await dispatchToGemini(message, askGeminiModel);
    return;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open_popup") return;

  try {
    // Works normally when the browser toolbar is visible.
    await chrome.action.openPopup();
  } catch (_err) {
    // chrome.action.openPopup() throws "Browser window has no toolbar"
    // in F11 fullscreen mode because the toolbar is hidden.
    // Fall back to a floating popup window instead.
    const popupUrl = chrome.runtime.getURL("src/popup/popup.html");

    // Best-effort: centre the popup over the focused window.
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
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/welcome/welcome.html"),
    });
  }
  if (typeof registerMenus === "function") registerMenus();
});