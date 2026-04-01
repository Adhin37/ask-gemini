import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { setupPopupDom, resetPopupDom } from "../helpers/popup-dom.js";

// ── Load popup.js once ───────────────────────────────────────────────
// DOM must be set up BEFORE the import so the module-level getElementById
// calls all find their elements.  The init IIFE starts but returns early
// (no draft, no selection) because chrome storage mocks resolve to {}.
let escapeHtml;
let isInsideCodeBlock;
let filterTemplates;
let saveToHistory;

beforeAll(async () => {
  setupPopupDom();
  globalThis.__TEST__ = {};
  await import("../../src/popup/popup.js");
  ({ escapeHtml, isInsideCodeBlock, filterTemplates, saveToHistory } = globalThis.__TEST__);
});

beforeEach(() => {
  resetPopupDom();
});

// ════════════════════════════════════════════════════════════════════
// escapeHtml
// ════════════════════════════════════════════════════════════════════

describe("escapeHtml", () => {
  it("escapes ampersand",     () => expect(escapeHtml("a & b")).toBe("a &amp; b"));
  it("escapes less-than",     () => expect(escapeHtml("<tag>")).toBe("&lt;tag&gt;"));
  it("escapes double-quote",  () => expect(escapeHtml('"hi"')).toBe("&quot;hi&quot;"));
  it("escapes all at once",   () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });
  it("leaves clean strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

// ════════════════════════════════════════════════════════════════════
// isInsideCodeBlock
// ════════════════════════════════════════════════════════════════════

describe("isInsideCodeBlock", () => {
  it("returns false when there are no fences", () => {
    expect(isInsideCodeBlock("normal text", 5)).toBe(false);
  });

  it("returns false when cursor is before the first fence", () => {
    expect(isInsideCodeBlock("hello ```code```", 3)).toBe(false);
  });

  it("returns true inside an open fence (odd fence count before cursor)", () => {
    // one ``` before pos → inside
    expect(isInsideCodeBlock("```code", 6)).toBe(true);
  });

  it("returns false after a closed fence (even fence count before cursor)", () => {
    // two ``` before pos → outside
    expect(isInsideCodeBlock("```code```after", 12)).toBe(false);
  });

  it("returns true inside a second open fence block", () => {
    // three ``` before cursor → inside
    const text = "```a``` ```b";
    expect(isInsideCodeBlock(text, text.length)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// filterTemplates
// ════════════════════════════════════════════════════════════════════

describe("filterTemplates", () => {
  // filterTemplates reads the module-level `templates` array.
  // On load, popup.js sets it to DEFAULT_TEMPLATES (5 entries).

  it("returns all templates for an empty query", () => {
    const results = filterTemplates("");
    expect(results.length).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    const results = filterTemplates("SUM");
    expect(results.some(t => t.toLowerCase().startsWith("sum"))).toBe(true);
  });

  it("returns empty array when no template matches", () => {
    expect(filterTemplates("zzzzzz")).toHaveLength(0);
  });

  it("returns only templates whose text starts with the query", () => {
    const results = filterTemplates("translate");
    expect(results.every(t => t.toLowerCase().startsWith("translate"))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// saveToHistory
// ════════════════════════════════════════════════════════════════════

describe("saveToHistory", () => {
  it("saves a new message to storage", async () => {
    chrome.storage.local.get.mockResolvedValue({ askGeminiHistory: [] });

    await saveToHistory("my prompt");

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        askGeminiHistory: expect.arrayContaining([
          expect.objectContaining({ text: "my prompt" }),
        ]),
      })
    );
  });

  it("prepends the new message (most recent first)", async () => {
    chrome.storage.local.get.mockResolvedValue({
      askGeminiHistory: [{ text: "old", ts: 1 }],
    });

    await saveToHistory("new");

    const saved = chrome.storage.local.set.mock.calls[0][0].askGeminiHistory;
    expect(saved[0].text).toBe("new");
    expect(saved[1].text).toBe("old");
  });

  it("deduplicates: removes previous occurrence before prepending", async () => {
    chrome.storage.local.get.mockResolvedValue({
      askGeminiHistory: [
        { text: "dup", ts: 1 },
        { text: "other", ts: 2 },
      ],
    });

    await saveToHistory("dup");

    const saved = chrome.storage.local.set.mock.calls[0][0].askGeminiHistory;
    const dupEntries = saved.filter(h => h.text === "dup");
    expect(dupEntries).toHaveLength(1);
    expect(saved[0].text).toBe("dup");
  });

  it("trims history to MAX_HISTORY (20) entries", async () => {
    const existing = Array.from({ length: 20 }, (_, i) => ({ text: `msg${i}`, ts: i }));
    chrome.storage.local.get.mockResolvedValue({ askGeminiHistory: existing });

    await saveToHistory("extra");

    const saved = chrome.storage.local.set.mock.calls[0][0].askGeminiHistory;
    expect(saved).toHaveLength(20);
    expect(saved[0].text).toBe("extra");
  });
});

// ════════════════════════════════════════════════════════════════════
// askGemini guards (DOM interaction)
// ════════════════════════════════════════════════════════════════════

describe("send button", () => {
  it("is disabled when input is empty", () => {
    const input   = document.getElementById("questionInput");
    const sendBtn = document.getElementById("sendBtn");
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(sendBtn.disabled).toBe(true);
  });

  it("is enabled when input has non-whitespace content", () => {
    const input   = document.getElementById("questionInput");
    const sendBtn = document.getElementById("sendBtn");
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    expect(sendBtn.disabled).toBe(false);
  });

  it("is disabled again when input is cleared", () => {
    const input   = document.getElementById("questionInput");
    const sendBtn = document.getElementById("sendBtn");
    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(sendBtn.disabled).toBe(true);
  });
});

describe("hint text", () => {
  it("shows char-remaining warning when near limit", () => {
    const input = document.getElementById("questionInput");
    const hint  = document.getElementById("hint");
    input.value = "x".repeat(1700); // > 80% of 2000
    input.dispatchEvent(new Event("input"));
    expect(hint.textContent).toMatch(/chars left/);
  });

  it("shows over-limit text when exceeded", () => {
    const input = document.getElementById("questionInput");
    const hint  = document.getElementById("hint");
    input.value = "x".repeat(2001);
    input.dispatchEvent(new Event("input"));
    expect(hint.textContent).toMatch(/over limit/);
  });
});
