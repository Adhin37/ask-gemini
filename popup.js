// ── popup.js ──────────────────────────────────────────────────
// Features: send to Gemini, selected-text auto-fill, history saving,
//           draft persistence, prompt templates, model switcher, theme
const GEMINI_URL  = "https://gemini.google.com/app";
const MAX_CHARS   = 2000;
const MAX_HISTORY = 20;

const DEFAULT_TEMPLATES = [
  "Summarise: ",
  "Translate to English: ",
  "Fix this code:\n",
  "Explain simply: ",
  "Pros and cons of: ",
];

// ── DOM refs ───────────────────────────────────────────────────────
const input         = document.getElementById("questionInput");
const sendBtn       = document.getElementById("sendBtn");
const openBtn       = document.getElementById("openBtn");
const settingsBtn   = document.getElementById("settingsBtn");
const hint          = document.getElementById("hint");
const selBanner     = document.getElementById("selectionBanner");
const selText       = document.getElementById("selectionText");
const selClear      = document.getElementById("selectionClear");
const modelSwitcher = document.getElementById("modelSwitcher");
const tmplDropdown  = document.getElementById("tmplDropdown");
const tmplList      = document.getElementById("tmplList");
const tmplEmpty     = document.getElementById("tmplEmpty");
const tmplCloseBtn  = document.getElementById("tmplCloseBtn");
const tmplTriggerBtn= document.getElementById("tmplTriggerBtn");
const tmplSettingsLink = document.getElementById("tmplSettingsLink");

// ══════════════════════════════════════════════════════════════════
// 1. THEME
// ══════════════════════════════════════════════════════════════════

let currentTheme = 'auto'; // 'auto' | 'dark' | 'light'

function resolveTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark')  return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(pref) {
  currentTheme = pref || 'auto';
  const resolved = resolveTheme(currentTheme);
  document.body.classList.toggle('light', resolved === 'light');
}

// Respond to OS theme change when in 'auto' mode
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (currentTheme === 'auto') applyTheme('auto');
});

// ══════════════════════════════════════════════════════════════════
// 2. MODEL SWITCHER
// ══════════════════════════════════════════════════════════════════

let currentModel = 'flash'; // 'flash' | 'pro'

function applyModel(model) {
  currentModel = model || 'flash';
  document.querySelectorAll('.model-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.model === currentModel);
  });
}

modelSwitcher.addEventListener('click', async (e) => {
  const btn = e.target.closest('.model-opt');
  if (!btn) return;
  const model = btn.dataset.model;
  if (model === currentModel) return;
  await chrome.storage.local.set({ askGeminiModel: model });
  applyModel(model);
});

// ══════════════════════════════════════════════════════════════════
// 3. PROMPT TEMPLATES
// ══════════════════════════════════════════════════════════════════

let templates = [];

async function loadTemplates() {
  const { askGeminiTemplates } = await chrome.storage.local.get('askGeminiTemplates');
  // First run: seed defaults into storage
  if (!askGeminiTemplates) {
    await chrome.storage.local.set({ askGeminiTemplates: DEFAULT_TEMPLATES });
    templates = DEFAULT_TEMPLATES;
  } else {
    templates = askGeminiTemplates;
  }
  renderTemplateList();
}

