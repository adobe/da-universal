/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { select } from 'hast-util-select';
import { visit } from 'unist-util-visit';

const NONCE_AEM = "'nonce-aem'";
const TRUSTED_TYPES_REQUIRE = 'require-trusted-types-for';

function directiveHasNonce(content, name) {
  return content
    .split(';')
    .some((directive) => {
      const [directiveName, ...values] = directive.trim().split(/\s+/);
      return directiveName === name && values.includes(NONCE_AEM);
    });
}

function removeTrustedTypesRequire(content) {
  const directives = content.split(';');
  const filtered = directives.filter(
    (directive) => directive.trim().split(/\s+/, 1)[0].toLowerCase() !== TRUSTED_TYPES_REQUIRE,
  );
  if (filtered.length !== directives.length) {
    console.warn(`Removed ${TRUSTED_TYPES_REQUIRE} from the composed CSP meta.`);
  }
  return filtered.join(';');
}

function createNonce() {
  const array = new Uint8Array(18);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * @param {import('hast').Root} documentTree the composed document, mutated in place
 * @returns {string|undefined} the nonce to stamp on injected scripts, or undefined when the
 *   page carries no policy that asks for one
 */
export default function applyCsp(documentTree) {
  // head.html owns the policy and placeholders; the body is author content that round-trips
  const scope = select('head', documentTree) ?? documentTree;
  const meta = select('meta[http-equiv="content-security-policy" i]', scope);
  const content = meta?.properties.content;
  if (typeof content !== 'string' || !content.includes(NONCE_AEM)) {
    return undefined;
  }

  const scriptNonce = directiveHasNonce(content, 'script-src');
  const styleNonce = directiveHasNonce(content, 'style-src');
  const nonce = createNonce();

  meta.properties.content = removeTrustedTypesRequire(
    content.replaceAll(NONCE_AEM, `'nonce-${nonce}'`),
  );
  delete meta.properties['move-to-http-header'];
  delete meta.properties['move-as-header'];

  visit(scope, (node) => {
    if (node.properties?.nonce !== 'aem') return;

    if (scriptNonce
      && (node.tagName === 'script'
        || (node.tagName === 'link' && node.properties.as === 'script'))) {
      node.properties.nonce = nonce;
      return;
    }

    if (styleNonce
      && (node.tagName === 'style'
        || (node.tagName === 'link' && node.properties.rel?.includes('stylesheet')))) {
      node.properties.nonce = nonce;
    }
  });

  return scriptNonce ? nonce : undefined;
}
