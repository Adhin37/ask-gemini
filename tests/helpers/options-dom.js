/**
 * Builds the minimal DOM that options.js accesses at module load time.
 * Call this BEFORE importing options.js so getElementById never returns null.
 */
export function setupOptionsDom() {
  document.body.innerHTML = `
    <span id="extVersion"></span>
    <span id="aboutVersion"></span>
    <a id="shortcutPageLink" href="#"></a>

    <div id="themeControl">
      <button class="seg-btn" data-value="auto">Auto</button>
      <button class="seg-btn" data-value="dark">Dark</button>
      <button class="seg-btn" data-value="light">Light</button>
    </div>

    <div id="modelControl">
      <button class="seg-btn" data-value="flash">Fast</button>
      <button class="seg-btn" data-value="thinking">Think</button>
      <button class="seg-btn" data-value="pro">Pro</button>
    </div>

    <div id="historyList"></div>
    <div id="emptyState" style="display:none">
      <p>No history yet.</p>
      <span>Questions you send to Gemini will appear here.</span>
    </div>
    <input type="text" id="historySearch" />
    <button id="clearHistoryBtn"></button>

    <div id="confirmOverlay">
      <button id="confirmCancel"></button>
      <button id="confirmOk"></button>
    </div>

    <button id="addTemplateBtn"></button>
    <div id="tmplFormCard" style="display:none">
      <div id="tmplFormLabel">New template</div>
      <textarea id="tmplTextarea"></textarea>
      <span id="tmplCharCount">0 / 400</span>
      <button id="tmplCancelBtn"></button>
      <button id="tmplSaveBtn" disabled></button>
    </div>
    <div id="tmplCardList"></div>
    <div id="tmplEmptyState" style="display:none"></div>

    <div id="tmplDeleteOverlay">
      <p id="tmplDeleteBody"></p>
      <button id="tmplDeleteCancel"></button>
      <button id="tmplDeleteConfirm"></button>
    </div>

    <textarea id="summarizePrefixTextarea"></textarea>
    <span id="summarizePrefixCharCount">0 / 300</span>
    <button id="summarizePrefixSaveBtn" disabled></button>
    <button id="summarizePrefixResetBtn"></button>

    <a class="nav-item active" data-section="history" href="#"></a>
    <a class="nav-item" data-section="templates" href="#"></a>
    <a class="nav-item" data-section="appearance" href="#"></a>
    <a class="nav-item" data-section="contextmenu" href="#"></a>

    <section class="section active" id="section-history"></section>
    <section class="section" id="section-templates"></section>
    <section class="section" id="section-appearance"></section>
    <section class="section" id="section-contextmenu"></section>

    <button id="brandLogoBtn"></button>
    <button id="aboutLogoBtn"></button>
    <span   id="shortcutDisplay"></span>
    <button id="shortcutEditBtn"></button>

    <div id="tmplModelTabs">
      <button class="tmpl-model-tab" data-model="flash">Fast<span class="tmpl-tab-badge">0</span></button>
      <button class="tmpl-model-tab" data-model="thinking">Think<span class="tmpl-tab-badge">0</span></button>
      <button class="tmpl-model-tab" data-model="pro">Pro<span class="tmpl-tab-badge">0</span></button>
    </div>

    <input  id="promptEngToggle" type="checkbox" />
    <div    id="promptEngRules"></div>
    <div    id="summarizePrefixSection"></div>

    <div    id="peResetAllOverlay">
      <button id="peResetAllCancel"></button>
      <button id="peResetAllConfirm"></button>
    </div>
  `;
}

/** Reset per-test mutable DOM state so tests don't bleed into each other. */
export function resetOptionsDom() {
  const historySearch              = document.getElementById("historySearch");
  const tmplTextarea               = document.getElementById("tmplTextarea");
  const summarizePrefixTextarea    = document.getElementById("summarizePrefixTextarea");
  const confirmOverlay             = document.getElementById("confirmOverlay");
  const tmplDeleteOverlay          = document.getElementById("tmplDeleteOverlay");
  const tmplFormCard               = document.getElementById("tmplFormCard");
  const tmplSaveBtn                = document.getElementById("tmplSaveBtn");
  const summarizePrefixSaveBtn     = document.getElementById("summarizePrefixSaveBtn");

  if (historySearch)           historySearch.value          = "";
  if (tmplTextarea)            tmplTextarea.value           = "";
  if (summarizePrefixTextarea) summarizePrefixTextarea.value = "";
  if (confirmOverlay)          confirmOverlay.classList.remove("visible");
  if (tmplDeleteOverlay)       tmplDeleteOverlay.classList.remove("visible");
  if (tmplFormCard)            tmplFormCard.style.display    = "none";
  if (tmplSaveBtn)             tmplSaveBtn.disabled          = true;
  if (summarizePrefixSaveBtn)  summarizePrefixSaveBtn.disabled = true;
}
