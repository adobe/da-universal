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

/* eslint-env mocha */

import assert from 'assert';
import { describe, it } from 'mocha';
import esmock from 'esmock';
import { fromHtml } from 'hast-util-from-html';
import { select } from 'hast-util-select';

describe('hast utilities', () => {
  let utils;

  before(async () => {
    utils = await esmock('../../src/utils/hast.js');
  });

  describe('childNodes', () => {
    it('filters non-element nodes', () => {
      const node = {
        children: [
          { type: 'element', tagName: 'div' },
          { type: 'text', value: 'text' },
          { type: 'element', tagName: 'span' },
        ],
      };
      const result = utils.childNodes(node);
      assert.equal(result.length, 2);
      assert(result.every((n) => n.type === 'element'));
    });
  });

  describe('toMetaName', () => {
    it('converts invalid characters to hyphens', () => {
      assert.equal(utils.toMetaName('Hello World!'), 'hello-world-');
      assert.equal(utils.toMetaName('Test_123'), 'test_123');
      assert.equal(utils.toMetaName('Special@#Characters'), 'special--characters');
    });

    it('ignores surrounding whitespace', () => {
      assert.equal(utils.toMetaName('\n          title\n        '), 'title');
    });
  });

  describe('readBlockConfig', () => {
    it('reads names from indented (source bus) html', () => {
      // Helix 6 stores documents pretty-printed, so cells contain whitespace text nodes
      const tree = fromHtml(`
    <div class="metadata">
      <div>
        <div>
          <p>title</p>
        </div>
        <div>
          <p>Already investing in Canada</p>
        </div>
      </div>
      <div>
        <div>
          <p>Template</p>
        </div>
        <div>
          <p>article</p>
        </div>
      </div>
    </div>`, { fragment: true });

      const config = utils.readBlockConfig(select('div.metadata', tree));

      assert.deepStrictEqual({ ...config }, {
        title: 'Already investing in Canada',
        template: 'article',
      });
    });
  });

  describe('removeWhitespaceTextNodes', () => {
    it('removes whitespace text nodes', () => {
      const tree = {
        type: 'root',
        children: [
          { type: 'text', value: '   ' },
          { type: 'element', tagName: 'div' },
          { type: 'text', value: '\n  ' },
        ],
      };

      const result = utils.removeWhitespaceTextNodes(tree);
      assert.equal(result.children.length, 1);
      assert.equal(result.children[0].type, 'element');
    });

    it('preserves non-whitespace text nodes', () => {
      const tree = {
        type: 'root',
        children: [
          { type: 'text', value: 'Hello' },
          { type: 'text', value: '   ' },
          { type: 'text', value: 'World' },
        ],
      };

      const result = utils.removeWhitespaceTextNodes(tree);
      assert.equal(result.children.length, 2);
      assert.equal(result.children[0].value, 'Hello');
      assert.equal(result.children[1].value, 'World');
    });
  });

  describe('getBlockNameAndClasses', () => {
    it('extracts block name and classes from className property', () => {
      const blockNode = {
        properties: {
          className: ['block-name', 'class1', 'class2'],
        },
      };

      const result = utils.getBlockNameAndClasses(blockNode);
      assert.deepEqual(result, {
        name: 'block-name',
        classes: ['block-name', 'class1', 'class2'],
      });
    });
  });
});
