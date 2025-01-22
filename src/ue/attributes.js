import { select, selectAll } from 'hast-util-select';
import {
  getBlockNameAndClasses,
  removeWhitespaceTextNodes,
} from '../utils/hast';
import { visit } from 'unist-util-visit';
import ClassList from 'hast-util-class-list';
const { isElement } = require('hast-util-is-element');

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
      const componentDef = getComponentDefinition(ueConfig, 'section');
      addAttributes(section, {
        'data-aue-resource': `urn:ab:section-${sIndex}`,
        'data-aue-type': 'container',
        'data-aue-label': componentDef ? componentDef.title : 'Section',
        'data-aue-model': 'section',
        'data-aue-behavior': 'component',
        'data-aue-filter': 'section',
      });

      section = wrapParagraphs(section);

      const blocks = selectAll(':scope>div', section);
      blocks.forEach((block, bIindex) => {
        const { name: blockName } = getBlockNameAndClasses(block);
        if (blockName) {
          if (blockName === 'richtext') {
            addAttributes(block, {
              'data-aue-resource': `urn:ab:section-${sIndex}/text-${bIindex}`,
              'data-aue-type': 'richtext',
              'data-aue-label': 'Text',
              'data-aue-prop': 'text',
              'data-aue-behavior': 'component'
            });
          } else if (blockName !== 'metadata') {
            const componentDef = getComponentDefinition(ueConfig, blockName);
            addAttributes(block, {
              'data-aue-resource': `urn:ab:section-${sIndex}/block-${bIindex}`,
              'data-aue-type': 'container',
              'data-aue-label': componentDef
                ? componentDef.title
                : `${blockName} Block`,
              'data-aue-model': blockName,
            });

            const filterDef = getFilterDefinition(ueConfig, blockName);
            if (filterDef) {
              addAttributes(block, {
                'data-aue-filter': blockName,
              });
            }
          }
        }
      });
    });
  }
}

export function removeUEAttributes(tree) {
  visit(tree, 'element', (node) => {
    if (node.properties) {
      Object.keys(node.properties).forEach((key) => {
        if (key.startsWith('dataAue')) {
          delete node.properties[key];
        }
      });
    }
  });
  return tree;
}

function addAttributes(node, attributes) {
  Object.entries(attributes).forEach(([name, value]) => {
    node.properties[name] = value;
  });
}

function getComponentDefinition(ueConfig, id) {
  const definitions = ueConfig['component-definition'];
  for (const group of definitions.groups) {
    const component = group.components.find((c) => c.id === id);
    if (component) {
      return component;
    }
  }
  return null;
}

function getFilterDefinition(ueConfig, id) {
  const filters = ueConfig['component-filter'];
  const filter = filters.find((f) => f.id === id);
  if (filter) {
    return filter;
  }
  return null;
}

function wrapParagraphs(section) {
  const wrappedSection = removeWhitespaceTextNodes(section);
  
  const newChildren = [];
  let currentWrapper = null;
  wrappedSection.children.forEach((child) => {
    if (isElement(child, 'div') || isElement(child, 'img')) {
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

export function unwrapParagraphs(tree) {
  visit(tree, 'element', (node, index, parent) => {
    // data-aue-type=\"richtext\"
    const properties = node.properties || {};
    if (node.tagName === 'div' && properties['data-aue-type'] === 'richtext') {
      if (parent && Array.isArray(parent.children)) {
        const childrenToInsert = node.children || [];
        parent.children.splice(index, 1, ...childrenToInsert);
      }
    }
  });
  return tree;
}
