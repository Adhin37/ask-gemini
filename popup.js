// ── popup.js ───────────────────────────────────────────────────────
// Handles popup interactions: send question to Gemini, open directly

const GEMINI_URL = "https://gemini.google.com/app";
const MAX_CHARS   = 2000;

const input   = document.getElementById("questionInput");
const sendBtn = document.getElementById("sendBtn");
const openBtn = document.getElementById("openBtn");
const hint    = document.querySelector(".hint");

// ── Auto-resize textarea ───────────────────────────────────────────
input.addEventListener("input", () => {
  // Resize textarea to content
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";

  // Update hint / char count
  const len = input.value.length;
  if (len > MAX_CHARS * 0.8) {
    const remaining = MAX_CHARS - len;
    hint.textContent = remaining >= 0
      ? `${remaining} chars left`
      : `${Math.abs(remaining)} over limit`;
    hint.style.color = remaining < 0 ? "#f05050" : remaining < 200 ? "#f0a04b" : "var(--text-hint)";
  } else {
    hint.textContent = "↵ Enter to send";
    hint.style.color = "";
  }

  // Enable/disable send button
  sendBtn.disabled = input.value.trim().length === 0 || len > MAX_CHARS;
});

// ── Keyboard: Enter sends, Shift+Enter = newline ───────────────────
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askGemini();
  }
});

// ── Send button click ──────────────────────────────────────────────
sendBtn.addEventListener("click", () => askGemini());

// ── Open directly ──────────────────────────────────────────────────
openBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: GEMINI_URL });
  window.close();
});

// ── Core: store message → open Gemini ─────────────────────────────
async function askGemini() {
  const message = input.value.trim();
  if (!message || message.length > MAX_CHARS) return;

  // Visual feedback
  sendBtn.classList.add("sending");
  sendBtn.disabled = true;
  input.disabled   = true;

  try {
    // Store message; content script on gemini.google.com will pick it up
    await chrome.storage.local.set({ pendingMessage: message });

    // Check if a Gemini tab is already open; if so, reload it; otherwise open new
    const tabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });

    if (tabs.length > 0) {
      // Navigate existing tab to fresh Gemini page so content script fires again
      await chrome.tabs.update(tabs[0].id, { url: GEMINI_URL, active: true });
      // Bring the window into focus
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: GEMINI_URL });
    }
  } catch (err) {
    console.error("Ask Gemini error:", err);
    // Reset UI on error
    sendBtn.classList.remove("sending");
    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
    return;
  }

  // Close popup after a tiny delay for feedback
  setTimeout(() => window.close(), 120);
}

// ── Init: focus input, disable send if empty ──────────────────────
input.focus();
sendBtn.disabled = true;

// Restore any previously typed (but not sent) text from session storage
const draft = sessionStorage.getItem("ask-gemini-draft");
if (draft) {
  input.value = draft;
  input.dispatchEvent(new Event("input")); // trigger resize + btn state
  input.selectionStart = input.selectionEnd = draft.length;
}

// Save draft as user types
input.addEventListener("input", () => {
  sessionStorage.setItem("ask-gemini-draft", input.value);
});

// Clear draft once sent
async function clearDraft() { sessionStorage.removeItem("ask-gemini-draft"); }
sendBtn.addEventListener("click", clearDraft, { once: true });
