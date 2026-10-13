# Ask Gemini — Chrome Extension

![License](https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square)
![Version](https://img.shields.io/badge/version-1.9.5-informational?style=flat-square)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-1.3.1-yellow?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ask-gemini/fjjilejcmcominckkkfboobnaplbkdfd?authuser=0&hl=en-GB)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support_me-FF5E5B?style=flat-square&logo=kofi&logoColor=white)](https://ko-fi.com/adhin/tip)

Instantly send questions to Google Gemini right from your browser toolbar, a keyboard shortcut or the right-click menu — with a thinking-level choice, image attachments and reusable prompt templates.

![Promo banner](src/assets/ask-gemini-marquee-1400x560.png)

---

## Features

| Action | What happens |
|---|---|
| **Left-click** the extension icon (or **Ctrl+Shift+L** / **Cmd+Shift+L**) | Opens the popup — type your question, press **Enter** or click **Ask** |
| **Right-click** the extension icon or a page | Context menu → *Open Gemini* (goes directly, no popup) |
| **Right-click selected text** on any page | *Ask Gemini: "…"* — opens Gemini pre-filled with your selection |
| **Thinking level** in the popup | Choose Low, Medium or High thinking (Gemini Auto picks the model). Where Gemini's picker has no level rows (currently, when signed out), the level is skipped and Gemini's default is used |
| **Attach images** (button or drag & drop) | Images are uploaded to Gemini together with your question |
| **Templates** | Insert reusable prompts per thinking level; manage them in Settings |
| **Settings page** | Prompt history, templates, appearance, context-menu behaviour, Prompt Engineering rules (variables like `{{selection}}`, `{{url}}`, `{{domain}}`, `{{title}}`, `{{lang}}`, `{{length}}`) and keyboard shortcut |
| **Ko-fi button** | Support the developer at ko-fi.com/adhin/tip |

The interface is available in English, German, Spanish, French and Simplified Chinese.

---

## Installation (Developer Mode)

1. Clone or download this repository.
2. Install dependencies and build the runtime bundles (Node 22+ recommended, CI uses Node 24):
   ```bash
   npm install
   npm run build
   ```
3. Open Chrome and go to `chrome://extensions/`.
4. Enable **Developer mode** (toggle top-right).
5. Click **Load unpacked** and select this folder.
6. Pin the extension icon in your toolbar for easy access.

---

## How the message injection works

1. Your question (and any attached images) is saved to `chrome.storage.local` along with your selected thinking level.
2. Gemini opens (or an existing tab refreshes to a fresh session).
3. The content script (`content.js`) runs on `gemini.google.com`, reads the stored message and thinking level, selects that level (Low / Medium / High) in Gemini's mode picker (the model itself stays on Gemini Auto), uploads attached images, then injects the message into Gemini's input field and fires a submit event.

```mermaid
sequenceDiagram
    actor User
    participant Entry as Popup / Shortcut / Context menu
    participant Storage as chrome.storage.local
    participant BG as background.js
    participant Tab as gemini.google.com
    participant CS as content.js

    User->>Entry: Question (+ images, thinking level)
    Entry->>Storage: Save pendingMessage, pendingThinkingLevel, pendingFiles
    Entry->>Tab: Open or refresh Gemini tab
    opt Redirected to consent.google.com
        BG->>Tab: Auto-accept consent
    end
    Tab->>CS: Inject at document_idle
    CS->>Storage: Read pending data
    CS->>Tab: Select thinking level
    CS->>Tab: Upload images
    CS->>Tab: Inject message and submit
    CS-->>BG: injectionResult
    BG-->>User: Toolbar badge (sending / success / error)
```

> **Note:** Gemini is a complex Angular SPA and Google occasionally changes its DOM. If the thinking level can't be set, the message is still sent with Gemini's current level; if the input field can't be found, the toolbar badge shows an error.

---

## Project layout

```mermaid
flowchart LR
    subgraph Shared["src/shared"]
        C[constants.js]
        S[stringUtils.js / i18nDom.js]
        P[promptEngine.js]
    end
    Popup[popup] --> Shared
    Options[options] --> Shared
    Welcome[welcome] --> Shared
    BG[background service worker] --> Shared
    Popup -- storage.local --> CS[content script]
    BG -- storage.local --> CS
    CS --> Gemini[(gemini.google.com)]
```

```
ask-gemini-extension/
├── manifest.json        Chrome extension manifest (MV3)
├── build.mjs            esbuild bundler (npm run build)
├── package.sh           Chrome Web Store zip (dist/ask-gemini-extension.zip)
├── _locales/            en, de, es, fr, zh_CN translations
├── icons/               Toolbar / store icons
├── src/
│   ├── background/      Service worker — context menus, shortcut, badge, migrations
│   ├── content/         Gemini page script — message / file injection
│   ├── popup/           Popup UI
│   ├── options/         Settings page
│   ├── welcome/         First-run page
│   └── shared/          Constants, i18n helpers, prompt engine, base styles
├── tests/               Vitest unit tests
└── e2e/                 Playwright end-to-end scenarios (real Gemini)
```

## Development

```bash
npm run build        # production build → src/**/*.min.{js,css}
npm run build:dev    # unminified with inline source maps
npm run lint         # ESLint + Stylelint + HTMLHint
npm test             # unit tests (Vitest)
npm run e2e          # end-to-end tests (Playwright, needs a Gemini-capable session)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

## Permissions used

| Permission | Why |
|---|---|
| `storage` | Stores your question and thinking-level preference to pass them to the Gemini tab, and persists settings across browser restarts |
| `contextMenus` | Adds the right-click "Open Gemini" / "Ask Gemini" menu items |
| `scripting` | Reads the selected text on the current page to auto-fill the popup |
| `activeTab` | Grants temporary access to the current page when you click the toolbar icon, use the shortcut or the context menu - used to read the selected text and page title |
| `host_permissions: gemini.google.com` | Allows the content script to run on Gemini |
| `host_permissions: consent.google.com` | Lets the extension continue past Google's cookie-consent redirect when sending a question |
