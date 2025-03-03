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
import { fromHtml } from 'hast-util-from-html';
import { minifyWhitespace } from 'hast-util-minify-whitespace';

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

    it('adds UE attributes to richtext within sections', () => {
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
                    tagName: 'h1',
                    properties: {},
                    children: [ { type: 'text', value: 'Heading 1' } ],
                  },
                  {
                    type: 'element',
                    tagName: 'p',
                    properties: {},
                    children: [ { type: 'text', value: 'Paragraph 1' } ],
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
                { id: 'text', title: 'Text' }
              ],
            },
          ],
        },
      };

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const richTextDiv = select('main > div > div', bodyTree);
      assert.equal(richTextDiv.properties['data-aue-resource'], 'urn:ab:section-0/text-0');
      assert.equal(richTextDiv.properties['data-aue-type'], 'richtext');
      assert.equal(richTextDiv.properties['data-aue-label'], 'Text');
      assert.equal(richTextDiv.properties['data-aue-prop'], 'text');
    });

    it('adds UE attributes to pictures within sections', () => {
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
                    tagName: 'picture',
                    properties: {},
                    children: [
                      {
                        type: 'element',
                        tagName: 'img',
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
                { id: 'image', title: 'Image' }
              ],
            },
          ],
        },
      };

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const image = select('main > div > picture', bodyTree);
      assert.equal(image.properties['data-aue-resource'], 'urn:ab:section-0/asset-0');
      assert.equal(image.properties['data-aue-type'], 'media');
      assert.equal(image.properties['data-aue-label'], 'Image');
      assert.equal(image.properties['data-aue-model'], 'image');
    });

    it('adds UE attributes to block fields based on model definition', () => {
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
                      className: ['hero-block'],
                    },
                    children: [
                      {
                        type: 'element',
                        tagName: 'div',
                        properties: {},
                        children: [{ type: 'text', value: 'Hero Text' }],
                      },
                      {
                        type: 'element',
                        tagName: 'picture',
                        properties: {},
                        children: [
                          {
                            type: 'element',
                            tagName: 'img',
                            properties: {},
                            children: [],
                          },
                        ],
                      },
                      {
                        type: 'element',
                        tagName: 'div',
                        properties: {},
                        children: [{ type: 'text', value: 'Array Field' }],
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
                { id: 'hero-block', title: 'Hero Block' },
              ],
            },
          ],
        },
        'component-model': [
          {
            id: 'hero-block',
            title: 'Hero Block',
            fields: [
              {
                name: 'div:first-child',
                label: 'Hero Text',
                component: 'richtext',
              },
              {
                name: 'picture',
                label: 'Hero Image',
                component: 'reference',
              },
              {
                name: 'div:last-child',
                label: 'Array Field',
                component: 'text',
                name: 'array[0]',
              },
            ],
          },
        ],
      };

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const textField = select('main > div > div > div:first-child', bodyTree);
      assert.equal(textField.properties['data-aue-type'], 'richtext');
      assert.equal(textField.properties['data-aue-prop'], 'div:first-child');
      assert.equal(textField.properties['data-aue-label'], 'Hero Text');

      const imageField = select('main > div > div > picture', bodyTree);
      assert.equal(imageField.properties['data-aue-type'], 'media');
      assert.equal(imageField.properties['data-aue-prop'], 'picture');
      assert.equal(imageField.properties['data-aue-label'], 'Hero Image');

      const arrayField = select('main > div > div > div:last-child', bodyTree);
      assert.equal(arrayField.properties['data-aue-type'], undefined);
      assert.equal(arrayField.properties['data-aue-prop'], undefined);
      assert.equal(arrayField.properties['data-aue-label'], undefined);
    });

    it('handles whitespace text nodes in wrapParagraphs', () => {
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
                    tagName: 'h1',
                    properties: {},
                    children: [{ type: 'text', value: 'Heading 1' }],
                  },
                  {
                    type: 'element',
                    tagName: 'p',
                    properties: {},
                    children: [{ type: 'text', value: 'Paragraph 1' }],
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
                { id: 'text', title: 'Text' },
              ],
            },
          ],
        },
      };

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const section = select('main > div', bodyTree);
      assert.equal(section.children.length, 1);
      assert.equal(section.children[0].tagName, 'div');
      assert.equal(section.children[0].properties['data-aue-resource'], 'urn:ab:section-0/text-0');
      assert.equal(section.children[0].properties['data-aue-type'], 'richtext');
      assert.equal(section.children[0].properties['data-aue-label'], 'Text');
      assert.equal(section.children[0].children.length, 2);
      assert.equal(section.children[0].children[0].tagName, 'h1');
      assert.equal(section.children[0].children[1].tagName, 'p');
    });

    it('handles multiple consecutive richtext wrappers', () => {
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
                    tagName: 'h1',
                    properties: {},
                    children: [{ type: 'text', value: 'Heading 1' }],
                  },
                  {
                    type: 'element',
                    tagName: 'img',
                    properties: {},
                    children: [],
                  },
                  {
                    type: 'element',
                    tagName: 'p',
                    properties: {},
                    children: [{ type: 'text', value: 'Paragraph 1' }],
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
                { id: 'text', title: 'Text' },
                { id: 'image', title: 'Image' },
              ],
            },
          ],
        },
      };

      attributes.injectUEAttributes(bodyTree, ueConfig);

      const section = select('main > div', bodyTree);
      assert.equal(section.children.length, 3);
      assert.equal(section.children[0].tagName, 'div');
      assert.equal(section.children[0].properties['data-aue-resource'], 'urn:ab:section-0/text-0');
      assert.equal(section.children[0].properties['data-aue-type'], 'richtext');
      assert.equal(section.children[0].properties['data-aue-label'], 'Text');
      assert.equal(section.children[0].children.length, 1);
      assert.equal(section.children[0].children[0].tagName, 'h1');
      assert.equal(section.children[1].tagName, 'img');
      assert.equal(section.children[2].tagName, 'div');
      assert.equal(section.children[2].properties['data-aue-resource'], 'urn:ab:section-0/text-1');
      assert.equal(section.children[2].properties['data-aue-type'], 'richtext');
      assert.equal(section.children[2].properties['data-aue-label'], 'Text');
      assert.equal(section.children[2].children.length, 1);
      assert.equal(section.children[2].children[0].tagName, 'p');
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
    it('unwraps richtext div elements in main content', () => {

      let html = `
      <body>
        <header></header>
        <main>
          <div>
            <div data-aue-resource="urn:ab:section-0/text-0" data-aue-type="richtext" data-aue-label="Text" data-aue-prop="text" data-aue-behavior="component">
              <h1>Heading 1</h1>
              <p>Paragraph 1</p>
            </div>
            <div data-aue-resource="urn:ab:section-0/text-1" data-aue-type="richtext" data-aue-label="Text" data-aue-prop="text" data-aue-behavior="component">
              <p>Paragraph 2</p>
            </div>
          </div>  
        </main>
        <footer></footer>
      </body>
      `;

      const tree = fromHtml(html);
      minifyWhitespace(tree);
      const result = attributes.unwrapParagraphs(tree);
      const section = select('main > div', result);

      assert.equal(section.children.length, 3);
      assert.equal(section.children[0].tagName, 'h1');
      assert.equal(section.children[1].tagName, 'p');
      assert.equal(section.children[2].tagName, 'p');
      assert.equal(section.children[0].children[0].value, 'Heading 1');
      assert.equal(section.children[1].children[0].value, 'Paragraph 1');
      assert.equal(section.children[2].children[0].value, 'Paragraph 2');
    });

    it('unwraps richtext div elements combined with other elements', () => {
      let html = `
      <body>
        <header></header>
        <main>
          <div>
            <div data-aue-resource="urn:ab:section-0/text-0" data-aue-type="richtext" data-aue-label="Text" data-aue-prop="text" data-aue-behavior="component">
              <h1>Heading 1</h1>
              <p>Paragraph 1</p>
            </div>            
            <img src="https://placehold.co/600x400" />
            <div data-aue-resource="urn:ab:section-0/text-1" data-aue-type="richtext" data-aue-label="Text" data-aue-prop="text" data-aue-behavior="component">
              <p>Paragraph 2</p>
            </div>
          </div>  
        </main>
        <footer></footer>
      </body>
      `;

      const tree = fromHtml(html);
      minifyWhitespace(tree);
      const result = attributes.unwrapParagraphs(tree);
      
      const section = select('main > div', result);

      assert.equal(section.children.length, 4);
      assert.equal(section.children[0].tagName, 'h1');
      assert.equal(section.children[1].tagName, 'p');
      assert.equal(section.children[2].tagName, 'img');
      assert.equal(section.children[3].tagName, 'p');
    });

    it('does not unwrap richtext div elements within a block', () => {
      let html = `
      <body>
        <header></header>
        <main>
          <div>
            <div class="hero" data-aue-resource="urn:ab:section-0/block-0" data-aue-type="component" data-aue-label="Hero" data-aue-model="hero">
              <div>
                <div data-aue-type="richtext" data-aue-prop="1234" data-aue-label="Hero Text">
                  <h1>Heading 1</h1>
                  <p>Paragraph 1</p>
                  <p><a href="/adobe" title="Adobe"><em>Adobe</em></a></p>
                </div>            
              </div>
              <div>
                <div>
                  <img src="https://placehold.co/600x400" data-aue-type="media" data-aue-prop="1234" data-aue-label="Hero Image"/>
                </div>
              </div>
            </div>
          </div>  
        </main>
        <footer></footer>
      </body>
      `;

      const tree = fromHtml(html);
      minifyWhitespace(tree);
      const result = attributes.unwrapParagraphs(tree);
      
      const section = select('main > div', result);
      const block = section.children[0];
      assert.equal(block.children.length, 2);

      const cell1 = select('div > div:first-child > div', block);
      assert.equal(cell1.children.length, 3);
      assert.equal(cell1.tagName, 'div');

      const cell2 = select('div > div:last-child > div', block);
      assert.equal(cell2.children.length, 1);
      assert.equal(cell2.tagName, 'div');
    });
  });
}); 