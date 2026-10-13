import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

// ── Load content.js once ─────────────────────────────────────────────
// The IIFE at the top of content.js calls chrome.storage.local.get immediately.
// Because get() resolves to {} (no pendingMessage), the IIFE returns early
// without touching the DOM.  The test hook at the bottom of content.js then
// populates globalThis.__TEST__ with the pure functions we want to test.
let findLevelRows;
let findLevelRow;
let ensureThinkingLevel;
let waitForElement;
let waitForCondition;
let revealFileInput;
let uploadErrorMessage;

beforeAll(async () => {
  globalThis.__TEST__ = {};
  await import("../../src/content/content.js");
  ({
    findLevelRows, findLevelRow, ensureThinkingLevel,
    waitForElement, waitForCondition, revealFileInput, uploadErrorMessage,
  } = globalThis.__TEST__);
});

// ════════════════════════════════════════════════════════════════════
// Mode picker — thinking level
// Markup mirrors the real Gemini picker, verified October 2026: model rows
// carrying data-mode-id (Auto, then upsell rows), then a "Thinking level" row
// whose submenu (aria-controls) holds Low / Medium / High. An earlier layout
// listed the level rows right after "Auto"; it stays supported. Signed out,
// the picker still lists models only (plus a sign-in row).
// ════════════════════════════════════════════════════════════════════

/**
 * Builds a <gem-menu-item> row.
 * @param {string} label
 * @param {{ modeId?: string, testId?: string, selected?: boolean, disabled?: boolean }} [opts]
 */
function row(label, { modeId, testId, selected = false, disabled = false } = {}) {
  const el = document.createElement("gem-menu-item");
  el.setAttribute("role", "menuitem");
  if (modeId !== undefined) el.setAttribute("data-mode-id", modeId);
  if (testId) el.dataset.testId = testId;
  if (selected) el.classList.add("selected");
  el.setAttribute("aria-disabled", String(disabled));
  const lbl = document.createElement("span");
  lbl.className = "label";
  lbl.textContent = ` ${label} `;
  el.append(lbl);
  return el;
}

/** Low / Medium / High rows with `selectedLevel` checked. */
function levelRows(selectedLevel, disabled) {
  return ["Low", "Medium", "High"].map((l) => row(l, { selected: l === selectedLevel, disabled: disabled.includes(l) }));
}

/**
 * Returns the nodes of the current Gemini picker: model rows, the "Thinking
 * level" row, and its (hidden) submenu with `selectedLevel` checked.
 */
function autoPickerRows(selectedLevel = "Low", { disabled = [] } = {}) {
  const parent = row("Thinking level");
  parent.setAttribute("value", "thinking_level");
  parent.setAttribute("aria-haspopup", "true");
  parent.setAttribute("aria-expanded", "false");
  parent.setAttribute("aria-controls", "test-level-submenu");
  const submenu = document.createElement("gem-menu");
  submenu.id = "test-level-submenu";
  submenu.setAttribute("role", "menu");
  submenu.dataset.visible = "false";
  submenu.append(...levelRows(selectedLevel, disabled));
  parent.addEventListener("click", () => {
    parent.setAttribute("aria-expanded", "true");
    submenu.dataset.visible = "true";
  });
  return [
    row("Auto", { modeId: "cf41b0e0dd7d53e5", testId: "bard-mode-option-cf41b0e0dd7d53e5", selected: true }),
    row("3.1 Pro", { modeId: "upsell_MODE_CATEGORY_PRO", testId: "bard-mode-option-upsell_MODE_CATEGORY_PRO" }),
    parent,
    submenu,
  ];
}

/** Returns the rows of the earlier flat layout (levels right after "Auto"). */
function flatPickerRows(selectedLevel = "Low", { disabled = [] } = {}) {
  return [
    row("Auto", { modeId: "cf41b0e0dd7d53e5", testId: "bard-mode-option-cf41b0e0dd7d53e5", selected: true }),
    ...levelRows(selectedLevel, disabled),
  ];
}

