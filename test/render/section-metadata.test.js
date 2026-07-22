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

/* eslint-env mocha */

import assert from 'assert';
import { describe, it, before } from 'mocha';
import esmock from 'esmock';
import { h } from 'hastscript';
import { selectAll } from 'hast-util-select';

function makeRow(key, value) {
  return h('div', {}, [
    h('div', {}, [{ type: 'text', value: key }]),
    h('div', {}, [{ type: 'text', value }]),
  ]);
}

function makeSectionMetadataBlock(...rows) {
  return h('div', { className: ['section-metadata'] }, rows);
}

function makeSection(...children) {
  return h('div', {}, children);
}

describe('extractSectionMetadata', () => {
  let extractSectionMetadata;
  let toBlockCSSClassNames;

  before(async () => {
    ({ default: extractSectionMetadata, toBlockCSSClassNames } = await esmock('../../src/render/section-metadata.js'));
  });

  describe('toBlockCSSClassNames', () => {
    it('converts a single value to a class name', () => {
      assert.deepStrictEqual(toBlockCSSClassNames('highlight'), ['highlight']);
    });

    it('converts multiple comma-separated values', () => {
      assert.deepStrictEqual(toBlockCSSClassNames('highlight, dark'), ['highlight', 'dark']);
    });

    it('lowercases values', () => {
      assert.deepStrictEqual(toBlockCSSClassNames('Highlight'), ['highlight']);
    });

    it('replaces non-alphanumeric characters with hyphens', () => {
      assert.deepStrictEqual(toBlockCSSClassNames('section margin'), ['section-margin']);
    });

    it('strips leading and trailing hyphens', () => {
      assert.deepStrictEqual(toBlockCSSClassNames(' highlight '), ['highlight']);
    });

    it('returns empty array for empty string', () => {
      assert.deepStrictEqual(toBlockCSSClassNames(''), []);
    });

    it('returns empty array for falsy value', () => {
      assert.deepStrictEqual(toBlockCSSClassNames(null), []);
    });
  });

  describe('extractSectionMetadata', () => {
    it('removes section-metadata block from parent section', () => {
      const section = makeSection(
        makeSectionMetadataBlock(makeRow('style', 'highlight')),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.equal(section.children.length, 0);
    });

    it('applies style value as CSS class on parent section', () => {
      const section = makeSection(
        makeSectionMetadataBlock(makeRow('style', 'highlight')),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.ok(section.properties.className.includes('highlight'));
    });

    it('applies multiple style values as CSS classes', () => {
      const section = makeSection(
        makeSectionMetadataBlock(makeRow('style', 'highlight, dark')),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.ok(section.properties.className.includes('highlight'));
      assert.ok(section.properties.className.includes('dark'));
    });

    it('preserves existing classes on section when applying style', () => {
      const section = h('div', { className: ['existing'] }, [
        makeSectionMetadataBlock(makeRow('style', 'highlight')),
      ]);
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.ok(section.properties.className.includes('existing'));
      assert.ok(section.properties.className.includes('highlight'));
    });

    it('applies non-style metadata as data attributes', () => {
      const section = makeSection(
        makeSectionMetadataBlock(makeRow('background', 'blue')),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.equal(section.properties['data-background'], 'blue');
    });

    it('converts metadata key to meta name format for data attribute', () => {
      const section = makeSection(
        makeSectionMetadataBlock(makeRow('Section Margin', '0')),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.equal(section.properties['data-section-margin'], '0');
    });

    it('handles multiple metadata rows', () => {
      const section = makeSection(
        makeSectionMetadataBlock(
          makeRow('style', 'highlight'),
          makeRow('background', 'blue'),
          makeRow('Section Margin', '0'),
        ),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.ok(section.properties.className.includes('highlight'));
      assert.equal(section.properties['data-background'], 'blue');
      assert.equal(section.properties['data-section-margin'], '0');
      assert.equal(section.children.length, 0);
    });

    it('processes multiple sections independently', () => {
      const section1 = makeSection(
        makeSectionMetadataBlock(makeRow('style', 'highlight')),
      );
      const section2 = makeSection(
        makeSectionMetadataBlock(makeRow('background', 'red')),
      );
      const hast = h('div', {}, [section1, section2]);

      extractSectionMetadata(hast);

      assert.ok(section1.properties.className.includes('highlight'));
      assert.equal(section1.children.length, 0);
      assert.equal(section2.properties['data-background'], 'red');
      assert.equal(section2.children.length, 0);
    });

    it('leaves sections without section-metadata unchanged', () => {
      const section = makeSection(
        h('div', { className: ['hero'] }, []),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.equal(section.children.length, 1);
      assert.equal(selectAll('.hero', hast).length, 1);
    });

    it('skips rows without a value column', () => {
      const section = makeSection(
        h('div', { className: ['section-metadata'] }, [
          h('div', {}, [h('div', {}, [{ type: 'text', value: 'style' }])]),
        ]),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      assert.equal(section.children.length, 0);
    });

    it('skips rows with empty key', () => {
      const section = makeSection(
        makeSectionMetadataBlock(makeRow('', 'blue')),
      );
      const hast = h('div', {}, [section]);

      extractSectionMetadata(hast);

      const dataAttrs = Object.keys(section.properties).filter((k) => k.startsWith('data-'));
      assert.equal(dataAttrs.length, 0);
    });

    it('handles section-metadata block with no children', () => {
      const section = makeSection(
        h('div', { className: ['section-metadata'] }, []),
      );
      const hast = h('div', {}, [section]);

      assert.doesNotThrow(() => extractSectionMetadata(hast));
      assert.equal(section.children.length, 0);
    });
  });
});
