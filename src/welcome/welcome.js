// welcome.js

async function init() {
  // 1. Apply Theme (matches your existing logic)
  const data = await chrome.storage.local.get('askGeminiTheme');
  const theme = data.askGeminiTheme || 'auto';
  
  if (theme === 'light') {
    document.body.classList.add('light');
  } else if (theme === 'auto') {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.body.classList.add('light');
    }
  }

  // 2. Handle Button Click to Close Tab
  document.getElementById('closeWelcome').addEventListener('click', () => {
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