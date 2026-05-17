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

import { fromHtml } from 'hast-util-from-html';
import { select } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { makeImagesRelative } from '../ue/rewrite-images.js';
import { removeMetadataBlock } from '../ue/metadata.js';
import rewriteIcons from '../ue/rewrite-icons.js';

export function prepareDAProxyHtml(daCtx, aemPageHtml, daBodyHtml) {
  const documentTree = fromHtml(aemPageHtml);
  const bodyNode = select('body', documentTree);
  const daBodyTree = fromHtml(daBodyHtml, { fragment: true });
  bodyNode.children = daBodyTree.children;

  makeImagesRelative(bodyNode, daCtx);
  rewriteIcons(bodyNode);
  removeMetadataBlock(bodyNode);

  return toHtml(documentTree, {
    allowDangerousHtml: true,
    upperDoctype: true,
  });
}
