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
import * as quickEdit from '../../src/utils/quick-edit.js';

const SCRIPTS_JS = `import { initIms } from '../blocks/shared/utils.js';
import { setNx, nxJS, nxCSS } from './utils.js';

const { loadArea } = await import('./nx.js');
const CONFIG = { codeBase: import.meta.url.replace('/scripts/scripts.js', '') };

export default async function loadPage() {
  await loadArea();
}

loadPage();
`;

describe('quick-edit script transform', () => {
  describe('injectImportMap', () => {
    const countImportMaps = (html) => (html.match(/type\s*=\s*["']importmap["']/gi) || []).length;

    it('injects import map at the start of head', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const out = quickEdit.injectImportMap(html);
      assert.ok(out.includes('<head><script type="importmap">'));
      assert.ok(out.includes('"da-lit"'));
    });

    it('injects before module scripts in head', () => {
      const html = '<html><head><script src="/scripts/scripts.js" type="module"></script></head></html>';
      const out = quickEdit.injectImportMap(html);
      const mapPos = out.indexOf('importmap');
      const scriptPos = out.indexOf('scripts.js');
      assert.ok(mapPos < scriptPos, 'import map should precede entry module script');
    });

    it('prepends import map if no head tag', () => {
      const html = '<html><body>Content</body></html>';
      const out = quickEdit.injectImportMap(html);
      assert.ok(out.startsWith('<script type="importmap">'));
    });

    it('merges in place and keeps a single import map', () => {
      const existingMap = {
        imports: { 'existing-package': 'https://example.com/existing.js' },
      };
      const html = `<html><head><script type="importmap">${JSON.stringify(existingMap)}</script></head><body></body></html>`;
      const out = quickEdit.injectImportMap(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('"existing-package"'));
      assert.ok(out.includes('"da-y-wrapper"'));
    });

    it('merges and overwrites with quick-edit imports', () => {
      const existingMap = {
        imports: {
          'da-lit': 'https://old.com/lit.js',
          other: 'https://other.com/other.js',
        },
      };
      const html = `<html><head><script type="importmap">${JSON.stringify(existingMap)}</script></head></html>`;
      const out = quickEdit.injectImportMap(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('"da-lit":"https://da.live/deps/lit/dist/index.js"'));
      assert.ok(out.includes('"other":"https://other.com/other.js"'));
    });

    it('preserves nonce and scopes on merge', () => {
      const existingMap = {
        imports: { 'da-parser': '/deps/da-parser/dist/index.js' },
        scopes: { '/blocks/': { 'local-dep': './dep.js' } },
      };
      const html = `<html><head><script nonce="aem" type="importmap">${JSON.stringify(existingMap)}</script></head></html>`;
      const out = quickEdit.injectImportMap(html);
      assert.ok(out.includes('nonce="aem"'));
      assert.ok(out.includes('"scopes"'));
      assert.ok(out.includes('"da-parser"'));
      assert.ok(out.includes('"da-y-wrapper"'));
    });

    it('is idempotent when quick-edit entries are already present', () => {
      const map = {
        imports: {
          'da-lit': 'https://da.live/deps/lit/dist/index.js',
          'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
        },
      };
      const html = `<html><head><script type="importmap">${JSON.stringify(map)}</script></head></html>`;
      assert.strictEqual(quickEdit.injectImportMap(html), html);
    });

    it('replaces invalid existing import map in place', () => {
      const html = '<html><head><script nonce="x" type="importmap">invalid json</script></head></html>';
      const out = quickEdit.injectImportMap(html);
      assert.strictEqual(countImportMaps(out), 1);
      assert.ok(out.includes('nonce="x"'));
      assert.ok(out.includes('"da-lit"'));
    });
  });

  describe('prepareQuickEditDocument', () => {
    it('injects import map and finds entry script', () => {
      const html = '<html><head><script src="/scripts/scripts.js" type="module"></script></head><body></body></html>';
      const { html: out, entryPath } = quickEdit.prepareQuickEditDocument(html);
      assert.strictEqual(entryPath, '/scripts/scripts.js');
      assert.ok(out.includes('importmap'));
      assert.ok(out.includes('"da-lit"'));
    });
  });

  describe('buildQuickEdit404Html', () => {
    it('includes the minimal scaffold and injects head.html content', () => {
      const head = '<meta name="cms" content="edge-delivery" /><script src="/scripts/scripts.js" type="module"></script>';
      const out = quickEdit.buildQuickEdit404Html(head);
      assert.ok(out.includes('<header></header>'));
      assert.ok(out.includes('<main>'));
      assert.ok(out.includes('<footer></footer>'));
      assert.ok(out.includes('edge-delivery'));
      assert.ok(out.includes('/scripts/scripts.js'));
    });
  });

  describe('findEntryScriptPath', () => {
    it('finds /scripts/scripts.js from a script tag', () => {
      const html = '<head><script src="/scripts/scripts.js" type="module"></script></head>';
      assert.strictEqual(quickEdit.findEntryScriptPath(html), '/scripts/scripts.js');
    });

    it('finds a nested/subfolder entry script', () => {
      const html = '<script src="/nx2/scripts/scripts.js" type="module"></script>';
      assert.strictEqual(quickEdit.findEntryScriptPath(html), '/nx2/scripts/scripts.js');
    });

    it('normalizes a full URL src to its pathname', () => {
      const html = '<script src="https://host.example/foo/scripts.js"></script>';
      assert.strictEqual(quickEdit.findEntryScriptPath(html), '/foo/scripts.js');
    });

    it('strips a query string from the src', () => {
      const html = '<script src="/scripts/scripts.js?v=2"></script>';
      assert.strictEqual(quickEdit.findEntryScriptPath(html), '/scripts/scripts.js');
    });

    it('ignores unrelated scripts and picks the scripts.js entry', () => {
      const html = '<script src="/vendor/analytics.js"></script>'
        + '<script src="/scripts/utils.js"></script>'
        + '<script src="/scripts/scripts.js"></script>';
      assert.strictEqual(quickEdit.findEntryScriptPath(html), '/scripts/scripts.js');
    });

    it('does not match a filename merely ending in scripts.js', () => {
      const html = '<script src="/scripts/myscripts.js"></script>';
      assert.strictEqual(quickEdit.findEntryScriptPath(html), undefined);
    });

    it('returns undefined when there is no entry script', () => {
      assert.strictEqual(quickEdit.findEntryScriptPath('<head></head>'), undefined);
    });
  });

  describe('quick-edit cookie', () => {
    it('round-trips the entry path through the cookie', () => {
      const setCookie = quickEdit.buildQuickEditCookie('/scripts/scripts.js');
      assert.ok(setCookie.startsWith('da-quick-edit=%2Fscripts%2Fscripts.js'));
      assert.ok(setCookie.includes('HttpOnly'));
      assert.ok(setCookie.includes('SameSite=None'));
      assert.ok(setCookie.includes('Secure'));
      // emulate the browser echoing it back
      const sent = setCookie.split(';')[0];
      assert.strictEqual(quickEdit.getQuickEditCookiePath(sent), '/scripts/scripts.js');
    });

    it('reads the path from a header with other cookies', () => {
      const header = 'auth_token=abc; da-quick-edit=%2Fnx2%2Fscripts%2Fscripts.js; site_token=xyz';
      assert.strictEqual(quickEdit.getQuickEditCookiePath(header), '/nx2/scripts/scripts.js');
    });

    it('returns undefined when the cookie is absent', () => {
      assert.strictEqual(quickEdit.getQuickEditCookiePath('auth_token=abc'), undefined);
      assert.strictEqual(quickEdit.getQuickEditCookiePath(null), undefined);
    });
  });

  describe('hasLoadPageFn', () => {
    it('detects an exported async function declaration', () => {
      assert.ok(quickEdit.hasLoadPageFn('export default async function loadPage() {}'));
    });

    it('detects an arrow assignment', () => {
      assert.ok(quickEdit.hasLoadPageFn('const loadPage = async () => {};'));
    });

    it('returns false when absent', () => {
      assert.strictEqual(quickEdit.hasLoadPageFn('function other() {}'), false);
    });
  });

  describe('alreadyImportsQuickEdit', () => {
    it('detects a root-level quick-edit import', () => {
      assert.ok(quickEdit.alreadyImportsQuickEdit("import('/quick-edit.js')"));
    });

    it('detects an arbitrary path before quick-edit.js', () => {
      assert.ok(quickEdit.alreadyImportsQuickEdit("import('../tools/quick-edit/quick-edit.js')"));
    });

    it('ignores unrelated dynamic imports', () => {
      assert.strictEqual(quickEdit.alreadyImportsQuickEdit("import('./nx.js')"), false);
    });

    it('only matches dynamic imports, not static ones', () => {
      assert.strictEqual(quickEdit.alreadyImportsQuickEdit("import x from '/quick-edit.js';"), false);
    });
  });

  describe('transformScriptForQuickEdit', () => {
    it('appends the bootstrap when loadPage is present', () => {
      const out = quickEdit.transformScriptForQuickEdit(SCRIPTS_JS);
      assert.ok(out.startsWith(SCRIPTS_JS), 'original source is preserved verbatim at the top');
      assert.ok(out.length > SCRIPTS_JS.length);
      // runtime-gated on the quick-edit param
      assert.ok(out.includes("params.has('quick-edit')"));
      // uses loadPage from module scope (does not import it)
      assert.ok(out.includes('loadQuickEdit(payload, loadPage)'));
      assert.ok(!out.includes('import { loadPage }'));
      // loads the plugin
      assert.ok(out.includes('da.live/nx/public/plugins/quick-edit/quick-edit.js'));
    });

    it('leaves the source unchanged when there is no loadPage', () => {
      const code = 'export function nope() {}';
      assert.strictEqual(quickEdit.transformScriptForQuickEdit(code), code);
    });

    it('leaves the source unchanged when it already imports quick-edit', () => {
      const code = `${SCRIPTS_JS}\nif (qe) import('../tools/quick-edit/quick-edit.js');`;
      assert.strictEqual(quickEdit.transformScriptForQuickEdit(code), code);
    });
  });

  describe('applyQuickEditToScript', () => {
    it('returns transformed JS and drops stale length/encoding headers', async () => {
      const response = new Response(SCRIPTS_JS, {
        status: 200,
        headers: {
          'Content-Type': 'text/javascript',
          'Content-Length': String(SCRIPTS_JS.length),
          'Content-Encoding': 'gzip',
          'X-Test': '1',
        },
      });
      const out = await quickEdit.applyQuickEditToScript(response);
      assert.strictEqual(out.status, 200);
      assert.strictEqual(out.headers.get('X-Test'), '1');
      assert.strictEqual(out.headers.get('Content-Length'), null);
      assert.strictEqual(out.headers.get('Content-Encoding'), null);
      assert.ok((await out.text()).includes('loadQuickEdit(payload, loadPage)'));
    });

    it('passes through unchanged JS when there is no loadPage', async () => {
      const code = 'export const x = 1;';
      const response = new Response(code, {
        status: 200,
        headers: { 'Content-Type': 'text/javascript' },
      });
      const out = await quickEdit.applyQuickEditToScript(response);
      assert.strictEqual(await out.text(), code);
    });
  });
});
