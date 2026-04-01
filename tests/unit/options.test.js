import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { setupOptionsDom, resetOptionsDom } from "../helpers/options-dom.js";

let escapeHtml, escAttr, highlightMatch, formatTime, resolveTheme;
let renderHistory, loadTemplates, loadContextMenuSettings;
let updateCharCount, updateSummarizePrefixCharCount;
let _setAllHistory, _setAllTemplates, _setCurrentTheme, _setCurrentModel;

const DEFAULT_SUMMARIZE_PREFIX = "Summarise the following:\n\n";

beforeAll(async () => {
  setupOptionsDom();
  globalThis.__TEST__ = {};
  await import("../../src/options/options.js");
  ({
    escapeHtml, escAttr, highlightMatch, formatTime, resolveTheme,
    renderHistory, loadTemplates, loadContextMenuSettings,
    updateCharCount, updateSummarizePrefixCharCount,
    _setAllHistory, _setAllTemplates, _setCurrentTheme, _setCurrentModel,
  } = globalThis.__TEST__);
});

beforeEach(() => {
  resetOptionsDom();
  _setAllHistory([]);
  _setAllTemplates([]);
  _setCurrentTheme("auto");
  _setCurrentModel("flash");
});

// ════════════════════════════════════════════════════════════════════
// escapeHtml
// ════════════════════════════════════════════════════════════════════

describe("escapeHtml", () => {
  it("escapes ampersand",    () => expect(escapeHtml("a & b")).toBe("a &amp; b"));
  it("escapes less-than",    () => expect(escapeHtml("<b>")).toBe("&lt;b&gt;"));
  it("escapes double-quote", () => expect(escapeHtml('"hi"')).toBe("&quot;hi&quot;"));
  it("leaves clean strings unchanged", () => expect(escapeHtml("hello")).toBe("hello"));
});

// ════════════════════════════════════════════════════════════════════
// escAttr
// ════════════════════════════════════════════════════════════════════

describe("escAttr", () => {
  it('escapes double-quote', () => expect(escAttr('say "hi"')).toBe("say &quot;hi&quot;"));
  it("escapes single-quote", () => expect(escAttr("it's")).toBe("it&#39;s"));
});

// ════════════════════════════════════════════════════════════════════
// highlightMatch
// ════════════════════════════════════════════════════════════════════

describe("highlightMatch", () => {
  it("wraps the matched substring in <mark>", () => {
    expect(highlightMatch("hello world", "world")).toBe("hello <mark>world</mark>");
  });

  it("is case-insensitive", () => {
    expect(highlightMatch("HELLO", "hello")).toBe("<mark>HELLO</mark>");
  });

  it("HTML-escapes the source text before highlighting", () => {
    // '<' in text becomes &lt; the query 'b' is matched inside the tag name
    expect(highlightMatch("<b>bold</b>", "bold")).toContain("<mark>bold</mark>");
    expect(highlightMatch("<script>", "script")).not.toContain("<script>");
  });
});

// ════════════════════════════════════════════════════════════════════
// formatTime
// ════════════════════════════════════════════════════════════════════

describe("formatTime", () => {
  const NOW = new Date("2025-06-01T12:00:00Z").getTime();

  beforeEach(() => { vi.setSystemTime(NOW); });
  afterEach(()  => { vi.useRealTimers(); });

  it("returns empty string for falsy ts", () => {
    expect(formatTime(null)).toBe("");
    expect(formatTime(0)).toBe("");
  });

  it('returns "just now" for timestamps < 60 s ago', () => {
    expect(formatTime(NOW - 30_000)).toBe("just now");
  });

  it('returns "Xm ago" for timestamps < 1 h ago', () => {
    expect(formatTime(NOW - 2 * 60_000)).toBe("2m ago");
  });

  it('returns "Xh ago" for timestamps < 24 h ago', () => {
    expect(formatTime(NOW - 3 * 3_600_000)).toBe("3h ago");
  });

  it('returns "Xd ago" for timestamps < 7 days ago', () => {
    expect(formatTime(NOW - 2 * 86_400_000)).toBe("2d ago");
  });
});

// ════════════════════════════════════════════════════════════════════
// resolveTheme
// ════════════════════════════════════════════════════════════════════

