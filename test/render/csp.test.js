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
import { select, selectAll } from 'hast-util-select';
import applyCsp from '../../src/render/csp.js';

const cspMeta = (content, extra = '') => `<meta http-equiv="Content-Security-Policy" content="${content}" ${extra}>`;

describe('applyCsp', () => {
  it('rewrites the CSP meta and re-stamps head scripts with one nonce', () => {
    const tree = fromHtml(`<html><head>
      ${cspMeta("script-src 'nonce-aem' 'strict-dynamic'; object-src 'none';", 'move-to-http-header="true" move-as-header="true"')}
      <script nonce="aem" src="/scripts/scripts.js"></script>
    </head><body></body></html>`);

    const nonce = applyCsp(tree);
    const meta = select('meta[http-equiv="content-security-policy"]', tree);
    const script = select('script', tree);

    assert.ok(nonce);
    assert.ok(meta.properties.content.includes(`'nonce-${nonce}'`));
    assert.ok(!meta.properties.content.includes("'nonce-aem'"));
    assert.strictEqual(meta.properties['move-to-http-header'], undefined);
    assert.strictEqual(meta.properties['move-as-header'], undefined);
    assert.strictEqual(script.properties.nonce, nonce);
  });

  it('re-stamps only elements covered by a nonce-bearing directive', () => {
    const tree = fromHtml(`<html><head>
      ${cspMeta("script-src 'nonce-aem'; style-src 'nonce-aem'")}
      <script nonce="aem"></script>
      <link as="script" nonce="aem" href="/preload.js">
      <style nonce="aem"></style>
      <link rel="stylesheet" nonce="aem" href="/styles.css">
    </head></html>`);

    const nonce = applyCsp(tree);
    const stamped = selectAll('[nonce]', tree);

    assert.strictEqual(stamped.length, 4);
    assert.ok(stamped.every((node) => node.properties.nonce === nonce));
  });

  it('removes require-trusted-types-for without changing other directives', () => {
    const warnings = [];
    const saved = console.warn;
    console.warn = (message) => warnings.push(message);
    try {
      const tree = fromHtml(`<html><head>
        ${cspMeta("script-src 'nonce-aem' 'strict-dynamic'; object-src 'none'; require-trusted-types-for 'script'; trusted-types editor;")}
      </head></html>`);

      const nonce = applyCsp(tree);
      const content = select('meta', tree).properties.content;

      assert.ok(content.includes(`script-src 'nonce-${nonce}' 'strict-dynamic'`));
      assert.ok(content.includes("object-src 'none'"));
      assert.ok(content.includes('trusted-types editor'));
      assert.ok(!content.includes('require-trusted-types-for'));
      assert.ok(warnings.some((message) => message.includes('require-trusted-types-for')));
    } finally {
      console.warn = saved;
    }
  });

  it('leaves a policy without the nonce sentinel byte-for-byte unchanged', () => {
    const content = "default-src 'self'";
    const tree = fromHtml(`<html><head>
      ${cspMeta(content, 'move-to-http-header="true"')}
      <script nonce="aem"></script>
    </head></html>`);

    assert.strictEqual(applyCsp(tree), undefined);
    const meta = select('meta', tree);
    assert.strictEqual(meta.properties.content, content);
    assert.strictEqual(meta.properties['move-to-http-header'], 'true');
    assert.strictEqual(select('script', tree).properties.nonce, 'aem');
  });

  it('ignores report-only metas', () => {
    const tree = fromHtml(`<html><head>
      <meta http-equiv="Content-Security-Policy-Report-Only" content="script-src 'nonce-aem'">
      <script nonce="aem"></script>
    </head></html>`);

    assert.strictEqual(applyCsp(tree), undefined);
    assert.strictEqual(select('script', tree).properties.nonce, 'aem');
  });

  it('adds no nonce when the page has no CSP meta', () => {
    const tree = fromHtml('<html><head><script></script></head></html>');

    assert.strictEqual(applyCsp(tree), undefined);
    assert.strictEqual(select('script', tree).properties.nonce, undefined);
  });

  it('returns no script nonce for a style-only policy', () => {
    const tree = fromHtml(`<html><head>
      ${cspMeta("style-src 'nonce-aem'")}
      <script nonce="aem"></script>
      <style nonce="aem"></style>
    </head></html>`);

    assert.strictEqual(applyCsp(tree), undefined);
    assert.strictEqual(select('script', tree).properties.nonce, 'aem');
    assert.notStrictEqual(select('style', tree).properties.nonce, 'aem');
  });

  it('mints a different nonce for each composed document', () => {
    const first = fromHtml(`<html><head>${cspMeta("script-src 'nonce-aem'")}</head></html>`);
    const second = fromHtml(`<html><head>${cspMeta("script-src 'nonce-aem'")}</head></html>`);

    assert.notStrictEqual(applyCsp(first), applyCsp(second));
  });
});
