import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ── Load content.js once ─────────────────────────────────────────────
// The IIFE at the top of content.js calls chrome.storage.local.get immediately.
// Because get() resolves to {} (no pendingMessage), the IIFE returns early
// without touching the DOM.  The test hook at the bottom of content.js then
// populates globalThis.__TEST__ with the pure functions we want to test.
let classifyModelText;
let matchesTarget;
let waitForElement;
let waitForCondition;

beforeAll(async () => {
  globalThis.__TEST__ = {};
  await import("../../src/content/content.js");
  ({ classifyModelText, matchesTarget, waitForElement, waitForCondition } = globalThis.__TEST__);
});

// ════════════════════════════════════════════════════════════════════
// classifyModelText
// ════════════════════════════════════════════════════════════════════

describe("classifyModelText", () => {
  it.each([
    ["Gemini Flash",          "flash"],
    ["Flash",                 "flash"],
    ["Gemini 2.0 Flash",      "flash"],
    ["Gemini 1.5",            "flash"],
    ["Gemini 2.5",            "flash"],
    ["Default model",         "flash"],
    ["Quick answer",          "flash"],
    ["Fast",                  "flash"],
  ])('"%s" → "flash"', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it.each([
    ["Gemini Pro",            "pro"],
    ["Pro",                   "pro"],
    ["Advanced",              "pro"],
    ["Gemini Advanced",       "pro"],
  ])('"%s" → "pro"', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it.each([
    ["Thinking",              "thinking"],
    ["Gemini Thinking",       "thinking"],
    ["Reasoning model",       "thinking"],
    ["Flash Thinking",        "thinking"],   // "think" takes priority over "flash"
  ])('"%s" → "thinking"', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it('returns null for unrecognised text', () => {
    expect(classifyModelText("Something entirely unknown")).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyModelText("GEMINI FLASH")).toBe("flash");
    expect(classifyModelText("THINKING")).toBe("thinking");
  });
});

// ════════════════════════════════════════════════════════════════════
// matchesTarget
// ════════════════════════════════════════════════════════════════════

describe("matchesTarget", () => {
  describe('target "flash"', () => {
    it("matches Flash label",        () => expect(matchesTarget("Gemini Flash",    "flash")).toBe(true));
    it("matches Fast label",         () => expect(matchesTarget("Fast model",      "flash")).toBe(true));
    it("matches Quick label",        () => expect(matchesTarget("Quick",           "flash")).toBe(true));
    it("rejects Pro label",          () => expect(matchesTarget("Gemini Pro",      "flash")).toBe(false));
    it("rejects Thinking label",     () => expect(matchesTarget("Flash Thinking",  "flash")).toBe(false));
    it("rejects bare Pro + flash",   () => expect(matchesTarget("Flash Pro",       "flash")).toBe(false));
  });

  describe('target "pro"', () => {
    it("matches Pro label",          () => expect(matchesTarget("Gemini Pro",      "pro")).toBe(true));
    it("matches Advanced label",     () => expect(matchesTarget("Advanced",        "pro")).toBe(true));
    it("rejects Flash label",        () => expect(matchesTarget("Gemini Flash",    "pro")).toBe(false));
    it("rejects plain text",         () => expect(matchesTarget("something else",  "pro")).toBe(false));
  });

  describe('target "thinking"', () => {
    it("matches Thinking label",     () => expect(matchesTarget("Thinking",        "thinking")).toBe(true));
    it("matches Reasoning label",    () => expect(matchesTarget("Reasoning",       "thinking")).toBe(true));
    it("rejects Flash",              () => expect(matchesTarget("Gemini Flash",    "thinking")).toBe(false));
    it("rejects Pro",                () => expect(matchesTarget("Gemini Pro",      "thinking")).toBe(false));
  });

  it("returns false for unknown target", () => {
    expect(matchesTarget("Flash", "unknown")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// waitForElement
// ════════════════════════════════════════════════════════════════════

describe("waitForElement", () => {
  beforeEach(() => {
    // Start each DOM test with a clean body
    document.body.innerHTML = "";
  });

  it("resolves immediately when getter already returns an element", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const result = await waitForElement(() => el, 500);
    expect(result).toBe(el);
  });

  it("resolves the element when it is added to the DOM after a delay", async () => {
    let el = null;
    setTimeout(() => {
      el = document.createElement("span");
      el.id = "late";
      document.body.appendChild(el);
    }, 10);

    const result = await waitForElement(() => document.getElementById("late"), 500);
    expect(result).toBe(el);
  });

  it("resolves null when the timeout expires and getter never returns truthy", async () => {
    vi.useFakeTimers();

    const promise = waitForElement(() => null, 100);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result).toBeNull();
    vi.useRealTimers();
  });
});

// ════════════════════════════════════════════════════════════════════
// waitForCondition
// ════════════════════════════════════════════════════════════════════

describe("waitForCondition", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves true immediately when predicate is already met", async () => {
    const result = await waitForCondition(() => true, 500);
    expect(result).toBe(true);
  });

  it("resolves true when a DOM mutation makes the predicate pass", async () => {
    let flag = false;
    setTimeout(() => {
      flag = true;
      document.body.appendChild(document.createElement("div"));
    }, 10);

    const result = await waitForCondition(() => flag, 500);
    expect(result).toBe(true);
  });

  it("resolves false when the timeout expires", async () => {
    vi.useFakeTimers();

    const promise = waitForCondition(() => false, 100);
    vi.advanceTimersByTime(100);
    const result = await promise;

    expect(result).toBe(false);
    vi.useRealTimers();
  });
});

// ════════════════════════════════════════════════════════════════════
// IIFE guard
// ════════════════════════════════════════════════════════════════════

describe("content script IIFE", () => {
  it("does not remove storage keys when pendingMessage is absent", async () => {
    // content.js was already imported in beforeAll with an empty store.
    // storage.remove should never have been called.
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});
