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

import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { select, selectAll } from 'hast-util-select';

import { h } from 'hastscript';

import { daResp } from '../responses/index.js';
import { DEFAULT_HTML_TEMPLATE } from './constants.js';

const QUICK_EDIT_IMPORT_MAP = {
  imports: {
    'da-lit': 'https://da.live/deps/lit/dist/index.js',
    'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
  },
};

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

// ─── hast tree helpers ────────────────────────────────────────────────────────

/**
 * Walk the tree and return the pathname of the first `<script src="…/scripts.js">`.
 * @param {import('hast').Root} tree
 * @returns {string | undefined}
 */
function findEntryScriptInTree(tree) {
  for (const node of selectAll('script[src]', tree)) {
    try {
      const { pathname } = new URL(String(node.properties.src), 'https://da.local');
      if (/\/scripts\.js$/.test(pathname)) return pathname;
    } catch { /* ignore */ }
  }
  return undefined;
}

/**
 * Inject or update the quick-edit import map in the tree.
 * Returns true when the tree was modified, false when already satisfied.
 * @param {import('hast').Root} tree
 * @returns {boolean}
 */
function injectImportMap(tree) {
  const existing = select('script[type="importmap"]', tree);
  if (existing) {
    const text = (existing.children ?? []).find((c) => c.type === 'text')?.value ?? '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
    if (quickEditSatisfied(parsed)) return false;
    const merged = mergeImportMaps(parsed, QUICK_EDIT_IMPORT_MAP);
    existing.children = [{ type: 'text', value: JSON.stringify(merged) }];
    return true;
  }
  const node = h('script', { type: 'importmap' }, JSON.stringify(QUICK_EDIT_IMPORT_MAP));
  const head = select('head', tree);
  if (head) {
    head.children.unshift(node);
  } else {
    tree.children = [node, ...(tree.children ?? [])];
  }
  return true;
}

/**
 * Add the CSP nonce attribute to every `<script>` element that lacks one.
 * @param {import('hast').Root} tree
 * @param {string | undefined} nonce
 */
function applyNonceInTree(tree, nonce) {
  if (!nonce) return;
  for (const node of selectAll('script', tree)) {
    node.properties ??= {};
    node.properties.nonce = nonce;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract the CSP nonce value from a Content-Security-Policy header.
 * Matches the `'nonce-VALUE'` token in the script-src directive only.
 * @param {string | null} cspHeader
 * @returns {string | undefined}
 */
export function extractCspNonce(cspHeader) {
  if (!cspHeader) return undefined;
  const directive = cspHeader.match(/(?:^|;)\s*script-src\s+([^;]*)/i);
  if (!directive) return undefined;
  const nonce = directive[1].match(/'nonce-([^']+)'/);
  return nonce ? nonce[1] : undefined;
}

/**
 * Find the project's entry script path in an HTML document. Looks for a
 * `<script src="…/scripts.js">` tag and returns its normalized pathname.
 * @param {string} html The page HTML
 * @returns {string | undefined}
 */
export function findEntryScriptPath(html) {
  return findEntryScriptInTree(fromHtml(html, { fragment: true }));
}

/**
 * Apply quick-edit document transforms to a hast tree in place: inject the
 * import map, stamp the CSP nonce onto script tags, and discover the entry
 * script path (used to set the quick-edit cookie).
 * @param {import('hast').Root} tree The document tree (mutated in place)
 * @param {string | undefined} [nonce] CSP nonce to stamp onto all script tags
 * @returns {string | undefined} The entry script path, if found
 */
export function applyQuickEditToDocument(tree, nonce) {
  const entryPath = findEntryScriptInTree(tree);
  injectImportMap(tree);
  applyNonceInTree(tree, nonce);
  return entryPath;
}

/**
 * Apply quick-edit document transforms: discover entry script, inject import map, apply nonce.
 * @param {string} html
 * @param {string | undefined} [nonce] CSP nonce to stamp onto all script tags
 * @returns {{ html: string, entryPath: string | undefined }}
 */
export function prepareQuickEditDocument(html, nonce) {
  const tree = fromHtml(html);
  const entryPath = applyQuickEditToDocument(tree, nonce);
  return { html: toHtml(tree, { allowDangerousHtml: true }), entryPath };
}

/**
 * Build the quick-edit 404 response for when the AEM branch itself can't be
 * resolved (e.g. head.html is missing): a minimal page shell with the import
 * map injected (no entry script), status 404, so the editor can still load
 * into it. Reuse this anywhere quick-edit needs to degrade the same way.
 * @returns {Response}
 */
export function buildQuickEditNotFoundResponse() {
  console.log('[quick-edit] doc compose: head.html not found on origin, serving a minimal scaffold');
  const tree = fromHtml(`<html><head></head>${DEFAULT_HTML_TEMPLATE}</html>`);
  applyQuickEditToDocument(tree, undefined);
  const body = toHtml(tree, { allowDangerousHtml: true });
  return daResp({
    status: 404,
    body,
    contentLength: body.length,
    contentType: 'text/html; charset=utf-8',
  });
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