/** Returns the rows of the signed-out picker (models only). */
function signedOutRows() {
  return [
    row("3.5 Flash-Lite", { modeId: "cf41b0e0dd7d53e5", testId: "bard-mode-option-cf41b0e0dd7d53e5", selected: true }),
    row("3.6 Flash", { modeId: "", testId: "bard-mode-option-", disabled: true }),
    row("3.1 Pro", { modeId: "", testId: "bard-mode-option-", disabled: true }),
    row("Sign in for all models", { testId: "mode-picker-sign-in-button" }),
  ];
}

/** Mounts `nodes` in a picker menu and returns its rows, as findMenuRows() would. */
function mountRows(nodes) {
  const menu = document.createElement("gem-menu");
  menu.dataset.testId = "gem-mode-menu";
  menu.append(...nodes);
  document.body.replaceChildren(menu);
  return [...menu.querySelectorAll("gem-menu-item")];
}

describe("findLevelRows", () => {
  afterEach(() => document.body.replaceChildren());

  it("returns the Low / Medium / High rows of the Thinking level submenu", () => {
    const levels = findLevelRows(mountRows(autoPickerRows()));
    expect(levels.map((r) => r.textContent.trim())).toEqual(["Low", "Medium", "High"]);
  });

  it("returns the level rows of the flat layout and skips the Auto row", () => {
    const levels = findLevelRows(mountRows(flatPickerRows()));
    expect(levels.map((r) => r.textContent.trim())).toEqual(["Low", "Medium", "High"]);
  });

  it("returns nothing for the signed-out models-only picker", () => {
    expect(findLevelRows(mountRows(signedOutRows()))).toEqual([]);
  });
});

describe("findLevelRow", () => {
  it("matches by position, so localised labels work", () => {
    const levels = ["Niedrig", "Mittel", "Hoch"].map((l) => row(l));
    expect(findLevelRow(levels, "low").textContent.trim()).toBe("Niedrig");
    expect(findLevelRow(levels, "medium").textContent.trim()).toBe("Mittel");
    expect(findLevelRow(levels, "high").textContent.trim()).toBe("Hoch");
  });

  it("falls back to the English label when the row count is unexpected", () => {
    const levels = [row("Medium"), row("High")];
    expect(findLevelRow(levels, "high").textContent.trim()).toBe("High");
    expect(findLevelRow(levels, "low")).toBeNull();
  });
});

