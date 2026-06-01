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
