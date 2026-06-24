/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { format } from 'hast-util-format';
import { fromHtml } from 'hast-util-from-html';
import { select, selectAll } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { h } from 'hastscript';
import { getHtmlDoc } from './scaffold.js';
import { extractLocalMetadata, fetchBulkMetadata } from './metadata.js';
import rewriteIcons from './rewrite-icons.js';
import { makeImagesRelative } from './rewrite-images.js';
import extractSectionMetadata from './section-metadata.js';

/**
 * Injects AEM HTML head entries into the head node of an HTML document.
 *
 * @param {Object} daCtx - The Dark Alley context object containing org and site
 * @param {Object} headNode - The head node of the HTML document where AEM head entries
 * will be injected.
 * @param {string} headHtmlStr - The HTML string containing head entries from AEM.
 */
function injectAEMHtmlHeadEntries(daCtx, headNode, headHtmlStr) {
  const { org, site, orgSiteInPath } = daCtx;
  const aemHeadHtmlTree = fromHtml(headHtmlStr, { fragment: true });

  // TODO: reuse fixUrlsWhenLocalDev from aemCtx.js instead of duplicating.
  if (orgSiteInPath) {
    const headScriptsAndLinks = selectAll(
      'script[src], link[href]',
      aemHeadHtmlTree,
    );
    headScriptsAndLinks.forEach((node) => {
      const attrName = node.tagName === 'script' ? 'src' : 'href';
      const url = node.properties[attrName];
      if (!url.startsWith('http') && !url.startsWith(`/${org}/${site}`)) {
        // eslint-disable-next-line no-param-reassign
        node.properties[attrName] = `/${org}/${site}${url}`;
      }
    });
  }

  headNode.children.push(...aemHeadHtmlTree.children);
}

/**
 * Injects metadata into the head node of an HTML document.
 *
 * @param {Object} metadata - An object containing metadata key-value pairs to inject.
 * @param {Object} headNode - The head node of the HTML document where metadata will be injected.
 */
function injectMetadata(metadata, headNode) {
  Object.entries(metadata).forEach(([name, value]) => {
    if (name === 'title') {
      headNode.children.push(
        h('title', {}, [{ type: 'text', value }]),
      );
    } else {
      headNode.children.push(
        h('meta', {
          name,
          content: value,
        }),
      );
    }
  });
}

/**
 * Composes the HTML document tree from the DA source body and AEM head, without
 * applying any instrumentation (UE or quick-edit). The resulting tree is the
 * common base for all request types; instrumentation layers mutate it in place.
 *
 * @param {Object} daCtx - The Dark Alley context object.
 * @param {Object} aemCtx - The AEM context object.
 * @param {string} bodyHtmlStr - The stored body HTML fragment.
 * @param {string} headHtmlStr - The AEM head.html fragment.
 * @returns {Promise<import('hast').Root>} The composed (unserialized) document tree.
 */
export async function composeHtml(daCtx, aemCtx, bodyHtmlStr, headHtmlStr) {
  // get the HTML document tree
  const documentTree = getHtmlDoc();

  // prepare the additional head HTML script and meta tags
  const headNode = select('head', documentTree);

  // parse and inject the body HTML
  const bodyNode = select('body', documentTree);
  const bodyTree = fromHtml(bodyHtmlStr, { fragment: true });
  bodyNode.children = bodyTree.children;

  // fetch bulk metadata, extract metadata block from the body and merge them
  const bulkMetadata = await fetchBulkMetadata(aemCtx);
  const localMetaData = extractLocalMetadata(bodyTree);
  const mergedMetaData = {
    ...localMetaData,
    ...bulkMetadata.getModifiers(daCtx.path),
  };
  injectMetadata(mergedMetaData, headNode);

  // inject AEM head script and meta tags
  injectAEMHtmlHeadEntries(daCtx, headNode, headHtmlStr);

  // extract section metadata and apply as data attributes / classes to parent sections
  extractSectionMetadata(bodyTree);

  // rewrite content.da.live images to relative paths
  makeImagesRelative(bodyNode, daCtx);

  // rewrite icons
  rewriteIcons(bodyNode);

  return documentTree;
}

/**
 * Serializes a composed document tree into an HTML string.
 *
 * @param {import('hast').Root} documentTree - The document tree to serialize.
 * @returns {string} The serialized HTML document.
 */
export function serializeHtml(documentTree) {
  format(documentTree);
  return toHtml(documentTree, {
    allowDangerousHtml: true,
    upperDoctype: true,
  });
}
