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
import { select, selectAll } from 'hast-util-select';
import { visit } from 'unist-util-visit';
import {
  getBlockNameAndClasses,
  removeWhitespaceTextNodes,
} from '../utils/hast.js';

const { isElement } = require('hast-util-is-element');

function addAttributes(node, attributes) {
  Object.entries(attributes).forEach(([name, value]) => {
    // eslint-disable-next-line no-param-reassign
    node.properties[name] = value;
  });
}

function getComponentDefinition(ueConfig, id) {
  const groups = ueConfig['component-definition']?.groups || [];
  return groups.flatMap((group) => group.components).find((c) => c.id === id) || null;
}

function getFilterDefinition(ueConfig, id) {
  return ueConfig['component-filter']?.find((f) => f.id === id) || null;
}

function getModelDefinition(ueConfig, id) {
  return ueConfig['component-model']?.find((m) => m.id === id) || null;
}

function wrapParagraphs(section) {
  const wrappedSection = removeWhitespaceTextNodes(section);

  const newChildren = [];
  let currentWrapper = null;
  wrappedSection.children.forEach((child) => {
    if (
      isElement(child, 'div')
      || isElement(child, 'img')
      || isElement(child, 'picture')
    ) {
      // End the current wrapper if it exists
      if (currentWrapper) {
        newChildren.push(currentWrapper);
        currentWrapper = null;
      }
      // Add the div or img directly
      newChildren.push(child);
    } else {
      // Add to the current wrapper, or create a new one
      if (!currentWrapper) {
        currentWrapper = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['richtext'] },
          children: [],
        };
      }
      currentWrapper.children.push(child);
    }
  });

  // Add the last wrapper if it exists
  if (currentWrapper) {
    newChildren.push(currentWrapper);
  }

  wrappedSection.children = newChildren;
  return wrappedSection;
}

/**
 * Injects Universal Editor (UE) attributes into the HTML body tree.
 * This function adds data attributes to various elements in the body to enable UE functionality:
 * - Adds container attributes to the main content area
 * - Processes sections and adds section-specific attributes
 * - Handles rich text content by wrapping paragraphs and adding text attributes
 * - Processes images and adds media-related attributes
 * - Handles blocks and adds component/filter attributes based on block type
 *
 * @param {Object} bodyTree - The HTML body tree to process
 * @param {Object} ueConfig - Configuration object containing UE component definitions and filters
 */
