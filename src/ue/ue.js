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

import { select } from 'hast-util-select';
import { getUEConfig, getUEHtmlHeadEntries } from './scaffold.js';
import { injectUEAttributes } from './attributes.js';

/**
 * Applies Universal Editor instrumentation on top of a composed document tree:
 * UE head script/meta tags and `data-aue-*` attributes on the body.
 *
 * @param {import('hast').Root} documentTree - The composed document tree (mutated in place).
 * @param {Object} daCtx - The Dark Alley context object.
 * @param {Object} aemCtx - The AEM context object.
 */
export async function applyUEInstrumentation(documentTree, daCtx, aemCtx) {
  // add UE head script and meta tags
  const headNode = select('head', documentTree);
  headNode.children.push(...getUEHtmlHeadEntries(daCtx, aemCtx));

  // add data attributes for UE to the body
  const bodyNode = select('body', documentTree);
  const ueConfig = await getUEConfig(aemCtx);
  injectUEAttributes(bodyNode, ueConfig);
}
