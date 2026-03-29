// ── background.js ─────────────────────────────────────────────────
// Service worker: handles context menu (right-click) and icon setup

const GEMINI_URL = "https://gemini.google.com/app";

chrome.runtime.onInstalled.addListener(() => {
  // 1. Context for the toolbar icon
  chrome.contextMenus.create({
    id: "open-gemini-direct",
    title: "Ask Gemini",
    contexts: ["action"]
  });

  // 2. Context for right-clicking the page background (NO selection)
  // By removing "selection" from here, we avoid the sub-menu conflict.
  chrome.contextMenus.create({
    id: "open-gemini-page",
    title: "Ask Gemini",
    contexts: ["page"] 
  });

  // 3. Context for when text IS selected
  // The %s placeholder will automatically insert the selected text.
  chrome.contextMenus.create({
    id: "ask-gemini-selection",
    title: 'Ask Gemini: "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  // Handle both the direct icon click and the page background click
  if (info.menuItemId === "open-gemini-direct" || info.menuItemId === "open-gemini-page") {
    chrome.tabs.create({ url: GEMINI_URL });
  } else if (info.menuItemId === "ask-gemini-selection" && info.selectionText) {
    // Read the saved model preference so content.js uses the right model
    const { askGeminiModel = "flash" } = await chrome.storage.local.get("askGeminiModel");
    await chrome.storage.local.set({
      pendingMessage: info.selectionText.trim(),
      pendingModel: askGeminiModel,
    });
    chrome.tabs.create({ url: GEMINI_URL });
  }
});