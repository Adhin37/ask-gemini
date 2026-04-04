// welcome.js

/** Applies the saved theme and wires the close-tab button on the welcome page. */
async function init() {
  // 1. Apply Theme (matches your existing logic)
  const data = await chrome.storage.sync.get("askGeminiTheme");
  const theme = data.askGeminiTheme || "auto";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === "light" ? "only light" :
    theme === "dark"  ? "only dark"  : "";

  // 2. Handle Button Click to Close Tab
  document.getElementById("closeWelcome").addEventListener("click", () => {
    chrome.tabs.getCurrent((tab) => {
      if (tab) {
        chrome.tabs.remove(tab.id);
      } else {
        // Fallback for edge cases
        window.close();
      }
    });
  });
}

init();