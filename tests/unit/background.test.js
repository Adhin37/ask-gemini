import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ── Captured listener callbacks ──────────────────────────────────────
// background.js registers these at import time; we capture them via
// mockImplementation so we can trigger them directly from tests.
let onMessage;
let onStorageChanged;
let onContextMenuClicked;
let onInstalled;
let _restorePendingResult;
let PENDING_SINCE_KEY;
let RESULT_TIMEOUT_MS;

beforeAll(async () => {
  globalThis.__TEST__ = {};
  // These must be set BEFORE the import so the implementations are in place
  // when background.js calls chrome.*.addListener() during module init.
  chrome.runtime.onMessage.addListener.mockImplementation(fn => { onMessage = fn; });
  chrome.storage.onChanged.addListener.mockImplementation(fn => { onStorageChanged = fn; });
  chrome.contextMenus.onClicked.addListener.mockImplementation(fn => { onContextMenuClicked = fn; });
  chrome.runtime.onInstalled.addListener.mockImplementation(fn => { onInstalled = fn; });

  await import("../../src/background/background.js");
  ({ _restorePendingResult, PENDING_SINCE_KEY, RESULT_TIMEOUT_MS } = globalThis.__TEST__);
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

  it("success=false sets red badge and clears after 6 s", () => {
    vi.useFakeTimers();
    onMessage({ type: "injectionResult", success: false });

    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#ef4444" });
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" });

    // Not yet cleared at 5999 ms
    vi.advanceTimersByTime(5999);
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
// Welcome tab — onInstalled
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// Pending state — survives service-worker restarts
// ════════════════════════════════════════════════════════════════════

describe("badge — pending state in chrome.storage.session", () => {
  it("queued badge stores the send start time", () => {
    onStorageChanged({ pendingMessage: { newValue: "hello" } }, "local");
    expect(chrome.storage.session._store.get(PENDING_SINCE_KEY)).toEqual(expect.any(Number));
  });

  it("success result clears the stored start time", () => {
    chrome.storage.session._store.set(PENDING_SINCE_KEY, Date.now());
    onMessage({ type: "injectionResult", success: true });
    expect(chrome.storage.session._store.has(PENDING_SINCE_KEY)).toBe(false);
  });

  it("error result clears the stored start time", () => {
    chrome.storage.session._store.set(PENDING_SINCE_KEY, Date.now());
    onMessage({ type: "injectionResult", success: false });
    expect(chrome.storage.session._store.has(PENDING_SINCE_KEY)).toBe(false);
  });

  it("restore does nothing when no send is pending", async () => {
    await _restorePendingResult();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it("restore shows the error badge when the timeout already expired", async () => {
    chrome.storage.session._store.set(PENDING_SINCE_KEY, Date.now() - RESULT_TIMEOUT_MS - 1);
    await _restorePendingResult();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" });
    expect(chrome.storage.session._store.has(PENDING_SINCE_KEY)).toBe(false);
  });

  it("restore re-arms the timeout for the remaining time", async () => {
    vi.useFakeTimers();
    chrome.storage.session._store.set(PENDING_SINCE_KEY, Date.now() - 20_000);
    await _restorePendingResult();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();

    vi.advanceTimersByTime(RESULT_TIMEOUT_MS - 20_000 - 1);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" });
    vi.useRealTimers();
  });

  it("restore keeps a result that arrived while it was reading storage", async () => {
    vi.useFakeTimers();
    chrome.storage.session._store.set(PENDING_SINCE_KEY, Date.now() - 20_000);
    const restoring = _restorePendingResult();
    onMessage({ type: "injectionResult", success: true });
    await restoring;

    vi.advanceTimersByTime(RESULT_TIMEOUT_MS);
    expect(chrome.action.setBadgeText).not.toHaveBeenCalledWith({ text: "!" });
    vi.useRealTimers();
  });
});

describe("storage migration (onInstalled)", () => {
  it("converts the model + thinking settings to a thinking level", async () => {
    chrome.storage.sync.get.mockResolvedValue({ askGeminiModel: "flash", askGeminiThinkingLevel: "standard" });
    await onInstalled({ reason: "update" });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ askGeminiThinkingLevel: "medium" });
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith("askGeminiModel");
  });

  it("regroups per-model templates per level", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      askGeminiThinkingLevel: "high",
      askGeminiTemplates: { "flash-lite": ["a"], flash: ["b"], pro: ["c"] },
    });
    await onInstalled({ reason: "update" });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      askGeminiTemplates: { low: ["a"], medium: ["b"], high: ["c"] },
    });
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
  });

  it("leaves already-migrated settings untouched", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      askGeminiThinkingLevel: "low",
      askGeminiTemplates: { low: [], medium: ["b"], high: ["c"] },
    });
    await onInstalled({ reason: "update" });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});

