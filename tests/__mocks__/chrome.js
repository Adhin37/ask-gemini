import { vi } from "vitest";

// ── Helpers ─────────────────────────────────────────────────────────

function makeListenerSet() {
  const _cbs = [];
  return {
    addListener: vi.fn(fn => _cbs.push(fn)),
    /** Fire all registered listeners synchronously. */
    _fire: (...args) => _cbs.forEach(fn => fn(...args)),
  };
}

function makeStorageArea(store) {
  return {
    get: vi.fn(async (keys) => {
      const list =
        keys == null ? [...store.keys()]
        : typeof keys === "string" ? [keys]
        : Array.isArray(keys) ? keys
        : Object.keys(keys);
      return Object.fromEntries(list.flatMap(k => store.has(k) ? [[k, store.get(k)]] : []));
    }),
    set: vi.fn(async (obj) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
    }),
    remove: vi.fn(async (keys) => {
      const list = typeof keys === "string" ? [keys] : keys;
      list.forEach(k => store.delete(k));
    }),
    /** Direct access for test assertions. */
    _store: store,
  };
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Returns a fresh Chrome API mock for each test.
 * Every method is a vi.fn(); listener sets expose ._fire() to trigger them.
 */
export function createChromeMock() {
  return {
    action: {
      setBadgeBackgroundColor: vi.fn(),
      setBadgeText:            vi.fn(),
      openPopup:               vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      local:     makeStorageArea(new Map()),
      session:   makeStorageArea(new Map()),
      sync:      makeStorageArea(new Map()),
      onChanged: makeListenerSet(),
    },
    runtime: {
      onMessage:       makeListenerSet(),
      onInstalled:     makeListenerSet(),
      onStartup:       makeListenerSet(),
      lastError:       null,
      getURL:          vi.fn(p => `chrome-extension://fake/${p}`),
      getManifest:     vi.fn(() => ({ version: "1.3.1" })),
      sendMessage:     vi.fn(),
      openOptionsPage: vi.fn(),
    },
    contextMenus: {
      removeAll: vi.fn(cb => cb?.()),
      create:    vi.fn((_, cb) => cb?.()),
      onClicked: makeListenerSet(),
    },
    commands: {
      onCommand: makeListenerSet(),
      getAll:    vi.fn().mockResolvedValue([]),
    },
    tabs: {
      create:     vi.fn().mockResolvedValue({ id: 1 }),
      query:      vi.fn().mockResolvedValue([]),
      update:     vi.fn().mockResolvedValue({}),
      remove:     vi.fn(),
      getCurrent: vi.fn(cb => cb({ id: 42 })),
      onUpdated:  makeListenerSet(),
    },
    windows: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      getAll: vi.fn().mockResolvedValue([]),
    },
    scripting: {
      executeScript: vi.fn().mockResolvedValue([{ result: "" }]),
    },
  };
}
