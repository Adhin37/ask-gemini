import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ── Captured listener callbacks ──────────────────────────────────────
// background.js registers these at import time; we capture them via
// mockImplementation so we can trigger them directly from tests.
let onMessage;
let onStorageChanged;
let onContextMenuClicked;
let onInstalled;

beforeAll(async () => {
  // These must be set BEFORE the import so the implementations are in place
  // when background.js calls chrome.*.addListener() during module init.
  chrome.runtime.onMessage.addListener.mockImplementation(fn => { onMessage = fn; });
  chrome.storage.onChanged.addListener.mockImplementation(fn => { onStorageChanged = fn; });
  chrome.contextMenus.onClicked.addListener.mockImplementation(fn => { onContextMenuClicked = fn; });
  chrome.runtime.onInstalled.addListener.mockImplementation(fn => { onInstalled = fn; });

  await import("../../src/background/background.js");
});

// After each test setup.js replaces globalThis.chrome with a fresh mock.
// The captured callbacks still reference `chrome` as a global name, so they
// transparently pick up the new mock on every invocation.

// ════════════════════════════════════════════════════════════════════
// Badge helpers
// ════════════════════════════════════════════════════════════════════

describe("badge — injectionResult message", () => {
  it("success=true sets green badge and clears after 2 s", () => {
    vi.useFakeTimers();
    onMessage({ type: "injectionResult", success: true });

    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#22c55e" });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });

    vi.advanceTimersByTime(2000);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" });
    vi.useRealTimers();
  });

  it("success=false sets red badge and clears after 3 s", () => {
    vi.useFakeTimers();
    onMessage({ type: "injectionResult", success: false });

    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#ef4444" });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" });

    // Not yet cleared at 2999 ms
    vi.advanceTimersByTime(2999);
    const lastArg = chrome.action.setBadgeText.mock.lastCall?.[0];
    expect(lastArg).not.toEqual({ text: "" });

    vi.advanceTimersByTime(1);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" });
    vi.useRealTimers();
  });

  it("ignores non-injectionResult messages", () => {
    onMessage({ type: "other", success: true });
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("ignores messages with no type", () => {
    onMessage({});
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe("badge — storage watcher", () => {
  it("sets queued badge when pendingMessage appears in local area", () => {
    onStorageChanged({ pendingMessage: { newValue: "hello" } }, "local");
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "↑" });
  });

  it("ignores changes in non-local areas", () => {
    onStorageChanged({ pendingMessage: { newValue: "hello" } }, "sync");
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("ignores local changes without pendingMessage", () => {
    onStorageChanged({ askGeminiModel: { newValue: "pro" } }, "local");
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("ignores local pendingMessage change with falsy newValue", () => {
    onStorageChanged({ pendingMessage: { newValue: "" } }, "local");
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// Context menu registration
// ════════════════════════════════════════════════════════════════════

describe("registerMenus (via onInstalled)", () => {
  it("creates the three expected menu items", () => {
    onInstalled({ reason: "update" });
    const ids = chrome.contextMenus.create.mock.calls.map(c => c[0].id);
    expect(ids).toContain("open-gemini-direct");
    expect(ids).toContain("open-gemini-page");
    expect(ids).toContain("ask-gemini-selection");
  });

  it("does NOT create a separate summarize entry (menus are merged)", () => {
    onInstalled({ reason: "update" });
    const ids = chrome.contextMenus.create.mock.calls.map(c => c[0].id);
    expect(ids).not.toContain("ask-gemini-summarize");
  });

  it("calls removeAll before recreating", () => {
    onInstalled({ reason: "update" });
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// Context menu click handler
// ════════════════════════════════════════════════════════════════════

describe("contextMenus.onClicked — navigation items", () => {
  it("open-gemini-direct opens a Gemini tab", async () => {
    await onContextMenuClicked({ menuItemId: "open-gemini-direct" });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://gemini.google.com/app" });
  });

  it("open-gemini-page opens a Gemini tab", async () => {
    await onContextMenuClicked({ menuItemId: "open-gemini-page" });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://gemini.google.com/app" });
  });
});

describe("contextMenus.onClicked — ask-gemini-selection", () => {
  beforeEach(() => {
    // Default storage response for model + prefix
    chrome.storage.local.get.mockResolvedValue({
      askGeminiModel:           "flash",
      askGeminiSummarizePrefix: "My prefix",
    });
  });

  it("prepends stored prefix to selection and dispatches", async () => {
    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "test text",
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      pendingMessage: "My prefix\n\ntest text",
      pendingModel:   "flash",
    });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://gemini.google.com/app" });
  });

  it("trims trailing whitespace from prefix before joining", async () => {
    chrome.storage.local.get.mockResolvedValue({
      askGeminiModel:           "pro",
      askGeminiSummarizePrefix: "Clean up:   \n\n",
    });

    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "hello",
    });

    const { pendingMessage } = chrome.storage.local.set.mock.calls[0][0];
    expect(pendingMessage).toBe("Clean up:\n\nhello");
  });

  it("uses default prefix when none is saved", async () => {
    chrome.storage.local.get.mockResolvedValue({ askGeminiModel: "flash" });

    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "some text",
    });

    const { pendingMessage } = chrome.storage.local.set.mock.calls[0][0];
    expect(pendingMessage).toContain("Summarise the following:");
    expect(pendingMessage).toContain("some text");
  });

  it("does nothing when selectionText is absent", async () => {
    await onContextMenuClicked({ menuItemId: "ask-gemini-selection", selectionText: "" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("passes the stored model to dispatchToGemini", async () => {
    chrome.storage.local.get.mockResolvedValue({
      askGeminiModel:           "thinking",
      askGeminiSummarizePrefix: "Think about:",
    });

    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "a problem",
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ pendingModel: "thinking" })
    );
  });
});
