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
import { getHtmlDoc, getUEConfig, getUEHtmlHeadEntries } from './scaffold';
import { createElementNode } from '../utils/hast';
import { readBlockConfig } from '../utils/hast';
import { injectUEAttributes } from './attributes';

export async function prepareHtml(daCtx, aemCtx, bodyHtmlStr, headHtmlStr) {
  // get the HTML document tree
  const documentTree = getHtmlDoc();

  // prepare the additional head HTML script and meta tags
  const headNode = select('head', documentTree);
  injectAEMHtmlHeadEntries(daCtx, headNode, headHtmlStr);
  headNode.children.push(...getUEHtmlHeadEntries(daCtx, aemCtx));

  // parse and inject the body HTML
  const bodyNode = select('body', documentTree);
  const bodyTree = fromHtml(bodyHtmlStr, { fragment: true });
  bodyNode.children = bodyTree.children;

  // extract metadata block from the body
  const metaConfig = [];
  Object.entries(extractMetaData(bodyTree)).forEach(([name, value]) => {
    headNode.children.push(
      createElementNode('meta', {
        name,
        content: value,
      })
    );
  });

  // add data attributes for UE to the body
  const ueConfig = await getUEConfig(aemCtx);
  injectUEAttributes(bodyNode, ueConfig);

  // output the final HTML document
  format(documentTree);
  let htmlDocStr = toHtml(documentTree, {
    allowDangerousHtml: true,
    upperDoctype: true,
  });
  return htmlDocStr;
}

function injectAEMHtmlHeadEntries(daCtx, headNode, headHtmlStr) {
  const { org, site, isLocal } = daCtx;
  const aemHeadHtmlTree = fromHtml(headHtmlStr, { fragment: true });

  if (isLocal) {
    const headScriptsAndLinks = selectAll(
      'script[src], link[href]',
      aemHeadHtmlTree
    );
    headScriptsAndLinks.forEach((node) => {
      const attrName = node.tagName === 'script' ? 'src' : 'href';
      const url = node.properties[attrName];
      if (!url.startsWith('http') && !url.startsWith(`/${org}/${site}`)) {
        node.properties[attrName] = `/${org}/${site}${url}`;
      }
    });
  }

  headNode.children.push(...aemHeadHtmlTree.children);
}

function extractMetaData(bodyTree) {
  const metaBlock = select('div.metadata', bodyTree);
  let metaConfig = {};
  if (metaBlock) {
    metaConfig = readBlockConfig(metaBlock);
    // TODO hide the metadata block, maybe remove it
    metaBlock.properties.style = 'display: none;';
  }
  return metaConfig;
}
