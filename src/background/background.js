// ── background.js ─────────────────────────────────────────────────
// Service worker: context menus, icon badge feedback.

const GEMINI_URL = "https://gemini.google.com/app";

// ══════════════════════════════════════════════════════════════════
// 1. BADGE HELPERS
//
// Three states:
//   queued  — message is stored and waiting for content.js to inject
//   success — injection confirmed; auto-clears after 2 s
//   error   — injection failed;    auto-clears after 3 s
//
// A pending clear timer is always cancelled before setting a new
// state so rapid submissions don't leave a stale badge.
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

/**
 * Called as soon as a pendingMessage lands in storage.
 * Visible on the toolbar icon immediately — before Gemini even opens.
 */
function setBadgeQueued() {
  _cancelClear();
  chrome.action.setBadgeBackgroundColor({ color: "#7c6af7" }); // accent purple
  chrome.action.setBadgeText({ text: "↑" });
}

/**
 * Called by the "injectionResult" message from content.js on success.
 * Auto-clears after 2 s.
 */
function setBadgeSuccess() {
  _cancelClear();
  chrome.action.setBadgeBackgroundColor({ color: "#22c55e" }); // green
  chrome.action.setBadgeText({ text: "✓" });
  _clearBadgeAfter(2_000);
}

/**
 * Called by the "injectionResult" message from content.js on failure.
 * Auto-clears after 3 s.
 */
function setBadgeError() {
  _cancelClear();
  chrome.action.setBadgeBackgroundColor({ color: "#ef4444" }); // red
  chrome.action.setBadgeText({ text: "!" });
  _clearBadgeAfter(3_000);
}

// ══════════════════════════════════════════════════════════════════
// 2. STORAGE WATCHER
//
// The popup and the options-page history both queue a message by
// writing pendingMessage to chrome.storage.local. This listener
// catches both of them without either page needing to know about
// badge state.
//
// Context-menu submissions set the badge directly in the click
// handler (below) because they call chrome.storage.local.set()
// themselves — catching them here too would double-fire, so we
// gate on the context-menu flag to skip duplicates.
// ══════════════════════════════════════════════════════════════════

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  // Only react when pendingMessage is newly written (not cleared).
  if (!changes.pendingMessage?.newValue) return;

  // Context-menu submissions set _fromContextMenu = true before writing
  // storage; we skip them here to avoid calling setBadgeQueued twice.
  if (_fromContextMenu) {
    _fromContextMenu = false;
    return;
  }

  setBadgeQueued();
});

// ══════════════════════════════════════════════════════════════════
// 3. INJECTION RESULT LISTENER
//
// content.js sends { type: "injectionResult", success: boolean }
// after attempting to inject the message into Gemini's input field.
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
 * Recreates all context menus from scratch.
 *
 * In MV3, the service worker can be killed and restarted at any time.
 * Context menus are stored in Chrome's browser process and survive restarts,
 * BUT if the service worker was previously terminated mid-operation (or the
 * extension was reloaded via chrome://extensions), Chrome may drop them.
 *
 * The safest pattern is:
 *   1. removeAll()  — wipe whatever state Chrome thinks it has
 *   2. create()     — register fresh copies
 *
 * This is idempotent and called from BOTH onInstalled and onStartup so menus
 * are always present regardless of how the service worker came to life.
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

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "open-gemini-direct" || info.menuItemId === "open-gemini-page") {
    chrome.tabs.create({ url: GEMINI_URL });
    return;
  }

  if (info.menuItemId === "ask-gemini-selection" && info.selectionText) {
    const { askGeminiModel = "flash" } = await chrome.storage.local.get("askGeminiModel");

    // Set badge BEFORE writing storage so it's visible before the tab opens.
    setBadgeQueued();

    // Signal the storage watcher to skip this write.
    _fromContextMenu = true;

    await chrome.storage.local.set({
      pendingMessage: info.selectionText.trim(),
      pendingModel:   askGeminiModel,
    });

    chrome.tabs.create({ url: GEMINI_URL });
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
    } catch (_) { /* positioning failed — use defaults */ }

    chrome.windows.create({
      url: popupUrl,
      type: "popup",
      width: 376,   // 360px layout + roughly 16px for OS borders
      height: 270,  // Initial estimation; the script below will refine this
      left: left ?? 100,
      top: top ?? 100,
      focused: true,
    });
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/welcome/welcome.html")
    });
  }
  if (typeof registerMenus === 'function') registerMenus();
});