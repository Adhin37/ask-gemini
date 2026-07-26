import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ── Load content.js once ─────────────────────────────────────────────
// The IIFE at the top of content.js calls chrome.storage.local.get immediately.
// Because get() resolves to {} (no pendingMessage), the IIFE returns early
// without touching the DOM.  The test hook at the bottom of content.js then
// populates globalThis.__TEST__ with the pure functions we want to test.
let classifyModelText;
let matchesTarget;
let classifyOption;
let isThinkingText;
let waitForElement;
let waitForCondition;

beforeAll(async () => {
  globalThis.__TEST__ = {};
  await import("../../src/content/content.js");
  ({ classifyModelText, matchesTarget, classifyOption, isThinkingText, waitForElement, waitForCondition } = globalThis.__TEST__);
});

// ════════════════════════════════════════════════════════════════════
// classifyModelText
// Labels verified against the real Gemini picker, July 2026: "3.5 Flash-Lite",
// "3.6 Flash", "3.1 Pro". There is no "thinking" model id any more — Extended
// thinking is a separate, mutually exclusive picker row (see isThinkingText).
// ════════════════════════════════════════════════════════════════════

describe("classifyModelText", () => {
  it.each([
    ["Gemini Flash",          "flash"],
    ["Flash",                 "flash"],
    ["3.6 Flash",             "flash"],
    ["Quick answer",          "flash"],
    ["Fast",                  "flash"],
  ])('"%s" → "flash"', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it.each([
    ["3.5 Flash-Lite",        "flash-lite"],
    ["Flash Lite",            "flash-lite"],   // legacy label, no hyphen
    ["Flash-Lite",            "flash-lite"],
  ])('"%s" → "flash-lite"', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it.each([
    ["Gemini Pro",            "pro"],
    ["Pro",                   "pro"],
    ["3.1 Pro",               "pro"],
    ["Advanced",              "pro"],
    ["Gemini Advanced",       "pro"],
  ])('"%s" → "pro"', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it.each([
    ["Something entirely unknown",                          null],
    // Dropped version-number heuristics — no longer sufficient on their own.
    ["Gemini 1.5",                                           null],
    ["Gemini 2.5",                                           null],
    ["Default model",                                        null],
    // The "Extended thinking" row must never resolve to a model, even though
    // its sublabel "Complex problem solving" contains the substring "pro"
    // (inside "problem") — this was a real bug caught while building this out.
    ["Extended thinking\nComplex problem solving",           null],
    // The signed-out "Sign in" row mentions "Flash" in its sublabel and must
    // not be misclassified as the Flash model — another real bug caught here.
    ["Sign in for all models\nTry the latest Flash",         null],
  ])('"%s" → null', (input, expected) => {
    expect(classifyModelText(input)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(classifyModelText("GEMINI FLASH")).toBe("flash");
    expect(classifyModelText("3.5 FLASH-LITE")).toBe("flash-lite");
  });
});

// ════════════════════════════════════════════════════════════════════
// isThinkingText
// ════════════════════════════════════════════════════════════════════

describe("isThinkingText", () => {
  it.each([
    "Extended thinking",
    "extend",
    "deep",
    "think",
    "reasoning",
  ])('"%s" is thinking text', (input) => {
    expect(isThinkingText(input)).toBe(true);
  });

  it.each([
    "Complex problem solving",   // no "think"/"extend"/"deep"/"reason" alone
    "3.6 Flash",
    "3.1 Pro",
    "",
  ])('"%s" is not thinking text', (input) => {
    expect(isThinkingText(input)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// matchesTarget
// ════════════════════════════════════════════════════════════════════

describe("matchesTarget", () => {
  describe('target "flash"', () => {
    it("matches Flash label",        () => expect(matchesTarget("3.6 Flash",      "flash")).toBe(true));
    it("matches Fast label",         () => expect(matchesTarget("Fast model",      "flash")).toBe(true));
    it("matches Quick label",        () => expect(matchesTarget("Quick",           "flash")).toBe(true));
    it("rejects Pro label",          () => expect(matchesTarget("3.1 Pro",         "flash")).toBe(false));
    it("rejects Flash-Lite label",   () => expect(matchesTarget("3.5 Flash-Lite",  "flash")).toBe(false));
    it("rejects Extended thinking",  () => expect(matchesTarget("Extended thinking\nComplex problem solving", "flash")).toBe(false));
  });

  describe('target "flash-lite"', () => {
    it("matches Flash-Lite label",   () => expect(matchesTarget("3.5 Flash-Lite",  "flash-lite")).toBe(true));
    it("rejects Flash label",        () => expect(matchesTarget("3.6 Flash",       "flash-lite")).toBe(false));
  });

  describe('target "pro"', () => {
    it("matches Pro label",          () => expect(matchesTarget("3.1 Pro",         "pro")).toBe(true));
    it("matches Advanced label",     () => expect(matchesTarget("Advanced",        "pro")).toBe(true));
    it("rejects Flash label",        () => expect(matchesTarget("3.6 Flash",       "pro")).toBe(false));
    it("rejects plain text",         () => expect(matchesTarget("something else",  "pro")).toBe(false));
    it("rejects Extended thinking",  () => expect(matchesTarget("Extended thinking\nComplex problem solving", "pro")).toBe(false));
  });

  it("returns false for unknown target", () => {
    expect(matchesTarget("Flash", "unknown")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// classifyOption
// ════════════════════════════════════════════════════════════════════

/** Builds a bare element with the given textContent and optional dataset. */
function optionEl(text, dataset = {}) {
  const el = document.createElement("button");
  el.textContent = text;
  Object.assign(el.dataset, dataset);
  return el;
}

describe("classifyOption", () => {
  it("classifies via text before consulting index", () => {
    const el = optionEl("3.6 Flash\nAll-around help");
    expect(classifyOption(el, 1)).toBe("flash");
  });

  it("falls back to index when text is unclassifiable", () => {
    const el = optionEl("");
    expect(classifyOption(el, 0)).toBe("flash-lite");
    expect(classifyOption(el, 1)).toBe("flash");
    expect(classifyOption(el, 2)).toBe("pro");
  });

  it("never classifies the signed-out sign-in row as a model, regardless of index", () => {
    const el = optionEl(
      "Sign in for all models\nTry the latest Flash",
      { testId: "mode-picker-sign-in-button" }
    );
    expect(classifyOption(el, 3)).toBeNull();
    expect(classifyOption(el, 1)).toBeNull(); // structural guard wins even at a model's index
  });

  it("never classifies the Extended thinking row as a model, even at a model index", () => {
    const el = optionEl("Extended thinking\nComplex problem solving");
    expect(classifyOption(el, -1)).toBeNull();
    expect(classifyOption(el, 2)).toBeNull(); // text guard beats the index-2="pro" fallback
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
