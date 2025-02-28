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

import assert from 'assert';
import { describe, it, before } from 'mocha';
import esmock from 'esmock';
import { select, selectAll } from 'hast-util-select';

describe('UE attributes', () => {
  let attributes;

  before(async () => {
    // Use the actual module with real dependencies
    attributes = await esmock('../../src/ue/attributes.js');
  });

  describe('injectUEAttributes', () => {
    it('adds UE attributes to main content', () => {
      // Create a simple body tree with a main element
      const bodyTree = {
        type: 'element',
        tagName: 'body',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'main',
            properties: {},
            children: [],
          },
        ],
      };

      const ueConfig = {
        'component-definition': {
          groups: [
            {
              components: [
                { id: 'section', title: 'Section' },
              ],
            },
          ],
        },
      };

      // Apply UE attributes
      attributes.injectUEAttributes(bodyTree, ueConfig);

      // Get the main element
      const main = select('main', bodyTree);
      
      // Assert that UE attributes were added
      assert.equal(main.properties['data-aue-resource'], 'urn:ab:main');
      assert.equal(main.properties['data-aue-type'], 'container');
      assert.equal(main.properties['data-aue-label'], 'Main Content');
      assert.equal(main.properties['data-aue-filter'], 'main');
    });

    it('adds UE attributes to sections', () => {
      // Create a body tree with main and a section
      const bodyTree = {
        type: 'element',
        tagName: 'body',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'main',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: {},
                children: [],
              },
            ],
          },
        ],
      };

      const ueConfig = {
        'component-definition': {
          groups: [
            {
              components: [
                { id: 'section', title: 'Section' },
              ],
            },
          ],
        },
      };

      // Apply UE attributes
      attributes.injectUEAttributes(bodyTree, ueConfig);

      // Get the section
      const section = select('main > div', bodyTree);
      
      // Assert that section attributes were added
      assert.equal(section.properties['data-aue-resource'], 'urn:ab:section-0');
      assert.equal(section.properties['data-aue-type'], 'container');
      assert.equal(section.properties['data-aue-label'], 'Section');
      assert.equal(section.properties['data-aue-model'], 'section');
    });

    it('adds UE attributes to blocks within sections', () => {
      // Create a body tree with main, section, and a block
      const bodyTree = {
        type: 'element',
        tagName: 'body',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'main',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'div', // section
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'div', // block
                    properties: {
                      className: ['card-block'],
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const ueConfig = {
        'component-definition': {
          groups: [
            {
              components: [
                { id: 'section', title: 'Section' },
                { id: 'card-block', title: 'Card Block' },
              ],
            },
          ],
        },
      };

      // Apply UE attributes
      attributes.injectUEAttributes(bodyTree, ueConfig);

      // Get the block
      const block = select('main > div > div', bodyTree);
      
      // Assert that block attributes were added
      assert.equal(block.properties['data-aue-resource'], 'urn:ab:section-0/block-0');
      assert.equal(block.properties['data-aue-type'], 'component');
      assert.equal(block.properties['data-aue-label'], 'Card Block');
      assert.equal(block.properties['data-aue-model'], 'card-block');
    });

    it('adds UE attributes to block items', () => {
      // Create a body tree with main, section, block, and block items
      const bodyTree = {
        type: 'element',
        tagName: 'body',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'main',
            properties: {},
            children: [
              {
                type: 'element',
                tagName: 'div', // section
                properties: {},
                children: [
                  {
                    type: 'element',
                    tagName: 'div', // block
                    properties: {
                      className: ['cards'],
                    },
                    children: [
                      {
                        type: 'element',
                        tagName: 'div', // block item
                        properties: {},
                        children: [],
                      },
                      {
                        type: 'element',
                        tagName: 'div', // block item
                        properties: {},
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const ueConfig = {
        'component-definition': {
          groups: [
            {
              components: [
                { id: 'section', title: 'Section' },
                { id: 'cards', title: 'Cards' },
                { id: 'card', title: 'Card' },
              ],
            },
          ],
        },
        'component-filter': [
          {
            id: 'cards',
            components: ['card'],
          },
        ],
      };

      // Apply UE attributes
      attributes.injectUEAttributes(bodyTree, ueConfig);

      // Get the block items
      const blockItems = selectAll('main > div > div > div', bodyTree);
      
      // Assert that block item attributes were added
      assert.equal(blockItems[0].properties['data-aue-resource'], 'urn:ab:section-0/block-0/item-0');
      assert.equal(blockItems[0].properties['data-aue-type'], 'component');
      assert.equal(blockItems[0].properties['data-aue-label'], 'Card');
      assert.equal(blockItems[0].properties['data-aue-model'], 'card');
      
      assert.equal(blockItems[1].properties['data-aue-resource'], 'urn:ab:section-0/block-0/item-1');
      assert.equal(blockItems[1].properties['data-aue-type'], 'component');
      assert.equal(blockItems[1].properties['data-aue-label'], 'Card');
      assert.equal(blockItems[1].properties['data-aue-model'], 'card');
    });
  });

  describe('removeUEAttributes', () => {
    it('removes all UE attributes from a tree', () => {
      // Create a tree with UE attributes
      const tree = {
        type: 'element',
        tagName: 'div',
        properties: {
          dataAueResource: 'urn:ab:section-0',
          dataAueType: 'container',
          dataAueLabel: 'Section',
          id: 'section1',
          class: 'section',
        },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: {
              dataAueResource: 'urn:ab:section-0/block-0',
              dataAueType: 'component',
              class: 'block',
            },
            children: [],
          },
        ],
      };

      // Remove UE attributes
      const result = attributes.removeUEAttributes(tree);

      // Assert that UE attributes were removed
      assert.equal(result.properties.dataAueResource, undefined);
      assert.equal(result.properties.dataAueType, undefined);
      assert.equal(result.properties.dataAueLabel, undefined);
      assert.equal(result.properties.id, 'section1'); // Non-UE attribute should remain
      assert.equal(result.properties.class, 'section'); // Non-UE attribute should remain

      // Check child element
      const child = result.children[0];
      assert.equal(child.properties.dataAueResource, undefined);
      assert.equal(child.properties.dataAueType, undefined);
      assert.equal(child.properties.class, 'block'); // Non-UE attribute should remain
    });
  });

  describe('unwrapParagraphs', () => {
    it('unwraps richtext div elements', () => {
      // Create a tree with richtext divs
      const tree = {
        type: 'element',
        tagName: 'div',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: {
              dataAueType: 'richtext',
            },
            children: [
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: [
                  {
                    type: 'text',
                    value: 'Paragraph 1',
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'p',
                properties: {},
                children: [
                  {
                    type: 'text',
                    value: 'Paragraph 2',
                  },
                ],
              },
            ],
          },
        ],
      };

      // Unwrap paragraphs
      const result = attributes.unwrapParagraphs(tree);

      // Assert that richtext div was unwrapped
      assert.equal(result.children.length, 2);
      assert.equal(result.children[0].tagName, 'p');
      assert.equal(result.children[1].tagName, 'p');
      
      // Check text content
      assert.equal(result.children[0].children[0].value, 'Paragraph 1');
      assert.equal(result.children[1].children[0].value, 'Paragraph 2');
    });
  });
}); 