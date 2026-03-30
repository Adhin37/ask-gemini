// ── background.js ─────────────────────────────────────────────────
// Service worker: handles context menu (right-click) and icon setup

const GEMINI_URL = "https://gemini.google.com/app";

// ── Menu definitions ───────────────────────────────────────────────
// Kept in one place so both onInstalled and onStartup use the same spec.
const MENU_ITEMS = [
  {
    id: "open-gemini-direct",
    title: "Open Gemini",
    contexts: ["action"],
  },
  {
    id: "open-gemini-page",
    title: "Ask Gemini",
    contexts: ["page"],
  },
  {
    id: "ask-gemini-selection",
    title: 'Ask Gemini: "%s"',
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

// Fires on install, update, or Chrome update — always re-register.
chrome.runtime.onInstalled.addListener(registerMenus);

// Fires when Chrome starts (or when the extension's service worker is
// restarted after being killed). This is the key fix: onInstalled alone
// does NOT fire on every browser launch or service-worker restart.
chrome.runtime.onStartup.addListener(registerMenus);

// ── Click handler ──────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "open-gemini-direct" || info.menuItemId === "open-gemini-page") {
    chrome.tabs.create({ url: GEMINI_URL });
  } else if (info.menuItemId === "ask-gemini-selection" && info.selectionText) {
    const { askGeminiModel = "flash" } = await chrome.storage.local.get("askGeminiModel");
    await chrome.storage.local.set({
      pendingMessage: info.selectionText.trim(),
      pendingModel: askGeminiModel,
    });
    chrome.tabs.create({ url: GEMINI_URL });
  }
});