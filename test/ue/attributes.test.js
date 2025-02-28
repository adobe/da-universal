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
    attributes = await esmock('../../src/ue/attributes.js');
  });

  describe('injectUEAttributes', () => {
    it('adds UE attributes to main content', () => {
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

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const main = select('main', bodyTree);      
      assert.equal(main.properties['data-aue-resource'], 'urn:ab:main');
      assert.equal(main.properties['data-aue-type'], 'container');
      assert.equal(main.properties['data-aue-label'], 'Main Content');
      assert.equal(main.properties['data-aue-filter'], 'main');
    });

    it('adds UE attributes to sections', () => {
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

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const section = select('main > div', bodyTree);
      assert.equal(section.properties['data-aue-resource'], 'urn:ab:section-0');
      assert.equal(section.properties['data-aue-type'], 'container');
      assert.equal(section.properties['data-aue-label'], 'Section');
      assert.equal(section.properties['data-aue-model'], 'section');
    });

    it('adds UE attributes to blocks within sections', () => {
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

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const block = select('main > div > div', bodyTree);
      assert.equal(block.properties['data-aue-resource'], 'urn:ab:section-0/block-0');
      assert.equal(block.properties['data-aue-type'], 'component');
      assert.equal(block.properties['data-aue-label'], 'Card Block');
      assert.equal(block.properties['data-aue-model'], 'card-block');
    });

    it('adds UE attributes to block items', () => {
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

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const blockItems = selectAll('main > div > div > div', bodyTree);
      assert.equal(blockItems[0].properties['data-aue-resource'], 'urn:ab:section-0/block-0/item-0');
      assert.equal(blockItems[0].properties['data-aue-type'], 'component');
      assert.equal(blockItems[0].properties['data-aue-label'], 'Card');
      assert.equal(blockItems[0].properties['data-aue-model'], 'card');
      assert.equal(blockItems[1].properties['data-aue-resource'], 'urn:ab:section-0/block-0/item-1');
      assert.equal(blockItems[1].properties['data-aue-type'], 'component');
      assert.equal(blockItems[1].properties['data-aue-label'], 'Card');
      assert.equal(blockItems[1].properties['data-aue-model'], 'card');
    });

    it('adds UE attributes to body for page metadata', () => {
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
        'component-model': [
          { id: 'page-metadata', title: 'Page Metadata' }
        ],
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

      attributes.injectUEAttributes(bodyTree, ueConfig);

      // Check body attributes for page metadata
      assert.equal(bodyTree.properties['data-aue-resource'], 'urn:ab:page');
      assert.equal(bodyTree.properties['data-aue-label'], 'Page');
      assert.equal(bodyTree.properties['data-aue-type'], 'component');
      assert.equal(bodyTree.properties['data-aue-model'], 'page-metadata');
    });

    it('does not add page metadata attributes when not defined in config', () => {
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

      attributes.injectUEAttributes(bodyTree, ueConfig);

      // Check that body doesn't have page metadata attributes
      assert.equal(bodyTree.properties['data-aue-resource'], undefined);
      assert.equal(bodyTree.properties['data-aue-label'], undefined);
      assert.equal(bodyTree.properties['data-aue-type'], undefined);
      assert.equal(bodyTree.properties['data-aue-model'], undefined);
    });
  });

  describe('removeUEAttributes', () => {
    it('removes all UE attributes from a tree', () => {
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

      const result = attributes.removeUEAttributes(tree);
      assert.equal(result.properties.dataAueResource, undefined);
      assert.equal(result.properties.dataAueType, undefined);
      assert.equal(result.properties.dataAueLabel, undefined);
      assert.equal(result.properties.id, 'section1'); // Non-UE attribute should remain
      assert.equal(result.properties.class, 'section'); // Non-UE attribute should remain

      const child = result.children[0];
      assert.equal(child.properties.dataAueResource, undefined);
      assert.equal(child.properties.dataAueType, undefined);
      assert.equal(child.properties.class, 'block'); // Non-UE attribute should remain
    });
  });

  describe('unwrapParagraphs', () => {
    it('unwraps richtext div elements', () => {
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

      const result = attributes.unwrapParagraphs(tree);
      assert.equal(result.children.length, 2);
      assert.equal(result.children[0].tagName, 'p');
      assert.equal(result.children[1].tagName, 'p');
      assert.equal(result.children[0].children[0].value, 'Paragraph 1');
      assert.equal(result.children[1].children[0].value, 'Paragraph 2');
    });

    it('unwraps richtext div elements combined with other elements', () => {
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
                tagName: 'picture',
                properties: {},
                children: [],
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

      const result = attributes.unwrapParagraphs(tree);
      assert.equal(result.children.length, 3);
      assert.equal(result.children[0].tagName, 'p');
      assert.equal(result.children[1].tagName, 'picture');
      assert.equal(result.children[2].tagName, 'p');
      assert.equal(result.children[0].children[0].value, 'Paragraph 1');
      assert.equal(result.children[2].children[0].value, 'Paragraph 2');
    });
  });
}); 