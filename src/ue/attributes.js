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
import { isElement } from 'hast-util-is-element';
import { h } from 'hastscript';
import {
  getBlockNameAndClasses,
  removeWhitespaceTextNodes,
} from '../utils/hast.js';

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
      // || isElement(child, 'img')
      // || isElement(child, 'picture')
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
        currentWrapper = h('div', { className: ['richtext'] });
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
 * Adds Universal Editor (UE) attributes to fields within a block component.
 * This function processes fields in a block component and adds appropriate UE attributes
 * based on the field type (richtext, reference, text).
 *
 * @param {Object} ueConfig - Configuration object containing UE component models
 * @param {Object} block - The block element to process
 */
function addBlockFieldAttributes(ueConfig, block) {
  const blockName = block.properties['data-aue-model'];
  const modelDef = getModelDefinition(ueConfig, blockName);
  if (modelDef) {
    const fields = modelDef.fields || [];
    const fieldsWithAttributes = fields.filter((field) => field.component === 'richtext' || field.component === 'reference' || (field.component === 'text' && field.name.indexOf('[') === -1));
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

function addColumnBehaviourInstrumentation(section, sIndex, block, bIndex, blockCmpDef, ueConfig) {
  const { name: blockName } = getBlockNameAndClasses(block);
  const cellFilterDef = getFilterDefinition(ueConfig, `${blockName}-cell`);

  // handle columns
  addAttributes(block, {
    'data-aue-resource': `urn:ab:section-${sIndex}/columns-${bIndex}`,
    'data-aue-label': blockCmpDef.title,
    'data-aue-model': blockName,
    'data-aue-filter': blockName,
    'data-aue-type': 'container',
    'data-aue-behavior': 'component',
  });

  const rows = selectAll(':scope>div', block);
  rows.forEach((row, rIndex) => {
    addAttributes(row, {
      'data-aue-resource': `urn:ab:section-${sIndex}/columns-${bIndex}/row-${rIndex}`,
      'data-aue-label': `${blockCmpDef.title} Row`,
      'data-aue-model': `${blockName}-row`,
      'data-aue-filter': `${blockName}-row`,
      'data-aue-type': 'container',
      'data-aue-behavior': 'component',
    });

    const cells = selectAll(':scope>div', row);
    cells.forEach((cell, cIndex) => {
      addAttributes(cell, {
        'data-aue-resource': `urn:ab:section-${sIndex}/columns-${bIndex}/row-${rIndex}/cell-${cIndex}`,
        'data-aue-label': `${blockCmpDef.title} Cell`,
        'data-aue-model': `${blockName}-cell`,
        'data-aue-filter': `${blockName}-cell`,
        'data-aue-type': 'container',
        'data-aue-behavior': 'component',
      });

      // add instrumentation to children of cell
      if (cellFilterDef?.components?.length > 0) {
        // handle images
        const images = selectAll(':scope>picture', cell);
        images.forEach((picture, iIndex) => {
          addAttributes(picture, {
            'data-aue-resource': `urn:ab:section-${sIndex}/columns-${bIndex}/row-${rIndex}/cell-${cIndex}/image-${iIndex}`,
            'data-aue-label': 'Image',
            'data-aue-behavior': 'component',
            'data-aue-prop': 'image',
            'data-aue-type': 'container',
            'data-aue-model': 'image',
          });
        });

        const wrappedCell = wrapParagraphs(cell);
        const richTextWrappers = selectAll(':scope>div.richtext', wrappedCell);
        richTextWrappers.forEach((wrapper, wIndex) => {
          addAttributes(wrapper, {
            'data-aue-resource': `urn:ab:section-${sIndex}/columns-${bIndex}/row-${rIndex}/cell-${cIndex}/text-${wIndex}`,
            'data-aue-type': 'richtext',
            'data-aue-label': 'Text',
            'data-aue-prop': 'root',
            'data-aue-behavior': 'component',
            'data-aue-filter': 'text',
          });
        });
      }
    });
  });
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
  // handle attributes for page metadata
  const pageMetaData = getModelDefinition(ueConfig, 'page-metadata');
  if (pageMetaData) {
    addAttributes(bodyTree, {
      'data-aue-resource': 'urn:ab:page',
      'data-aue-label': 'Page',
      'data-aue-type': 'component',
      'data-aue-model': 'page-metadata',
    });
  }

  // handle attributes for main content
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
          'data-aue-prop': 'root',
          'data-aue-behavior': 'component',
          'data-aue-filter': 'text',
        });
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
      blocks.forEach((block, bIndex) => {
        const { name: blockName } = getBlockNameAndClasses(block);

        if (!blockName) return;
        if (blockName === 'metadata' || blockName === 'section-metadata' || blockName === 'richtext') return;

        const blockCmpDef = getComponentDefinition(ueConfig, blockName);
        const filterDef = getFilterDefinition(ueConfig, blockName);

        if (blockCmpDef?.plugins?.da?.behaviour === 'columns') {
          addColumnBehaviourInstrumentation(section, sIndex, block, bIndex, blockCmpDef, ueConfig);
          return;
        }

        addAttributes(block, {
          'data-aue-resource': `urn:ab:section-${sIndex}/block-${bIndex}`,
          'data-aue-type': 'component',
          'data-aue-label': blockCmpDef
            ? blockCmpDef.title
            : `${blockName} (no definition)`,
          'data-aue-model': blockName,
        });
        addBlockFieldAttributes(ueConfig, block);

        // apply block flter and child items
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
                'data-aue-resource': `urn:ab:section-${sIndex}/block-${bIndex}/item-${biIndex}`,
                'data-aue-type': 'component',
                'data-aue-label': itemCmpDef.title,
                'data-aue-model': itemCmpDef.id,
              });
              addBlockFieldAttributes(ueConfig, blockItem);
            });
          }
        }
      });
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
    if (node.tagName === 'div' && properties.dataAueType === 'richtext' && properties.dataAueResource) {
      if (parent && Array.isArray(parent.children)) {
        const childrenToInsert = node.children || [];
        parent.children.splice(index, 1, ...childrenToInsert);
      }
    }
  });
  return tree;
}
