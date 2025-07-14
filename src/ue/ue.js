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
import { getHtmlDoc, getUEConfig, getUEHtmlHeadEntries } from './scaffold.js';
import { injectUEAttributes } from './attributes.js';
import { extractLocalMetadata, fetchBulkMetadata } from './metadata.js';
import rewriteIcons from './rewrite-icons.js';
import rewriteDaImgSrcs from './rewrite-images.js';

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

export async function prepareHtml(daCtx, aemCtx, bodyHtmlStr, headHtmlStr) {
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

  // add UE head script and meta tags
  headNode.children.push(...getUEHtmlHeadEntries(daCtx, aemCtx));

  // rewrite icons
  rewriteIcons(bodyNode);

  // rewrite DA img srcs
  rewriteDaImgSrcs(bodyNode);

  // add data attributes for UE to the body
  const ueConfig = await getUEConfig(aemCtx);
  injectUEAttributes(bodyNode, ueConfig);

  // output the final HTML document
  format(documentTree);
  const htmlDocStr = toHtml(documentTree, {
    allowDangerousHtml: true,
    upperDoctype: true,
  });
  return htmlDocStr;
}
