# Contributing to Ask Gemini

This `CONTRIBUTING.md` is designed to help collaborators maintain the "Single Purpose" nature of **Ask Gemini** while strictly adhering to the Chrome Web Store's developer policies.

Thank you for your interest in improving **Ask Gemini**\! To ensure the extension remains safe, fast, and compliant with the Chrome Web Store Developer Program Policies, please follow these guidelines.

## 🚀 Getting Started

1. **Fork the repository** on GitHub at `https://github.com/Adhin37/ask-gemini`.
2. **Enable Developer Mode** in your browser at `chrome://extensions/`.
3. **Load the unpacked extension** by selecting the project folder.
4. The current stable version is **1.2.0**.

## 🛠 Development Guidelines

### 1\. Technical Requirements

* All code must adhere to **Manifest V3**.
* Do **not** use `eval()` or remotely hosted scripts; all logic must be self-contained within the extension package.
* Code must be **readable and non-obfuscated**. While minification is allowed, concealing functionality is a policy violation.

### 2\. Privacy & Permissions

* Always request the **minimum permissions** necessary for a feature.
* Current permissions include `storage`, `contextMenus`, `tabs`, `scripting`, and `activeTab`.
* Do **not** add code that transmits user data to third-party servers.
* User questions are currently passed to Gemini via `chrome.storage.local` to ensure local-only handling.

### 3\. Maintaining "Single Purpose"

* This extension has one narrow goal: instantly sending questions to Google Gemini from the browser.
* Avoid bundling unrelated features or "toolbars" with broad functionality, as this violates the **Single Purpose** quality guideline.

## 🐛 Reporting Bugs & Suggestions

* **Bugs:** Use the [Bug Report template](https://www.google.com/search?q=https://github.com/Adhin37/ask-gemini/issues) to provide technical details like your browser version and OS.
* **Gemini DOM Changes:** Since the content script (`content.js`) injects messages into a complex React app, Google may change the DOM at any time. If the "auto-submit" feature breaks, please report it immediately so the selectors can be updated.

## 📦 Pull Request Process

1. Create a new branch for your fix or feature.
2. Ensure your code is tested and does not break the core injection flow on `https://gemini.google.com/*`.
3. If your PR is ready for a release, the versioning follows a specific tag format: `v[0-9].[0-9]*.[0-9]*`.
4. The CI/CD workflow (`release.yml`) will automatically update the manifest version and package the extension when a valid tag is pushed.

## ☕ Support

If you find this project helpful, you can support the lead developer, **Adhin**, via [Ko-fi](https://ko-fi.com/adhin/tip).
