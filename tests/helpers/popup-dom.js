/**
 * Builds the minimal DOM that popup.js accesses at module load time.
 * Call this BEFORE importing popup.js so getElementById never returns null.
 */
export function setupPopupDom() {
  document.body.innerHTML = `
    <textarea id="questionInput"></textarea>
    <button  id="sendBtn" disabled></button>
    <button  id="logoBtn"></button>
    <span    id="hint"></span>
    <div     id="selectionBanner"></div>
    <span    id="selectionText"></span>
    <button  id="selectionClear"></button>
    <div     id="modelSwitcher">
      <button class="model-opt" data-model="flash">Flash</button>
      <button class="model-opt" data-model="pro">Pro</button>
      <button class="model-opt" data-model="thinking">Think</button>
    </div>
    <div id="inputWrapper">
      <div id="acStrip">
        <div  id="acGhost"></div>
        <span id="acCounter"></span>
      </div>
    </div>
    <div id="tmplDropdown">
      <div    id="tmplList"></div>
      <div    id="tmplEmpty"></div>
      <button id="tmplCloseBtn"></button>
    </div>
    <button id="tmplTriggerBtn"></button>
    <a      id="tmplSettingsLink"></a>
  `;
}

/** Reset per-test mutable DOM state so tests don't bleed into each other. */
export function resetPopupDom() {
  const input   = document.getElementById("questionInput");
  const sendBtn = document.getElementById("sendBtn");
  if (input)   { input.value = ""; input.disabled = false; }
  if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.remove("sending"); }
}
