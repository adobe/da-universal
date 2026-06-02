/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const QUICK_EDIT_IMPORT_MAP = {
  imports: {
    'da-lit': 'https://da.live/deps/lit/dist/index.js',
    'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
  },
};

const IMPORT_MAP_SCRIPT_RE = /<script\b([^>]*\btype\s*=\s*["']importmap["'][^>]*)>\s*([^<]*)\s*<\/script>/is;

// Appended to the bottom of the project's scripts/scripts.js. Because it runs
// inside that module, `loadPage` is already in scope (no import needed) and the
// module is only ever evaluated once (no double execution from inlining).
// The quick-edit gate is at runtime: the script request itself carries no query
// param, so we read it from the live page URL when the module evaluates.
const QUICK_EDIT_BOOTSTRAP = `
;(() => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('quick-edit')) return;

  document.body.classList.add('quick-edit');

  const payload = (() => {
    try {
      const q = params.get('quick-edit');
      return q && q !== 'on' ? JSON.parse(decodeURIComponent(q)) : {};
    } catch { return {}; }
  })();

  import('https://da.live/nx/public/plugins/quick-edit/quick-edit.js')
    .then(({ default: loadQuickEdit }) => loadQuickEdit(payload, loadPage))
    .catch((e) => { console.error('[quick-edit] failed to load plugin', e); });
})();
`;

export const QUICK_EDIT_COOKIE = 'da-quick-edit';

/** @param {object} map */
function quickEditSatisfied(map) {
  const imports = map?.imports;
  if (!imports) return false;
  return Object.entries(QUICK_EDIT_IMPORT_MAP.imports)
    .every(([key, url]) => imports[key] === url);
}

/**
 * Merge import maps; quick-edit `imports` win on conflict. Other top-level keys
 * (e.g. `scopes`) are preserved from the existing map.
 * @param {object} existing
 * @param {object} overlay
 */
function mergeImportMaps(existing, overlay) {
  return {
    ...existing,
    imports: { ...(existing.imports || {}), ...(overlay.imports || {}) },
  };
}

/** @param {string} attrs Opening-tag attributes (includes type="importmap"). */
function importMapScriptTag(attrs, map) {
  const body = JSON.stringify(map);
  return attrs.trim()
    ? `<script ${attrs.trim()}>${body}</script>`
    : `<script type="importmap">${body}</script>`;
}

/** Insert snippet at the start of `<head>`, or before `</head>`, or prepend. */
function insertInHead(html, snippet) {
  const headOpen = html.match(/<head[^>]*>/i);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  const headClose = html.match(/<\/head>/i);
  if (headClose) {
    return html.slice(0, headClose.index) + snippet + headClose[0]
      + html.slice(headClose.index + headClose[0].length);
  }
  return snippet + html;
}

/**
 * Inject or update the quick-edit import map in the document `<head>`.
 * Replaces an existing import map in place (preserving attributes such as
 * `nonce`). No-ops when the map already includes the quick-edit entries.
 * @param {string} html
 * @returns {string}
 */
export function injectImportMap(html) {
  const existing = html.match(IMPORT_MAP_SCRIPT_RE);

  if (existing) {
    let parsed;
    try {
      parsed = JSON.parse(existing[2]);
    } catch {
      parsed = {};
    }
    if (quickEditSatisfied(parsed)) return html;

    const merged = mergeImportMaps(parsed, QUICK_EDIT_IMPORT_MAP);
    const tag = importMapScriptTag(existing[1], merged);
    return html.replace(existing[0], tag);
  }

  const tag = importMapScriptTag('', QUICK_EDIT_IMPORT_MAP);
  return insertInHead(html, tag);
}

/**
 * Find the project's entry script path in an HTML document. Looks for a
 * `<script src="…/scripts.js">` tag and returns its normalized pathname, so it
 * works regardless of subfolder (`/foo/bar/scripts.js`) and ignores an
 * unrelated file that merely ends in something else.
 * @param {string} html The page HTML
 * @returns {string | undefined} The entry script pathname (e.g. `/scripts/scripts.js`)
 */
export function findEntryScriptPath(html) {
  const tagRegex = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match = tagRegex.exec(html);
  while (match !== null) {
    let pathname;
    try {
      pathname = new URL(match[1], 'https://da.local').pathname;
    } catch {
      pathname = undefined;
    }
    if (pathname && /\/scripts\.js$/.test(pathname)) return pathname;
    match = tagRegex.exec(html);
  }
  return undefined;
}

/**
 * Build the Set-Cookie value that remembers the quick-edit entry script path.
 * Presence of the cookie means "this session wants quick-edit"; the value is
 * the exact path whose request should receive the bootstrap.
 * @param {string} path The entry script pathname
 * @returns {string}
 */
export function buildQuickEditCookie(path) {
  const value = encodeURIComponent(path);
  return `${QUICK_EDIT_COOKIE}=${value}; Secure; Path=/; HttpOnly; SameSite=None; Partitioned; Max-Age=3600`;
}

/**
 * Read the remembered entry script path from a request Cookie header.
 * @param {string | null} cookieHeader The raw Cookie header
 * @returns {string | undefined} The stored entry script pathname, if any
 */
export function getQuickEditCookiePath(cookieHeader) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${QUICK_EDIT_COOKIE}=([^;]+)`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Detect that the scripts already import quick-edit themselves (a manually
 * migrated client). Matches a dynamic import to any path ending in
 * `quick-edit.js`, e.g. `import('/quick-edit.js')` or
 * `import('../tools/quick-edit/quick-edit.js')`.
 * @param {string} code The scripts.js source
 * @returns {boolean}
 */
export function alreadyImportsQuickEdit(code) {
  return /\bimport\s*\(\s*['"][^'"]*quick-edit\.js['"]\s*\)/.test(code);
}

/**
 * Detect a top-level `loadPage` function (declaration or assignment).
 * @param {string} code The scripts.js source
 * @returns {boolean}
 */
export function hasLoadPageFn(code) {
  return /\bfunction\s+loadPage\s*\(/.test(code)
    || /\bloadPage\s*=\s*(?:async\s+)?function\b/.test(code)
    || /\bloadPage\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/.test(code);
}

/**
 * Append the quick-edit bootstrap to a scripts.js source, unless the project
 * has no `loadPage` or already wires up quick-edit itself.
 * @param {string} code The scripts.js source
 * @returns {string} The (possibly unchanged) source
 */
export function transformScriptForQuickEdit(code) {
  if (alreadyImportsQuickEdit(code) || !hasLoadPageFn(code)) return code;
  return `${code}\n${QUICK_EDIT_BOOTSTRAP}\n`;
}

/**
 * Apply the quick-edit bootstrap to a proxied scripts.js response.
 * @param {Response} response The upstream scripts.js response
 * @returns {Promise<Response>}
 */
export async function applyQuickEditToScript(response) {
  const code = await response.text();
  const transformed = transformScriptForQuickEdit(code);

  const headers = new Headers(response.headers);
  // Body length changed and it is no longer encoded as the origin declared.
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