describe("resolveTheme", () => {
  it('returns "light" for pref "light"',  () => expect(resolveTheme("light")).toBe("light"));
  it('returns "dark" for pref "dark"',    () => expect(resolveTheme("dark")).toBe("dark"));
  it('returns "dark" for "auto" when matchMedia.matches is false', () => {
    // setup.js stubs matchMedia with matches: false
    expect(resolveTheme("auto")).toBe("dark");
  });
});

// ════════════════════════════════════════════════════════════════════
// renderHistory
// ════════════════════════════════════════════════════════════════════

describe("renderHistory", () => {
  it('shows empty state with "No history yet." when list is empty', () => {
    renderHistory([]);
    const emptyState = document.getElementById("emptyState");
    expect(emptyState.style.display).not.toBe("none");
    expect(emptyState.querySelector("p").textContent).toBe("No history yet.");
  });

  it('shows "No matches." message when query finds nothing', () => {
    renderHistory([{ text: "hello", ts: Date.now() }], "zzz");
    const emptyState = document.getElementById("emptyState");
    expect(emptyState.style.display).not.toBe("none");
    expect(emptyState.querySelector("p").textContent).toBe("No matches.");
  });

  it("hides empty state and renders an item for each history entry", () => {
    renderHistory([
      { text: "first",  ts: Date.now() },
      { text: "second", ts: Date.now() },
    ]);
    const emptyState = document.getElementById("emptyState");
    expect(emptyState.style.display).toBe("none");
    expect(document.querySelectorAll(".history-item")).toHaveLength(2);
  });

  it("filters items by query (case-insensitive)", () => {
    renderHistory([
      { text: "apple pie",  ts: Date.now() },
      { text: "banana cake", ts: Date.now() },
    ], "APPLE");
    expect(document.querySelectorAll(".history-item")).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// Theme control
// ════════════════════════════════════════════════════════════════════

describe("theme control", () => {
  it("clicking a different theme button saves it to storage", async () => {
    const darkBtn = document.querySelector('#themeControl [data-value="dark"]');
    darkBtn.click();
    // Give the async handler a tick to complete
    await Promise.resolve();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ askGeminiTheme: "dark" })
    );
  });

  it("clicking the already-active theme does not call storage.set", async () => {
    // On init, applyTheme("auto") is called → currentTheme = "auto"
    const autoBtn = document.querySelector('#themeControl [data-value="auto"]');
    autoBtn.click();
    await Promise.resolve();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// Model control
// ════════════════════════════════════════════════════════════════════

describe("model control", () => {
  it("clicking a different model button saves it to storage", async () => {
    const proBtn = document.querySelector('#modelControl [data-value="pro"]');
    proBtn.click();
    await Promise.resolve();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ askGeminiModel: "pro" })
    );
  });

  it("clicking the already-active model does not call storage.set", async () => {
    // On init, applyModel("flash") is called → currentModel = "flash"
    const flashBtn = document.querySelector('#modelControl [data-value="flash"]');
    flashBtn.click();
    await Promise.resolve();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// Summarize prefix
// ════════════════════════════════════════════════════════════════════

describe("summarize prefix", () => {
  it("updateSummarizePrefixCharCount reflects current textarea length", () => {
    const ta    = document.getElementById("summarizePrefixTextarea");
    const count = document.getElementById("summarizePrefixCharCount");
    ta.value = "hello";
    updateSummarizePrefixCharCount();
    expect(count.textContent).toBe("5 / 300");
  });

  it("adds warn class when length > 80% of max", () => {
    const ta    = document.getElementById("summarizePrefixTextarea");
    const count = document.getElementById("summarizePrefixCharCount");
    ta.value = "x".repeat(250); // 250 > 300*0.8 = 240
    updateSummarizePrefixCharCount();
    expect(count.classList.contains("warn")).toBe(true);
    expect(count.classList.contains("over")).toBe(false);
  });

  it("adds over class when length exceeds max", () => {
    const ta    = document.getElementById("summarizePrefixTextarea");
    const count = document.getElementById("summarizePrefixCharCount");
    ta.value = "x".repeat(301);
    updateSummarizePrefixCharCount();
    expect(count.classList.contains("over")).toBe(true);
  });

  it("save button click stores the prefix value", async () => {
    const ta      = document.getElementById("summarizePrefixTextarea");
    const saveBtn = document.getElementById("summarizePrefixSaveBtn");
    ta.value          = "My custom prefix";
    saveBtn.disabled  = false;
    saveBtn.click();
    await Promise.resolve();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ askGeminiSummarizePrefix: "My custom prefix" })
    );
  });

  it("reset button restores the default prefix and saves it", async () => {
    const ta         = document.getElementById("summarizePrefixTextarea");
    const resetBtn   = document.getElementById("summarizePrefixResetBtn");
    ta.value = "something custom";
    resetBtn.click();
    await Promise.resolve();
    expect(ta.value).toBe(DEFAULT_SUMMARIZE_PREFIX);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ askGeminiSummarizePrefix: DEFAULT_SUMMARIZE_PREFIX })
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// Templates — char count
// ════════════════════════════════════════════════════════════════════

describe("template char count", () => {
  it("updateCharCount reflects current textarea length", () => {
    const ta    = document.getElementById("tmplTextarea");
    const count = document.getElementById("tmplCharCount");
    ta.value = "abc";
    updateCharCount();
    expect(count.textContent).toBe("3 / 400");
  });

  it("save button becomes disabled when textarea is empty", () => {
    const ta      = document.getElementById("tmplTextarea");
    const saveBtn = document.getElementById("tmplSaveBtn");
    ta.value = "";
    ta.dispatchEvent(new Event("input"));
    expect(saveBtn.disabled).toBe(true);
  });

  it("save button is enabled when textarea has content within limit", () => {
    const ta      = document.getElementById("tmplTextarea");
    const saveBtn = document.getElementById("tmplSaveBtn");
    ta.value = "some template text";
    ta.dispatchEvent(new Event("input"));
    expect(saveBtn.disabled).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// loadTemplates — defaults
// ════════════════════════════════════════════════════════════════════

describe("loadTemplates", () => {
  it("seeds DEFAULT_TEMPLATES when storage has no templates", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadTemplates();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        askGeminiTemplates: expect.arrayContaining(["Summarise: "]),
      })
    );
  });

  it("renders template cards when storage has templates", async () => {
    chrome.storage.local.get.mockResolvedValue({
      askGeminiTemplates: ["Template A", "Template B"],
    });
    await loadTemplates();
    expect(document.querySelectorAll(".tmpl-card")).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════════════
// History overlay
// ════════════════════════════════════════════════════════════════════

describe("history overlay", () => {
  it("clear button is a no-op when history is empty", () => {
    _setAllHistory([]);
    const overlay  = document.getElementById("confirmOverlay");
    const clearBtn = document.getElementById("clearHistoryBtn");
    clearBtn.click();
    expect(overlay.classList.contains("visible")).toBe(false);
  });

  it("clear button shows the confirm overlay when history has entries", () => {
    _setAllHistory([{ text: "a", ts: 1 }]);
    const overlay  = document.getElementById("confirmOverlay");
    const clearBtn = document.getElementById("clearHistoryBtn");
    clearBtn.click();
    expect(overlay.classList.contains("visible")).toBe(true);
  });

  it("cancel button hides the confirm overlay", () => {
    const overlay      = document.getElementById("confirmOverlay");
    const confirmCancel = document.getElementById("confirmCancel");
    overlay.classList.add("visible");
    confirmCancel.click();
    expect(overlay.classList.contains("visible")).toBe(false);
  });

  it("confirmOk clears history in storage", async () => {
    const confirmOk = document.getElementById("confirmOk");
    confirmOk.click();
    await Promise.resolve();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ askGeminiHistory: [] })
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// loadContextMenuSettings
// ════════════════════════════════════════════════════════════════════

describe("loadContextMenuSettings", () => {
  it("loads the stored prefix into the textarea", async () => {
    chrome.storage.local.get.mockResolvedValue({
      askGeminiSummarizePrefix: "Custom prefix:",
    });
    await loadContextMenuSettings();
    expect(document.getElementById("summarizePrefixTextarea").value).toBe("Custom prefix:");
  });

  it("falls back to DEFAULT_SUMMARIZE_PREFIX when nothing is stored", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await loadContextMenuSettings();
    expect(document.getElementById("summarizePrefixTextarea").value).toBe(DEFAULT_SUMMARIZE_PREFIX);
  });
});
