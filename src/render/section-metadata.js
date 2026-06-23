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

import { toString } from 'hast-util-to-string';
import { SKIP, visit } from 'unist-util-visit';
import { toMetaName } from '../utils/hast.js';

export function toBlockCSSClassNames(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((val) => val
      .toLowerCase()
      .trim()
      .replace(/[^0-9a-z]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, ''))
    .filter(Boolean);
}

export default function extractSectionMetadata(hast) {
  const isSectionMetadata = (node) => node.tagName === 'div'
    && node.properties?.className?.includes('section-metadata');

  visit(hast, isSectionMetadata, (node, index, parent) => {
    for (const $row of node.children) {
      if ($row.tagName === 'div' && $row.children?.[1]) {
        const [$name, $value] = $row.children;
        const name = toMetaName(toString($name));
        if (name) {
          const value = toString($value).trim();
          if (name === 'style') {
            if (!parent.properties.className) {
              parent.properties.className = [];
            }
            parent.properties.className.push(...toBlockCSSClassNames(value));
          } else {
            parent.properties[`data-${name}`] = value;
          }
        }
      }
    }
    parent.children.splice(index, 1);
    return SKIP;
  });
}
