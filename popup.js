// ── popup.js v1.1 ──────────────────────────────────────────────────
// Features: send to Gemini, selected-text auto-fill, history saving,
//           draft persistence, settings shortcut

const GEMINI_URL  = "https://gemini.google.com/app";
const MAX_CHARS   = 2000;
const MAX_HISTORY = 20;

const input       = document.getElementById("questionInput");
const sendBtn     = document.getElementById("sendBtn");
const openBtn     = document.getElementById("openBtn");
const settingsBtn = document.getElementById("settingsBtn");
const hint        = document.querySelector(".hint");
const selBanner   = document.getElementById("selectionBanner");
const selText     = document.getElementById("selectionText");
const selClear    = document.getElementById("selectionClear");

// ── 1. Selected-text auto-fill ─────────────────────────────────────
async function tryAutoFillSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim() ?? "",
    });

    const selected = results?.[0]?.result;
    if (selected && selected.length > 0 && selected.length <= MAX_CHARS) {
      const draft = sessionStorage.getItem("ask-gemini-draft");
      if (!draft) {
        input.value = selected;
        input.dispatchEvent(new Event("input"));
        input.select();
        const preview = selected.length > 58 ? selected.slice(0, 58) + "…" : selected;
        selText.textContent = `"${preview}"`;
        selBanner.classList.add("visible");
      }
    }
  } catch (_) { /* tab not scriptable — silently ignore */ }
}

selClear.addEventListener("click", () => {
  selBanner.classList.remove("visible");
  input.value = "";
  sessionStorage.removeItem("ask-gemini-draft");
  input.dispatchEvent(new Event("input"));
  input.focus();
});

// ── 2. History helpers ─────────────────────────────────────────────
async function saveToHistory(message) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const deduped = askGeminiHistory.filter(h => h.text !== message);
  deduped.unshift({ text: message, ts: Date.now() });
  await chrome.storage.local.set({ askGeminiHistory: deduped.slice(0, MAX_HISTORY) });
}

// ── 3. Input behaviour ─────────────────────────────────────────────
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";

  const len = input.value.length;
  if (len > MAX_CHARS * 0.8) {
    const rem = MAX_CHARS - len;
    hint.textContent = rem >= 0 ? `${rem} chars left` : `${Math.abs(rem)} over limit`;
    hint.style.color = rem < 0 ? "#f05050" : rem < 200 ? "#f0a04b" : "var(--text-hint)";
  } else {
    hint.textContent = "↵ Enter";
    hint.style.color = "";
  }

  sendBtn.disabled = input.value.trim().length === 0 || len > MAX_CHARS;
  sessionStorage.setItem("ask-gemini-draft", input.value);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askGemini(); }
});

// ── 4. Send ────────────────────────────────────────────────────────
sendBtn.addEventListener("click", () => askGemini());

async function askGemini() {
  const message = input.value.trim();
  if (!message || message.length > MAX_CHARS) return;

  sendBtn.classList.add("sending");
  sendBtn.disabled = true;
  input.disabled   = true;

  try {
    await chrome.storage.local.set({ pendingMessage: message });
    await saveToHistory(message);
    sessionStorage.removeItem("ask-gemini-draft");

    const tabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { url: GEMINI_URL, active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: GEMINI_URL });
    }
  } catch (err) {
    console.error("Ask Gemini error:", err);
    sendBtn.classList.remove("sending");
    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
    return;
  }

  setTimeout(() => window.close(), 120);
}

// ── 5. Direct open ─────────────────────────────────────────────────
openBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: GEMINI_URL });
  window.close();
});

// ── 6. Settings page ───────────────────────────────────────────────
settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ── 7. Init ────────────────────────────────────────────────────────
sendBtn.disabled = true;

const draft = sessionStorage.getItem("ask-gemini-draft");
if (draft) {
  input.value = draft;
  input.dispatchEvent(new Event("input"));
  input.selectionStart = input.selectionEnd = draft.length;
}

input.focus();
tryAutoFillSelection();