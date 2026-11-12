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
import { CONTINUE, SKIP, visit } from 'unist-util-visit';
import { childNodes, toMetaName } from '../utils/hast.js';

export function toBlockCSSClassNames(value) {
  if (!value) return [];
  return value
    .split(',')
    .flatMap((val) => {
      const idx = val.lastIndexOf('(');
      return idx >= 0 ? [val.substring(0, idx), val.substring(idx + 1)] : [val];
    })
    .map((val) => val
      .toLowerCase()
      .trim()
      .replace(/[^0-9a-z]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, ''))
    .filter(Boolean);
}

function getValues(node, baseUrl) {
  const values = [];
  visit(node, (child) => {
    const url = (child.tagName === 'img' && child.properties?.src)
      || (child.tagName === 'a' && child.properties?.href);
    if (url) {
      try {
        values.push(baseUrl ? new URL(url, baseUrl).href : url);
      } catch {
        values.push(url);
      }
      return SKIP;
    }
    if (child.type === 'text') {
      values.push(...child.value.split(',').map((value) => value.trim()).filter(Boolean));
    }
    return CONTINUE;
  });
  return values.join(',');
}

function getStyleClasses(node) {
  const classes = [];
  visit(node, 'text', (child) => {
    classes.push(...toBlockCSSClassNames(child.value));
  });
  return classes;
}

export default function extractSectionMetadata(hast, { baseUrl } = {}) {
  const isSectionMetadata = (node) => node.tagName === 'div'
    && node.properties?.className?.includes('section-metadata');

  visit(hast, isSectionMetadata, (node, index, parent) => {
    for (const $row of childNodes(node)) {
      const $cells = $row.tagName === 'div' ? childNodes($row) : [];
      if ($cells[1]) {
        const [$name, $value] = $cells;
        const name = toMetaName(toString($name));
        if (name) {
          if (name === 'style') {
            if (!parent.properties.className) {
              parent.properties.className = [];
            }
            parent.properties.className.push(...getStyleClasses($value));
          } else {
            parent.properties[`data-${name}`] = getValues($value, baseUrl);
          }
        }
      }
    }
    parent.children.splice(index, 1);
    return SKIP;
  });
}
