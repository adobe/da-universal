/*
 * Copyright 2026 Adobe. All rights reserved.
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
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { select, selectAll } from 'hast-util-select';
import * as quickEdit from '../../src/utils/quick-edit.js';

describe('quick-edit head injection', () => {
  describe('prepareQuickEditDocument', () => {
    const countImportMaps = (html) => (html.match(/type\s*=\s*["']importmap["']/gi) || []).length;

    it('injects import map at the start of head and adds a module initializer', () => {
      const html = '<html><head><script src="/scripts/scripts.js" type="module"></script></head><body></body></html>';
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.ok(out.includes('<head><script type="importmap">'));
      assert.ok(out.includes('"da-lit"'));
      const tree = fromHtml(out);
      const initializer = select('head script[src$="/quick-edit-init.js"]', tree);
      assert.strictEqual(initializer.properties.type, 'module');
      assert.strictEqual(
        initializer.properties.src,
        'https://da.live/nx/public/plugins/quick-edit/quick-edit-init.js',
      );
      assert.ok(out.indexOf('importmap') < out.indexOf('quick-edit-init.js'));
    });

    it('injects import map before module scripts in head', () => {
      const html = '<html><head><script src="/scripts/scripts.js" type="module"></script></head></html>';
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      const mapPos = out.indexOf('importmap');
      const scriptPos = out.indexOf('scripts.js');
      assert.ok(mapPos < scriptPos, 'import map should precede entry module script');
    });

    it('inserts import map into implicit head when source has no head tag', () => {
      const html = '<html><body>Content</body></html>';
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.ok(out.includes('<head><script type="importmap">'));
    });

    it('merges import map in place and keeps a single import map', () => {
      const existingMap = {
        imports: { 'existing-package': 'https://example.com/existing.js' },
      };
      const html = `<html><head><script type="importmap">${JSON.stringify(existingMap)}</script></head><body></body></html>`;
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('"existing-package"'));
      assert.ok(out.includes('"da-y-wrapper"'));
    });

    it('merges and overwrites existing import map with quick-edit imports', () => {
      const existingMap = {
        imports: {
          'da-lit': 'https://old.com/lit.js',
          other: 'https://other.com/other.js',
        },
      };
      const html = `<html><head><script type="importmap">${JSON.stringify(existingMap)}</script></head></html>`;
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('"da-lit":"https://da.live/deps/lit/dist/index.js"'));
      assert.ok(out.includes('"other":"https://other.com/other.js"'));
    });

    it('preserves nonce and scopes on import map merge', () => {
      const existingMap = {
        imports: { 'da-parser': '/deps/da-parser/dist/index.js' },
        scopes: { '/blocks/': { 'local-dep': './dep.js' } },
      };
      const html = `<html><head><script nonce="aem" type="importmap">${JSON.stringify(existingMap)}</script></head></html>`;
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.ok(out.includes('nonce="aem"'));
      assert.ok(out.includes('"scopes"'));
      assert.ok(out.includes('"da-parser"'));
      assert.ok(out.includes('"da-y-wrapper"'));
    });

    it('does not duplicate import map entries when quick-edit entries are already present', () => {
      const map = {
        imports: {
          'da-lit': 'https://da.live/deps/lit/dist/index.js',
          'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
        },
      };
      const html = `<html><head><script type="importmap">${JSON.stringify(map)}</script></head></html>`;
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('"da-lit"'));
      assert.ok(out.includes('"da-y-wrapper"'));
    });

    it('replaces invalid existing import map in place', () => {
      const html = '<html><head><script nonce="x" type="importmap">invalid json</script></head></html>';
      const { html: out } = quickEdit.prepareQuickEditDocument(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('nonce="x"'));
      assert.ok(out.includes('"da-lit"'));
    });

    it('applies the CSP nonce to injected scripts but not author scripts', () => {
      const html = '<html><head><script src="/scripts/scripts.js" type="module"></script></head><body></body></html>';
      const { html: out } = quickEdit.prepareQuickEditDocument(html, 'abc123');
      const tree = fromHtml(out);
      assert.strictEqual(select('head script[type="importmap"]', tree).properties.nonce, 'abc123');
      assert.strictEqual(select('head script[src$="/quick-edit-init.js"]', tree).properties.nonce, 'abc123');
      assert.strictEqual(select('head script[src="/scripts/scripts.js"]', tree).properties.nonce, undefined);
    });

    it('does not apply the CSP nonce to an existing author import map', () => {
      const html = '<html><head><script type="importmap">{"imports":{"author":"/author.js"}}</script></head></html>';
      const { html: out } = quickEdit.prepareQuickEditDocument(html, 'abc123');
      const tree = fromHtml(out);
      assert.strictEqual(select('head script[type="importmap"]', tree).properties.nonce, undefined);
      assert.strictEqual(select('head script[src$="/quick-edit-init.js"]', tree).properties.nonce, 'abc123');
    });
  });

  describe('applyQuickEditToDocument', () => {
    it('injects a nonced import map and initializer without changing site scripts', () => {
      const tree = fromHtml('<html><head><script src="/scripts/scripts.js" type="module"></script></head><body></body></html>');
      quickEdit.applyQuickEditToDocument(tree, 'abc123');
      const out = toHtml(tree, { allowDangerousHtml: true });
      assert.ok(out.includes('<head><script type="importmap" nonce="abc123"'));
      assert.ok(out.includes('"da-lit"'));
      assert.ok(!out.includes('<script src="/scripts/scripts.js" type="module" nonce='));
    });

    it('injects the initializer even when there is no site entry script', () => {
      const tree = fromHtml('<html><head></head><body>content</body></html>');
      quickEdit.applyQuickEditToDocument(tree, undefined);
      const out = toHtml(tree, { allowDangerousHtml: true });
      assert.ok(out.includes('"da-y-wrapper"'));
      assert.ok(select('head script[src$="/quick-edit-init.js"]', tree));
      // no nonce stamped when none is provided
      assert.ok(!out.includes('nonce='));
    });

    [
      'quick-edit-init.js',
      '/tools/quick-edit-init.js?v=2#init',
      'https://da.live/nx/public/plugins/quick-edit/quick-edit-init.js',
      '//example.com/quick-edit-init.js',
    ].forEach((src) => {
      it(`leaves the entire document unchanged when it already loads ${src}`, () => {
        const tree = fromHtml(`<html><head><script type="importmap">{"imports":{"author":"/author.js"}}</script><script type="module" src="${src}"></script></head><body></body></html>`);
        const before = toHtml(tree);
        quickEdit.applyQuickEditToDocument(tree, 'abc123');
        assert.strictEqual(toHtml(tree), before);
      });
    });

    it('recognizes an existing initializer in the body', () => {
      const tree = fromHtml('<html><head></head><body><script type="module" src="/quick-edit-init.js"></script></body></html>');
      const before = toHtml(tree);
      quickEdit.applyQuickEditToDocument(tree);
      assert.strictEqual(toHtml(tree), before);
    });

    it('does not mistake a similar filename for the initializer', () => {
      const tree = fromHtml('<html><head><script src="/not-quick-edit-init.js"></script><script src="/quick-edit-init.js.bak"></script></head><body></body></html>');
      quickEdit.applyQuickEditToDocument(tree);
      assert.ok(select('head script[src="https://da.live/nx/public/plugins/quick-edit/quick-edit-init.js"]', tree));
    });

    [
      '/loader.js?module=/quick-edit-init.js',
      '/loader.js#/quick-edit-init.js',
      'https://quick-edit-init.js',
      'https://[invalid',
    ].forEach((src) => {
      it(`does not suppress injection for an unrelated script ${src}`, () => {
        const tree = fromHtml(`<html><head><script src="${src}"></script></head><body></body></html>`);
        quickEdit.applyQuickEditToDocument(tree);
        assert.ok(select('head script[src="https://da.live/nx/public/plugins/quick-edit/quick-edit-init.js"]', tree));
        assert.ok(select('head script[type="importmap"]', tree));
      });
    });

    it('does not inject twice when applied repeatedly', () => {
      const tree = fromHtml('<html><head></head><body></body></html>');
      quickEdit.applyQuickEditToDocument(tree);
      const before = toHtml(tree);
      quickEdit.applyQuickEditToDocument(tree);
      assert.strictEqual(toHtml(tree), before);
      assert.strictEqual(selectAll('script[src$="/quick-edit-init.js"]', tree).length, 1);
    });
  });

  describe('buildQuickEditNotFoundResponse', () => {
    it('returns a 404 shell with the import map and initializer', async () => {
      const res = quickEdit.buildQuickEditNotFoundResponse();
      assert.strictEqual(res.status, 404);
      const html = await res.text();
      assert.ok(html.includes('<script type="importmap"'));
      assert.ok(html.includes('"da-lit"'));
      assert.ok(!html.includes('scripts.js'));
      assert.ok(select('head script[src$="/quick-edit-init.js"]', fromHtml(html)));
    });
  });
});
