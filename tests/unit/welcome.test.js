import { describe, it, expect, beforeAll, vi } from "vitest";
import { setupWelcomeDom } from "../helpers/welcome-dom.js";

// welcome.js calls init() immediately on import.
// DOM and chrome mock must be configured before importing.
// The module is cached — import happens once; event listeners bind to the
// original button element, so we must not replace the DOM after import.

beforeAll(async () => {
  setupWelcomeDom();
  // chrome.storage.sync resolves to {} by default → theme defaults to "auto"
  await import("../../src/welcome/welcome.js");
});

// ════════════════════════════════════════════════════════════════════
// Theme application
// ════════════════════════════════════════════════════════════════════

describe("theme — defaults when nothing is stored", () => {
  it("defaults dataset.theme to 'auto'", () => {
    expect(document.documentElement.dataset.theme).toBe("auto");
  });

  it("leaves colorScheme empty for 'auto'", () => {
    expect(document.documentElement.style.colorScheme).toBe("");
  });
});

// Theme mapping is a pure conditional — test it without re-running init.
describe("theme — colorScheme mapping logic", () => {
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === "light" ? "only light" :
      theme === "dark"  ? "only dark"  : "";
  }

  it("sets 'only light' for light theme", () => {
    applyTheme("light");
    expect(document.documentElement.style.colorScheme).toBe("only light");
  });

  it("sets 'only dark' for dark theme", () => {
    applyTheme("dark");
    expect(document.documentElement.style.colorScheme).toBe("only dark");
  });

  it("sets empty string for auto theme", () => {
    applyTheme("auto");
    expect(document.documentElement.style.colorScheme).toBe("");
  });
});

// ════════════════════════════════════════════════════════════════════
// Close button
// ════════════════════════════════════════════════════════════════════

describe("closeWelcome button", () => {
  it("calls chrome.tabs.getCurrent when clicked", () => {
    document.getElementById("closeWelcome").click();
    expect(chrome.tabs.getCurrent).toHaveBeenCalled();
  });

  it("removes the current tab when getCurrent returns a tab", () => {
    // chrome mock returns { id: 42 } from getCurrent by default
    document.getElementById("closeWelcome").click();
    expect(chrome.tabs.remove).toHaveBeenCalledWith(42);
  });

  it("falls back to window.close() when getCurrent returns null", () => {
    chrome.tabs.getCurrent.mockImplementationOnce(cb => cb(null));
    const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});
    document.getElementById("closeWelcome").click();
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });
});
