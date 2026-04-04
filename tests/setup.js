import { vi, beforeEach, afterEach } from "vitest";
import { createChromeMock } from "./__mocks__/chrome.js";

// ── jsdom shims ──────────────────────────────────────────────────────
// jsdom doesn't implement matchMedia; popup.js registers a change listener on it.
vi.stubGlobal("matchMedia", vi.fn().mockImplementation(query => ({
  matches:             false,
  media:               query,
  addEventListener:    vi.fn(),
  removeEventListener: vi.fn(),
})));

// popup.js calls window.close() after a successful send.
vi.stubGlobal("close", vi.fn());

// ── Service Worker shims ─────────────────────────────────────────────
// background.js uses importScripts() — stub it so the module loads in jsdom.
vi.stubGlobal("importScripts", vi.fn());

// ── Shared constants (normally loaded via <script> or importScripts) ─
// These globals are declared in src/shared/constants.js and are consumed
// by background.js, popup.js, and options.js at module load time.
vi.stubGlobal("GEMINI_URL", "https://gemini.google.com/app");
vi.stubGlobal("MAX_HISTORY", 20);
vi.stubGlobal("DEFAULT_SUMMARIZE_PREFIX", "Summarize the following:\n\n");
vi.stubGlobal("DEFAULT_TEMPLATES_BY_MODEL", {
  flash:    ["Summarize: ", "Translate to English: ", "Explain simply: ", "Pros and cons of: "],
  thinking: ["Think through this step-by-step: ", "What are the edge cases for: ", "Analyze deeply: "],
  pro:      ["Deep analysis of: ", "Fix this code:\n", "Compare and contrast: ", "Write a comprehensive report on: "],
});
vi.stubGlobal("DEFAULT_PROMPT_ENG_RULES", [
  { id: "code",     label: "Code",            hint: "Selection looks like code",          enabled: true, template: "Analyze this code:\n\n{selection}" },
  { id: "error",    label: "Error / Bug",     hint: "Selection contains an error message", enabled: true, template: "Debug this:\n\n{selection}" },
  { id: "url",      label: "URL",             hint: "The entire selection is a URL",       enabled: true, template: "Summarize this URL:\n\n{selection}" },
  { id: "question", label: "Question",        hint: "Selection ends with a question mark", enabled: true, template: "Answer this question:\n\n{selection}" },
  { id: "data",     label: "Data / Numbers",  hint: "Selection is mostly numbers",         enabled: true, template: "Analyze this data:\n\n{selection}" },
  { id: "term",     label: "Term / Keyword",  hint: "Short selection of 4 words or fewer", enabled: true, template: "Explain \"{selection}\"" },
  { id: "article",  label: "Article / Text",  hint: "Default for longer text selections",  enabled: true, template: "Summarize this text:\n\n{selection}" },
  { id: "default",  label: "Default (fallback)", hint: "Applied when no other rule matches", enabled: true, template: "{selection}" },
]);
vi.stubGlobal("INJECTION_PATTERNS", [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i,
  /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|everything)/i,
  /override\s+(your\s+)?(instructions?|safety|guidelines?|system)/i,
  /new\s+(system\s+)?instructions?\s*:/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+/i,
  /pretend\s+(to\s+be|you\s+(are|were))\s+/i,
  /\[INST\]/,
  /<<SYS>>/,
  /<\s*system\s*>/i,
  /###\s*System\s*:/i,
  /\bDAN\b.*\bmode\b/i,
  /\bjailbreak\b/i,
]);

// ── Chrome global (initial, consumed by beforeAll hooks in test files) ─
vi.stubGlobal("chrome", createChromeMock());

// ── Per-test lifecycle ───────────────────────────────────────────────
beforeEach(() => {
  // Fresh chrome mock for every test so call-history never bleeds across.
  vi.stubGlobal("chrome", createChromeMock());
});

afterEach(() => {
  vi.clearAllMocks();
});
