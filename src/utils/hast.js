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
import { selectAll, select } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

export function childNodes(node) {
  return node.children.filter((n) => n.type === 'element');
}
/**
 * Converts all non-valid characters to `-`.
 * @param {string} text input text
 * @returns {string} the meta name
 */

export function toMetaName(text) {
  return text
    .toLowerCase()
    .replace(/[^0-9a-z:_]/gi, '-');
}
/**
 * Returns the config from a block element as object with key/value pairs.
 * @param {Element} $block The block element
 * @returns {object} The block config
 */
// TODO taken from https://github.com/adobe/helix-html-pipeline/blob/main/src/steps/extract-metadata.js
export function readBlockConfig($block) {
  const config = Object.create(null);
  selectAll(':scope>div', $block).forEach(($row) => {
    if ($row?.children[1]) {
      const [$name, $value] = selectAll(':scope>div', $row);
      const name = toMetaName(toString($name));
      if (name) {
        // special case for json-ld. don't apply any special formatting
        if (name.toLowerCase() === 'json-ld') {
          config[name] = toString($value).trim();
          return;
        }

        let value;
        const $firstChild = childNodes($value)[0];
        if ($firstChild) {
          // check for multiple paragraph or a list
          let list;
          const { tagName } = $firstChild;
          if (tagName === 'p') {
            // contains a list of <p> paragraphs
            list = childNodes($value);
          } else if (tagName === 'ul' || tagName === 'ol') {
            // contains a list
            list = childNodes($firstChild);
          }

          if (list) {
            value = list.map((child) => toString(child)).join(', ');
          }
        }

        if (!value) {
          // for text content only
          value = toString($value).trim().replace(/ {3}/g, ',');
        }

        if (!value) {
          // check for value inside link
          const $a = select('a', $value);
          if ($a) {
            value = $a.properties.href;
          }
        }
        if (!value) {
          // check for value inside img
          const $img = select('img', $value);
          if ($img) {
            // strip query string
            value = $img.properties.src;
          }
        }
        config[name] = value;
      }
    }
  });
  return config;
}

/**
 * Creates an element node with the specified tag name, properties, and children.
 *
 * @param {string} tagName - The name of the HTML tag for the element.
 * @param {Object} properties - An object representing the properties/attributes of the element.
 * @param {Array} [children=[]] - An array of child nodes for the element.
 * @returns {Object} The created element node.
 */
export function createElementNode(tagName, properties, children = []) {
  return {
    type: 'element',
    tagName,
    properties,
    children,
  };
}

export function removeWhitespaceTextNodes(tree) {
  visit(tree, 'text', (node, index, parent) => {
    if (parent && typeof node.value === 'string' && /^\s*$/.test(node.value)) {
      parent.children.splice(index, 1);
    }
  });
  return tree;
}

export function getBlockNameAndClasses(blockNode) {
  // eslint-disable-next-line no-param-reassign
  if (!blockNode.properties) blockNode.properties = {};
  // eslint-disable-next-line no-param-reassign
  if (!blockNode.properties.className) blockNode.properties.className = [];

  const blockConfig = { classes: [] };
  if (blockNode.properties.className) {
    const classes = [...blockNode.properties.className];
    blockConfig.name = classes.shift();
    blockConfig.classes.push(...blockNode.properties.className);
  }
  return blockConfig;
}