export function injectUEAttributes(bodyTree, ueConfig) {
  const mainTree = select('main', bodyTree);
  if (mainTree) {
    addAttributes(mainTree, {
      'data-aue-resource': 'urn:ab:main',
      'data-aue-type': 'container',
      'data-aue-label': 'Main Content',
      'data-aue-filter': 'main',
    });

    const sections = selectAll(':scope>div', mainTree);
    sections.forEach((section, sIndex) => {
      // Add section attributes
      const componentDef = getComponentDefinition(ueConfig, 'section');
      addAttributes(section, {
        'data-aue-resource': `urn:ab:section-${sIndex}`,
        'data-aue-type': 'container',
        'data-aue-label': componentDef ? componentDef.title : 'Section',
        'data-aue-model': 'section',
        'data-aue-behavior': 'component',
        'data-aue-filter': 'section',
      });

      // handle rich text
      // eslint-disable-next-line no-param-reassign
      section = wrapParagraphs(section);
      const richTextWrappers = selectAll(':scope>div.richtext', section);
      richTextWrappers.forEach((wrapper, wIndex) => {
        addAttributes(wrapper, {
          'data-aue-resource': `urn:ab:section-${sIndex}/text-${wIndex}`,
          'data-aue-type': 'richtext',
          'data-aue-label': 'Text',
          'data-aue-prop': 'text',
          'data-aue-behavior': 'component',
        });
        // eslint-disable-next-line no-param-reassign
        delete wrapper.properties.className;
      });

      // handle images
      const images = selectAll(':scope>picture', section);
      images.forEach((picture, iIndex) => {
        addAttributes(picture, {
          'data-aue-resource': `urn:ab:section-${sIndex}/asset-${iIndex}`,
          'data-aue-label': 'Image',
          'data-aue-behavior': 'component',
          'data-aue-prop': 'image',
          'data-aue-type': 'media',
          'data-aue-model': 'image',
        });
        // TODO wait for SITES-27973
        // const img = select('img', picture);
        // addAttributes(img, {
        //   'data-aue-prop': 'image',
        //   'data-aue-type': 'media'
        // });
      });

      // handle blocks
      const blocks = selectAll(':scope>div', section);
      blocks.forEach((block, bIindex) => {
        const { name: blockName } = getBlockNameAndClasses(block);
        if (blockName) {
          if (blockName !== 'metadata' && blockName !== 'section-metadata') {
            const blockCmpDef = getComponentDefinition(ueConfig, blockName);
            addAttributes(block, {
              'data-aue-resource': `urn:ab:section-${sIndex}/block-${bIindex}`,
              'data-aue-type': 'component',
              'data-aue-label': blockCmpDef
                ? blockCmpDef.title
                : `${blockName} (no definition)`,
              'data-aue-model': blockName,
            });
            addBlockFieldAttributes(ueConfig, block);

            // apply block flter and child items
            const filterDef = getFilterDefinition(ueConfig, blockName);
            if (filterDef) {
              addAttributes(block, {
                'data-aue-filter': blockName,
                'data-aue-type': 'container',
                'data-aue-behavior': 'component',
              });

              const itemId = filterDef.components[0];
              const itemCmpDef = getComponentDefinition(ueConfig, itemId);
              if (itemCmpDef) {
                const blockItems = selectAll(':scope>div', block);
                blockItems.forEach((blockItem, biIndex) => {
                  addAttributes(blockItem, {
                    'data-aue-resource': `urn:ab:section-${sIndex}/block-${bIindex}/item-${biIndex}`,
                    'data-aue-type': 'component',
                    'data-aue-label': itemCmpDef.title,
                    'data-aue-model': itemCmpDef.id,
                  });
                  addBlockFieldAttributes(ueConfig, blockItem);
                });
              }
            }
          }
        }
      });
    });
  }
}

function addBlockFieldAttributes(ueConfig, block) {
  const blockName = block.properties['data-aue-model'];
  const modelDef = getModelDefinition(ueConfig, blockName);
  if (modelDef) {
    const fields = modelDef.fields || [];
    const fieldsWithAttributes = fields.filter((field) => field.component === 'richtext' || field.component === 'reference');
    fieldsWithAttributes.forEach((field) => {
      const blockFieldTag = select(field.name, block);
      if (blockFieldTag) {
        addAttributes(blockFieldTag, {
          'data-aue-type': field.component === 'reference' ? 'media' : field.component,
          'data-aue-prop': field.name,
          'data-aue-label': field.label || field.name,
        });
      }
    });
  }
}

/**
 * Removes all Universal Editor attributes from a HAST tree
 * @param {object} tree The HAST tree to process
 * @returns {object} The processed HAST tree
 */
export function removeUEAttributes(tree) {
  visit(tree, 'element', (node) => {
    if (node.properties) {
      Object.keys(node.properties).forEach((key) => {
        if (key.startsWith('dataAue')) {
          // eslint-disable-next-line no-param-reassign
          delete node.properties[key];
        }
      });
    }
  });
  return tree;
}

/**
 * Unwraps richtext div elements by moving their children up to the parent level
 * @param {object} tree The HAST tree to process
 * @returns {object} The processed HAST tree
 */
export function unwrapParagraphs(tree) {
  visit(tree, 'element', (node, index, parent) => {
    // data-aue-type=\"richtext\"
    const properties = node.properties || {};
    if (node.tagName === 'div' && properties.dataAueType === 'richtext') {
      if (parent && Array.isArray(parent.children)) {
        const childrenToInsert = node.children || [];
        parent.children.splice(index, 1, ...childrenToInsert);
      }
    }
  });
  return tree;
}
