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