describe("ensureThinkingLevel", () => {
  let trigger;

  /**
   * Mounts a trigger whose click opens a picker built by `makeRows`, and a
   * row click / Escape on the menu that closes it.
   */
  function mountPicker(makeRows) {
    document.body.replaceChildren();
    trigger = document.createElement("button");
    trigger.dataset.testId = "bard-mode-menu-button";
    trigger.addEventListener("click", () => {
      const menu = document.createElement("gem-menu");
      menu.dataset.testId = "gem-mode-menu";
      menu.setAttribute("role", "menu");
      menu.append(...makeRows());
      menu.addEventListener("click", (e) => {
        const item = e.target.closest("gem-menu-item");
        // The "Thinking level" row only expands its submenu.
        if (item && item.getAttribute("aria-haspopup") !== "true") menu.remove();
      });
      menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") menu.remove();
      });
      document.body.append(menu);
    });
    document.body.append(trigger);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no layout, so scrollIntoView is missing.
    Element.prototype.scrollIntoView ??= () => {};
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  /** Runs ensureThinkingLevel to completion under fake timers. */
  async function run(level) {
    const p = ensureThinkingLevel(level);
    await vi.runAllTimersAsync();
    return p;
  }

  it("expands the Thinking level submenu before clicking the row", async () => {
    const events = [];
    mountPicker(() => {
      const nodes = autoPickerRows("Low");
      const rows = nodes.flatMap((n) => n.matches("gem-menu-item") ? [n] : [...n.querySelectorAll("gem-menu-item")]);
      rows.forEach((r) => r.addEventListener("click", () => events.push(r.textContent.trim())));
      return nodes;
    });
    expect(await run("medium")).toBe("switched");
    expect(events).toEqual(["Thinking level", "Medium"]);
    expect(document.querySelector("gem-menu")).toBeNull();
  });

  it("switches on the flat layout without a submenu", async () => {
    const clicked = [];
    mountPicker(() => {
      const rows = flatPickerRows("Low");
      rows.forEach((r) => r.addEventListener("click", () => clicked.push(r.textContent.trim())));
      return rows;
    });
    expect(await run("high")).toBe("switched");
    expect(clicked).toEqual(["High"]);
    expect(document.querySelector("gem-menu")).toBeNull();
  });

  it("leaves an already-selected level alone and closes the picker", async () => {
    mountPicker(() => autoPickerRows("Medium"));
    expect(await run("medium")).toBe("already");
    expect(document.querySelector("gem-menu")).toBeNull();
  });

  it("reports a locked level without clicking it", async () => {
    mountPicker(() => autoPickerRows("Low", { disabled: ["High"] }));
    expect(await run("high")).toBe("disabled");
    expect(document.querySelector("gem-menu")).toBeNull();
  });

  it("reports the signed-out picker as unsupported", async () => {
    mountPicker(signedOutRows);
    expect(await run("low")).toBe("unsupported");
    expect(document.querySelector("gem-menu")).toBeNull();
  });

  it("returns not-found when there is no picker trigger", async () => {
    document.body.replaceChildren();
    expect(await run("low")).toBe("not-found");
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

// ════════════════════════════════════════════════════════════════════
// revealFileInput / uploadErrorMessage
// Gemini (October 2026) only mounts its file inputs inside the "Upload & tools"
// menu overlay; signed out, the "Upload files" item is aria-disabled.
// ════════════════════════════════════════════════════════════════════

/**
 * Builds a composer whose "Upload & tools" trigger mounts the menu on click.
 * @param {{ disabled: boolean }} opts
 * @returns {HTMLButtonElement}
 */
function buildUploadMenu({ disabled }) {
  document.body.innerHTML = `
    <div class="leading-actions-wrapper"><simplified-input-menu>
      <button aria-haspopup="menu" aria-expanded="false" aria-label="Upload & tools"></button>
    </simplified-input-menu></div>
    <div class="cdk-overlay-container"></div>`;
  const trigger = document.querySelector("button");
  trigger.addEventListener("click", () => {
    trigger.setAttribute("aria-expanded", "true");
    const overlay = document.querySelector(".cdk-overlay-container");
    overlay.innerHTML = `
      <button data-test-id="local-images-files-uploader-button" ${disabled ? 'aria-disabled="true"' : ""}></button>
      <input type="file" accept="image/*" multiple>`;
  });
  return trigger;
}

describe("revealFileInput", () => {
  it("returns an input already in the DOM without opening the menu", async () => {
    const trigger = buildUploadMenu({ disabled: false });
    document.body.insertAdjacentHTML("beforeend", '<input type="file" accept="image/*">');
    const click = vi.spyOn(trigger, "click");
    const res = await revealFileInput();
    expect(res.input).not.toBeNull();
    expect(res.openedMenu).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it("opens the Upload & tools menu to mount the image input", async () => {
    buildUploadMenu({ disabled: false });
    const res = await revealFileInput();
    expect(res).toMatchObject({ openedMenu: true, signinRequired: false });
    expect(res.input?.accept).toBe("image/*");
  });

  it("reports signinRequired when the upload item is disabled", async () => {
    buildUploadMenu({ disabled: true });
    const res = await revealFileInput();
    expect(res).toMatchObject({ input: null, openedMenu: true, signinRequired: true });
  });

  it("returns no input when there is no menu trigger", async () => {
    document.body.innerHTML = "<div></div>";
    const res = await revealFileInput();
    expect(res).toEqual({ input: null, openedMenu: false, signinRequired: false });
  });
});

describe("uploadErrorMessage", () => {
  it("uses the sign-in message for signin-required", () => {
    expect(uploadErrorMessage({ reason: "signin-required" })).toMatch(/^Sign in to Gemini/);
  });

  it("uses the generic message otherwise", () => {
    expect(uploadErrorMessage({})).toMatch(/^Image upload failed/);
  });
});

describe("content script IIFE", () => {
  it("does not remove storage keys when pendingMessage is absent", async () => {
    // content.js was already imported in beforeAll with an empty store.
    // storage.remove should never have been called.
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});