function renderTemplateList() {
  tmplList.innerHTML = '';
  if (templates.length === 0) {
    tmplEmpty.classList.add('visible');
    return;
  }
  tmplEmpty.classList.remove('visible');

  templates.forEach(tpl => {
    const el = document.createElement('button');
    el.className = 'tmpl-item';
    const display = tpl.replace(/\n/g, '↵').slice(0, 60);
    el.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="tmpl-item-text">${escapeHtml(display)}</span>
    `;
    el.addEventListener('click', () => insertTemplate(tpl));
    tmplList.appendChild(el);
  });
}

function insertTemplate(tpl) {
  // If input starts with '/', replace the slash with the template
  const val = input.value;
  if (val === '/' || val === '') {
    input.value = tpl;
  } else {
    // Prepend template on its own line, or just replace
    input.value = tpl;
  }
  input.dispatchEvent(new Event('input'));
  // Place cursor at end
  input.selectionStart = input.selectionEnd = input.value.length;
  closeTemplateDropdown();
  input.focus();
}

function openTemplateDropdown() {
  tmplDropdown.classList.add('visible');
  tmplTriggerBtn.classList.add('active');
}

function closeTemplateDropdown() {
  tmplDropdown.classList.remove('visible');
  tmplTriggerBtn.classList.remove('active');
}

function toggleTemplateDropdown() {
  if (tmplDropdown.classList.contains('visible')) {
    closeTemplateDropdown();
  } else {
    openTemplateDropdown();
  }
}

tmplTriggerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTemplateDropdown();
});

tmplCloseBtn.addEventListener('click', () => closeTemplateDropdown());

tmplSettingsLink.addEventListener('click', () => {
  closeTemplateDropdown();
  chrome.runtime.openOptionsPage();
  window.close();
});

// Close on click outside
document.addEventListener('click', (e) => {
  if (!tmplDropdown.contains(e.target) && e.target !== tmplTriggerBtn) {
    closeTemplateDropdown();
  }
});

// ── / trigger ─────────────────────────────────────────────────────
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (tmplDropdown.classList.contains('visible')) {
      e.preventDefault();
      closeTemplateDropdown();
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    if (tmplDropdown.classList.contains('visible')) {
      // Don't send if dropdown is open; close it first
      e.preventDefault();
      closeTemplateDropdown();
      return;
    }
    e.preventDefault();
    askGemini();
  }
});

// ══════════════════════════════════════════════════════════════════
// 4. SELECTED-TEXT AUTO-FILL
// ══════════════════════════════════════════════════════════════════

async function tryAutoFillSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString().trim() ?? '',
    });

    const selected = results?.[0]?.result;
    if (selected && selected.length > 0 && selected.length <= MAX_CHARS) {
      const draft = sessionStorage.getItem('ask-gemini-draft');
      if (!draft) {
        input.value = selected;
        input.dispatchEvent(new Event('input'));
        input.select();
        const preview = selected.length > 58 ? selected.slice(0, 58) + '…' : selected;
        selText.textContent = `"${preview}"`;
        selBanner.classList.add('visible');
      }
    }
  } catch (_) { /* tab not scriptable */ }
}

selClear.addEventListener('click', () => {
  selBanner.classList.remove('visible');
  input.value = '';
  sessionStorage.removeItem('ask-gemini-draft');
  input.dispatchEvent(new Event('input'));
  input.focus();
});

// ══════════════════════════════════════════════════════════════════
// 5. HISTORY
// ══════════════════════════════════════════════════════════════════

async function saveToHistory(message) {
  const { askGeminiHistory = [] } = await chrome.storage.local.get('askGeminiHistory');
  const deduped = askGeminiHistory.filter(h => h.text !== message);
  deduped.unshift({ text: message, ts: Date.now() });
  await chrome.storage.local.set({ askGeminiHistory: deduped.slice(0, MAX_HISTORY) });
}

// ══════════════════════════════════════════════════════════════════
// 6. INPUT BEHAVIOUR
// ══════════════════════════════════════════════════════════════════

input.addEventListener('input', () => {
  // Auto-resize
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';

  // Char counter / hint
  const len = input.value.length;
  if (len > MAX_CHARS * 0.8) {
    const rem = MAX_CHARS - len;
    hint.textContent = rem >= 0 ? `${rem} chars left` : `${Math.abs(rem)} over limit`;
    hint.style.color = rem < 0 ? '#f05050' : rem < 200 ? '#f0a04b' : '';
  } else {
    hint.textContent = '↵ Enter to send';
    hint.style.color = '';
  }

  sendBtn.disabled = input.value.trim().length === 0 || len > MAX_CHARS;
  sessionStorage.setItem('ask-gemini-draft', input.value);

  // / trigger: show templates if '/' is the only char
  if (input.value === '/') {
    openTemplateDropdown();
  }
});

// ══════════════════════════════════════════════════════════════════
// 7. SEND
// ══════════════════════════════════════════════════════════════════

sendBtn.addEventListener('click', () => askGemini());

async function askGemini() {
  const message = input.value.trim();
  if (!message || message.length > MAX_CHARS) return;

  sendBtn.classList.add('sending');
  sendBtn.disabled = true;
  input.disabled   = true;

  try {
    await chrome.storage.local.set({
      pendingMessage: message,
      pendingModel:   currentModel,
    });
    await saveToHistory(message);
    sessionStorage.removeItem('ask-gemini-draft');

    const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { url: GEMINI_URL, active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: GEMINI_URL });
    }
  } catch (err) {
    console.error('Ask Gemini error:', err);
    sendBtn.classList.remove('sending');
    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
    return;
  }

  setTimeout(() => window.close(), 120);
}

// ══════════════════════════════════════════════════════════════════
// 8. FOOTER BUTTONS
// ══════════════════════════════════════════════════════════════════

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: GEMINI_URL });
  window.close();
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// ══════════════════════════════════════════════════════════════════
// 9. HELPERS
// ══════════════════════════════════════════════════════════════════

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════════
// 10. INIT
// ══════════════════════════════════════════════════════════════════

sendBtn.disabled = true;

(async () => {
  // Load all preferences in one call
  const data = await chrome.storage.local.get(['askGeminiTheme', 'askGeminiModel', 'askGeminiTemplates']);

  applyTheme(data.askGeminiTheme || 'auto');
  applyModel(data.askGeminiModel || 'flash');

  // Templates (don't block on storage — loadTemplates handles first-run seeding)
  await loadTemplates();

  // Restore draft
  const draft = sessionStorage.getItem('ask-gemini-draft');
  if (draft) {
    input.value = draft;
    input.dispatchEvent(new Event('input'));
    input.selectionStart = input.selectionEnd = draft.length;
  }

  input.focus();
  tryAutoFillSelection();
})();