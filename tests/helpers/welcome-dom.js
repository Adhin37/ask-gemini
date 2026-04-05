/**
 * Builds the minimal DOM that welcome.js accesses at module load time.
 * Call this BEFORE importing welcome.js.
 */
export function setupWelcomeDom() {
  document.body.innerHTML = `
    <button id="closeWelcome">Start browsing</button>
  `;
}
