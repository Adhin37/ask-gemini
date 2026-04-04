# Ask Gemini — Chrome Extension

## Project Identity

- **Name:** Ask Gemini
- **Version:** 1.3.1
- **Tech Stack:** Chrome Extension Manifest V3 (MV3), Vanilla JavaScript, CSS, HTML
- **Core Function:** Captures user input via a popup or context menu and injects it into `gemini.google.com`

## File Structure

```
manifest.json                       # MV3 manifest — points to dist/ for runtime files
build.mjs                           # esbuild bundler script
src/
  shared/constants.js               # ES-module exports shared by background, popup, options
  background/background.js          # Service Worker (no persistent background page)
  content/content.js                # Injected into gemini.google.com
  popup/popup.html|js|css           # Extension popup UI
  options/options.html|js|css       # Options/settings page
  welcome/welcome.html|js|css       # First-run welcome page
  assets/                           # Store listing images (not loaded by the extension)
dist/                               # Build output — gitignored, referenced by manifest.json
  background/background.js          # Bundled + minified
  content/content.js
  popup/popup.html|js|css
  options/options.html|js|css
  welcome/welcome.html|js|css
icons/                              # Extension icons (16, 48, 128px)
```

## Architecture Rules

### State Management
- Use `chrome.storage.local` to pass data between popup/background and content script.
- Do not use `sessionStorage`, `localStorage`, or global variables across script boundaries.

### Content Script (`content.js`)
- Targets `https://gemini.google.com/*`, injected at `document_idle`.
- Gemini uses a React-based DOM — always check if the input field is rendered before interacting with it.
- Injection logic: read from `chrome.storage.local` → locate the Gemini textarea → simulate input/submit events.
- Include fallback logic (clipboard / manual paste prompt) if the DOM structure changes.
- Keep this script lightweight — it runs on every Gemini tab load.

### Background Script (`background.js`)
- MV3 Service Worker only — no `background.html` or persistent background page.
- Handles context menu creation and `chrome.runtime.onMessage` listeners.

### Permissions
- Declared in `manifest.json`: `storage`, `contextMenus`, `tabs`, `scripting`, `activeTab`
- Host permissions: `https://gemini.google.com/*`
- Do not request additional permissions without updating the manifest and this file.

## Coding Preferences

- **Modules:** Prefer modular JS where the extension architecture allows (MV3 service workers support ES modules via `"type": "module"`).
- **Error Handling:** Always check `chrome.runtime.lastError` inside Chrome API callbacks.
- **UI Consistency:** Popup and Options pages must use the CSS variables and styles defined in `src/popup/popup.css` and `src/options/options.css`. Do not introduce new design tokens.
- **No innerHTML:** Use `textContent`, `createElement`, or `insertAdjacentText` to avoid CSP violations.
- **No eval():** Forbidden — violates MV3 CSP.

## Critical Constraints

| Constraint | Rule |
|---|---|
| Manifest version | MV3 only — no `background.page`, use Service Worker |
| Security | No `eval()`, no `innerHTML` with user-controlled content |
| Performance | Content script must stay minimal — no heavy dependencies |
| Permissions | Match manifest exactly — no undeclared permissions at runtime |
| Compatibility | Target Chrome stable; no experimental APIs |

## Build

esbuild bundles and minifies all JS/CSS into `dist/`. The manifest references `dist/` exclusively.

```bash
npm install          # install deps (first time)
npm run build        # production build → dist/  (minified)
npm run build:dev    # dev build → dist/  (unminified, inline source maps)
```

`dist/` is gitignored. You must run `npm run build` before loading the extension in Chrome or packaging it.

### How constants are shared

`src/shared/constants.js` exports every shared constant (`GEMINI_URL`, `MAX_HISTORY`, etc.) as named ES-module exports. Each consuming file (`background.js`, `popup.js`, `options.js`) imports exactly what it needs. esbuild inlines the imported values into each bundle — no runtime `importScripts()`, no `<script>` tag for constants.

### Packaging for distribution

```bash
./package.sh          # builds + creates both zips
./package.sh --no-build  # skip build (dist/ already exists)
```

Produces:
- `ask-gemini-extension.zip` — minified build for CWS upload / GitHub release
- `ask-gemini-source.zip` — unminified source for CWS review submission

## Linting

Three tools, one command: `npm run lint`

| Tool | Config file | Scope | Run alone |
| --- | --- | --- | --- |
| ESLint v9 | `eslint.config.mjs` | `src/**/*.js` | `npm run lint:js` |
| Stylelint | `.stylelintrc.json` | `src/**/*.css` | `npm run lint:css` |
| HTMLHint | `.htmlhintrc` | `src/**/*.html` | `npm run lint:html` |

Install dev deps once: `npm install`

### Key ESLint rules

- **Errors** (must fix): `no-eval`, `no-implied-eval`, `no-var`, `no-undef`, `no-unused-vars`, `eqeqeq`
- **Security warning**: `innerHTML` use is flagged — must be preceded by `escapeHtml()` or equivalent
- **Style warnings**: `prefer-const`, `semi`, `quotes` (double) — majority style in this codebase
- `console.log` is warned; `console.warn/error/info/debug` are allowed
- All source files use `sourceType: "module"` — `import` statements are required for shared code

### Quote convention

- `background.js`, `options.js`, `content.js` → **double quotes**
- `popup.js` → currently single quotes (will show warnings; migrate gradually)

## Common Patterns

### Sending data from popup → content script via storage
```js
// popup.js
chrome.storage.local.set({ pendingQuery: text }, () => {
  if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
  // then open/focus the Gemini tab
});

// content.js
chrome.storage.local.get(['pendingQuery'], ({ pendingQuery }) => {
  if (chrome.runtime.lastError) return;
  if (pendingQuery) injectQuery(pendingQuery);
});
```

### Safe DOM injection (no innerHTML)
```js
const el = document.createElement('p');
el.textContent = userInput; // never el.innerHTML
container.appendChild(el);
```

### Context menu registration (background.js)
```js
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'ask-gemini', title: 'Ask Gemini: "%s"', contexts: ['selection'] });
});
```
