// ── background.js ─────────────────────────────────────────────────
// Service worker: handles context menu (right-click) and icon setup

const GEMINI_URL = "https://gemini.google.com/app";

// ── Context menu: right-click on the extension icon ───────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "open-gemini-direct",
    title: "Open Gemini",
    contexts: ["action"]          // shown when right-clicking the toolbar icon
  });

  // Also available from any page via right-click on page content
  chrome.contextMenus.create({
    id: "open-gemini-page",
    title: "Open Gemini",
    contexts: ["page", "selection"]
  });

  // If user right-clicks on selected text → pre-fill Gemini with it
  chrome.contextMenus.create({
    id: "ask-gemini-selection",
    title: 'Ask Gemini: "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "open-gemini-direct" || info.menuItemId === "open-gemini-page") {
    chrome.tabs.create({ url: GEMINI_URL });

  } else if (info.menuItemId === "ask-gemini-selection" && info.selectionText) {
    await chrome.storage.local.set({ pendingMessage: info.selectionText.trim() });
    chrome.tabs.create({ url: GEMINI_URL });
  }
});
