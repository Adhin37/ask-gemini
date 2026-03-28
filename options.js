// ── options.js ─────────────────────────────────────────────────────
// Settings page: history management, section navigation

const GEMINI_URL = "https://gemini.google.com/app";

// ── Section navigation ─────────────────────────────────────────────
document.querySelectorAll(".nav-item").forEach(link => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const target = link.dataset.section;

    document.querySelectorAll(".nav-item").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));

    link.classList.add("active");
    document.getElementById(`section-${target}`)?.classList.add("active");
  });
});

// ── Version display ────────────────────────────────────────────────
const manifest = chrome.runtime.getManifest();
const ver = `v${manifest.version}`;
document.getElementById("extVersion").textContent  = ver;
document.getElementById("aboutVersion").textContent = `Version ${manifest.version}`;

// ── Shortcut page link ─────────────────────────────────────────────
document.getElementById("shortcutPageLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// ── History ────────────────────────────────────────────────────────
const historyList  = document.getElementById("historyList");
const emptyState   = document.getElementById("emptyState");
const searchInput  = document.getElementById("historySearch");
const clearBtn     = document.getElementById("clearHistoryBtn");
const overlay      = document.getElementById("confirmOverlay");
const confirmOk    = document.getElementById("confirmOk");
const confirmCancel= document.getElementById("confirmCancel");

let allHistory = [];  // cache for filtering

// ── Load & render ──────────────────────────────────────────────────
async function loadHistory() {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  allHistory = askGeminiHistory;
  renderHistory(allHistory, searchInput.value.trim());
}

function renderHistory(items, query = "") {
  historyList.innerHTML = "";
  const filtered = query
    ? items.filter(h => h.text.toLowerCase().includes(query.toLowerCase()))
    : items;

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    emptyState.querySelector("p").textContent  = query ? "No matches." : "No history yet.";
    emptyState.querySelector("span").textContent = query
      ? `No prompts containing "${query}".`
      : "Questions you send to Gemini will appear here.";
    return;
  }

  emptyState.style.display = "none";

  filtered.forEach((item, idx) => {
    const el = document.createElement("div");
    el.className = "history-item";
    el.style.animationDelay = `${idx * 18}ms`;

    const displayText = query
      ? highlightMatch(item.text, query)
      : escapeHtml(item.text);

    el.innerHTML = `
      <span class="history-idx">${idx + 1}</span>
      <div class="history-body">
        <div class="history-text">${displayText}</div>
        <div class="history-time">${formatTime(item.ts)}</div>
      </div>
      <div class="history-actions">
        <button class="hist-btn" title="Send to Gemini" data-action="send" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="hist-btn" title="Copy" data-action="copy" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
        <button class="hist-btn danger" title="Delete" data-action="delete" data-text="${escAttr(item.text)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;

    // Click row = send
    el.addEventListener("click", (e) => {
      if (e.target.closest(".hist-btn")) return; // handled below
      sendPrompt(item.text);
    });

    // Action buttons
    el.querySelectorAll(".hist-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const text = btn.dataset.text;
        const action = btn.dataset.action;

        if (action === "send")   sendPrompt(text);
        if (action === "copy")   await copyToClipboard(text, btn);
        if (action === "delete") await deleteItem(text);
      });
    });

    historyList.appendChild(el);
  });
}

// ── Send a prompt ──────────────────────────────────────────────────
async function sendPrompt(text) {
  await chrome.storage.local.set({ pendingMessage: text });
  const tabs = await chrome.tabs.query({ url: "https://gemini.google.com/*" });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { url: GEMINI_URL, active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: GEMINI_URL });
  }
}

// ── Copy ───────────────────────────────────────────────────────────
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#7c6af7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    setTimeout(() => { btn.innerHTML = orig; }, 1200);
    showToast("Copied to clipboard");
  } catch (_) { showToast("Copy failed"); }
}

// ── Delete single ──────────────────────────────────────────────────
async function deleteItem(text) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get("askGeminiHistory");
  const updated = askGeminiHistory.filter(h => h.text !== text);
  await chrome.storage.local.set({ askGeminiHistory: updated });
  allHistory = updated;
  renderHistory(allHistory, searchInput.value.trim());
  showToast("Entry removed");
}

// ── Clear all (with confirm) ───────────────────────────────────────
clearBtn.addEventListener("click", () => {
  if (allHistory.length === 0) return;
  overlay.classList.add("visible");
});

confirmCancel.addEventListener("click", () => overlay.classList.remove("visible"));
overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("visible"); });

confirmOk.addEventListener("click", async () => {
  await chrome.storage.local.set({ askGeminiHistory: [] });
  allHistory = [];
  renderHistory([]);
  overlay.classList.remove("visible");
  showToast("History cleared");
});

// ── Search / filter ────────────────────────────────────────────────
searchInput.addEventListener("input", () => {
  renderHistory(allHistory, searchInput.value.trim());
});

// ── Helpers ────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function escAttr(s) {
  return s.replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`, "gi");
  return escaped.replace(re, "<mark>$1</mark>");
}
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000)    return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff/60_000)}m ago`;
  if (diff < 86_400_000)return `${Math.floor(diff/3_600_000)}h ago`;
  if (diff < 604_800_000)return `${Math.floor(diff/86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

// ── Toast ──────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

// ── Init ───────────────────────────────────────────────────────────
loadHistory();

// Live-reload if history changes in another tab/popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.askGeminiHistory) {
    allHistory = changes.askGeminiHistory.newValue ?? [];
    renderHistory(allHistory, searchInput.value.trim());
  }
});
