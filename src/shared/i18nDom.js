// ── shared/i18nDom.js ─────────────────────────────────────────
// DOM-level i18n substitution helper for popup, options, and welcome pages.
// Call applyI18n() once on DOMContentLoaded — chrome.i18n is synchronous so
// there is no flicker.
//
// Supported data attributes:
//   data-i18n="key"
//     Sets element.textContent to t(key).
//   data-i18n-attr="attr1:key1,attr2:key2"
//     Sets each named attribute to t(keyN).
//     Example: data-i18n-attr="title:popup_send_title,aria-label:popup_send_aria"

import { t } from "./stringUtils.js";

/**
 * Walks `root` (default: document) and substitutes i18n keys into elements that
 * declare data-i18n / data-i18n-attr attributes.
 * @param {Document|Element} [root=document]
 */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(",")) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx === -1) continue;
      const attr = pair.slice(0, colonIdx).trim();
      const key  = pair.slice(colonIdx + 1).trim();
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