describe("welcome tab (onInstalled)", () => {
  it("opens the welcome tab on fresh install", async () => {
    // onInstalled is async (it awaits the model/thinking-level migration's
    // chrome.storage.sync.get before reaching the welcome-tab branch), so the
    // call must be awaited or these assertions run before it resumes.
    await onInstalled({ reason: "install" });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://fake/src/welcome/welcome.html",
    });
  });

  it("does NOT open the welcome tab on extension update", async () => {
    await onInstalled({ reason: "update" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("does NOT open the welcome tab on browser update", async () => {
    await onInstalled({ reason: "chrome_update" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("still registers menus on fresh install", async () => {
    await onInstalled({ reason: "install" });
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    expect(chrome.contextMenus.create).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// Context menu registration
// ════════════════════════════════════════════════════════════════════

describe("registerMenus (via onInstalled)", () => {
  it("creates the three expected menu items", async () => {
    await onInstalled({ reason: "update" });
    const ids = chrome.contextMenus.create.mock.calls.map(c => c[0].id);
    expect(ids).toContain("open-gemini-direct");
    expect(ids).toContain("open-gemini-page");
    expect(ids).toContain("ask-gemini-selection");
  });

  it("does NOT create a separate summarize entry (menus are merged)", async () => {
    await onInstalled({ reason: "update" });
    const ids = chrome.contextMenus.create.mock.calls.map(c => c[0].id);
    expect(ids).not.toContain("ask-gemini-summarize");
  });

  it("calls removeAll before recreating", async () => {
    await onInstalled({ reason: "update" });
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
    // Default storage response for level + prefix (read from sync in background.js)
    chrome.storage.sync.get.mockResolvedValue({
      askGeminiThinkingLevel:   "medium",
      askGeminiSummarizePrefix: "My prefix",
    });
  });

  it("prepends stored prefix to selection and dispatches", async () => {
    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "test text",
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingMessage:       "My prefix\n\ntest text",
        pendingThinkingLevel: "medium",
      })
    );
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://gemini.google.com/app" });
  });

  it("trims trailing whitespace from prefix before joining", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      askGeminiThinkingLevel:   "high",
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
    chrome.storage.sync.get.mockResolvedValue({ askGeminiThinkingLevel: "medium" });

    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "some text",
    });

    const { pendingMessage } = chrome.storage.local.set.mock.calls[0][0];
    expect(pendingMessage).toContain("Summarize the following:");
    expect(pendingMessage).toContain("some text");
  });

  it("does nothing when selectionText is absent", async () => {
    await onContextMenuClicked({ menuItemId: "ask-gemini-selection", selectionText: "" });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("passes the stored thinking level to dispatchToGemini", async () => {
    chrome.storage.sync.get.mockResolvedValue({
      askGeminiThinkingLevel:   "low",
      askGeminiSummarizePrefix: "Think about:",
    });

    await onContextMenuClicked({
      menuItemId:    "ask-gemini-selection",
      selectionText: "a problem",
    });

    const payload = chrome.storage.local.set.mock.calls[0][0];
    expect(payload.pendingThinkingLevel).toBe("low");
    expect(payload).not.toHaveProperty("pendingModel");
  });

  it("maps pre-Auto settings that were not migrated yet", async () => {
    // Pro + Extended thinking → High; a bare model id → its tier.
    chrome.storage.sync.get.mockResolvedValue({ askGeminiModel: "pro", askGeminiThinkingLevel: "extended" });
    await onContextMenuClicked({ menuItemId: "ask-gemini-selection", selectionText: "x" });
    expect(chrome.storage.local.set.mock.calls[0][0].pendingThinkingLevel).toBe("high");

    chrome.storage.local.set.mockClear();
    chrome.storage.sync.get.mockResolvedValue({ askGeminiModel: "flash-lite", askGeminiThinkingLevel: "standard" });
    await onContextMenuClicked({ menuItemId: "ask-gemini-selection", selectionText: "x" });
    expect(chrome.storage.local.set.mock.calls[0][0].pendingThinkingLevel).toBe("low");
  });
});
