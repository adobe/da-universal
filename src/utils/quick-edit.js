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

const QUICK_EDIT_INIT = 'https://da.live/nx/public/plugins/quick-edit/quick-edit-init.js';

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
 * Inject or update the quick-edit import map in the tree.
 * Returns true when the tree was modified, false when already satisfied.
 * @param {import('hast').Root} tree
 * @param {string | undefined} nonce
 * @returns {boolean}
 */
function injectImportMap(tree, nonce) {
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
  const node = h('script', {
    type: 'importmap',
    ...(nonce === undefined ? {} : { nonce }),
  }, JSON.stringify(QUICK_EDIT_IMPORT_MAP));
  const head = select('head', tree);
  if (head) {
    head.children.unshift(node);
  } else {
    tree.children = [node, ...(tree.children ?? [])];
  }
  return true;
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
 * Inject the quick-edit import map and initializer before other head scripts
 * unless the document already loads quick-edit-init.js.
 * @param {import('hast').Root} tree The document tree (mutated in place)
 * @param {string | undefined} [nonce] CSP nonce for injected scripts
 */
export function applyQuickEditToDocument(tree, nonce) {
  const alreadyInitialized = selectAll('script[src]', tree).some((node) => {
    try {
      const { pathname } = new URL(node.properties.src, 'https://da.local');
      return /\/quick-edit-init\.js$/.test(pathname);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      console.warn('[quick-edit] Ignoring a script with an invalid src URL.');
      return false;
    }
  });
  if (alreadyInitialized) return;

  injectImportMap(tree, nonce);
  const head = select('head', tree);
  const scripts = head.children.filter((node) => node.tagName === 'script'
    && node.properties.type !== 'importmap');
  head.children = head.children.filter((node) => !scripts.includes(node));
  // Keep policies, base URLs and import maps in place before any script can run.
  const prerequisites = head.children.filter((node) => node.tagName === 'base'
    || node.tagName === 'script'
    || (node.tagName === 'meta'
      && String(node.properties.httpEquiv).toLowerCase() === 'content-security-policy'));
  const lastPrerequisite = head.children.lastIndexOf(prerequisites.at(-1));
  head.children.splice(lastPrerequisite + 1, 0, h('script', {
    type: 'module',
    src: QUICK_EDIT_INIT,
    ...(nonce === undefined ? {} : { nonce }),
  }), ...scripts);
}

/**
 * Apply quick-edit document transforms: inject the import map and initializer.
 * @param {string} html
 * @param {string | undefined} [nonce] CSP nonce for injected scripts
 * @returns {{ html: string }}
 */
export function prepareQuickEditDocument(html, nonce) {
  const tree = fromHtml(html);
  applyQuickEditToDocument(tree, nonce);
  return { html: toHtml(tree, { allowDangerousHtml: true }) };
}

/**
 * Build the quick-edit 404 response for when there is no such site: a minimal page shell with
 * the import map and initializer injected, so the editor can still load into it.
 * @returns {Response}
 */
export function buildQuickEditNotFoundResponse() {
  console.log('[quick-edit] doc compose: no such site, serving a minimal scaffold');
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
