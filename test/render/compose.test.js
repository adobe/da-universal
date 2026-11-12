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
import {
  describe, it, before, beforeEach, afterEach,
} from 'mocha';
import esmock from 'esmock';
import { select, selectAll } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import applyCsp from '../../src/render/csp.js';
import { composeHtml as compose } from '../../src/render/compose.js';

describe('render compose', () => {
  let composeHtml;
  let serializeHtml;

  const daCtx = { org: 'org', site: 'site', path: '/folder/content' };
  const aemCtx = {};
  const headHtml = '<meta name="from-aem" content="head.html" />';

  before(async () => {
    // stub out the network-backed bulk metadata fetch; keep everything else real
    const mod = await esmock('../../src/render/compose.js', {
      '../../src/render/metadata.js': {
        fetchBulkMetadata: async () => ({ getModifiers: () => ({}) }),
        extractLocalMetadata: () => ({ title: 'My Page', description: 'desc' }),
      },
    });
    composeHtml = mod.composeHtml;
    serializeHtml = mod.serializeHtml;
  });

  describe('AEM composition parity', () => {
    const pageCtx = { org: 'org', site: 'site', path: '/folder/page' };
    const siteCtx = {
      previewUrl: 'https://main--site--org.aem.page',
      liveUrl: 'https://main--site--org.aem.live',
    };
    let savedFetch;
    let bulk;

    beforeEach(() => {
      savedFetch = globalThis.fetch;
      bulk = {};
      globalThis.fetch = async () => new Response(JSON.stringify({
        data: [{ url: '/folder/*', ...bulk }],
      }));
    });

    afterEach(() => {
      globalThis.fetch = savedFetch;
    });

    const metadata = (values) => `<main><div><div class="metadata">${Object.entries(values)
      .map(([key, value]) => `<div><div>${key}</div><div>${value}</div></div>`).join('')}</div></div></main>`;

    it('applies local values after matching bulk defaults and keeps absent local values', async () => {
      bulk = { 'gnav-source': '/navigation/default', description: 'Default description' };
      const tree = await compose(pageCtx, siteCtx, metadata({
        'gnav-source': '<p>/navigation/local&nbsp;</p>',
      }), '');

      assert.strictEqual(select('head meta[name="gnav-source"]', tree).properties.content, '/navigation/local');
      assert.strictEqual(select('head meta[name="description"]', tree).properties.content, 'Default description');
    });

    it('ignores empty custom local values but keeps empty overrides for AEM fixed metadata', async () => {
      bulk = { 'gnav-source': '/navigation/default', title: 'Default', description: 'Default' };
      const tree = await compose(pageCtx, siteCtx, metadata({
        'gnav-source': '<p>&nbsp;</p>', title: '', description: '<p> </p>',
      }), '');

      assert.strictEqual(select('head meta[name="gnav-source"]', tree).properties.content, '/navigation/default');
      assert.strictEqual(toString(select('head title', tree)), '');
      assert.strictEqual(select('head meta[name="description"]', tree).properties.content, '');
    });

    it('omits explicit empty bulk values while allowing nonempty local overrides', async () => {
      bulk = { 'gnav-source': '""', description: '""', title: '""' };
      const empty = await compose(pageCtx, siteCtx, '<main><div></div></main>', '');
      assert.strictEqual(select('head meta[name="gnav-source"]', empty), undefined);
      assert.strictEqual(select('head meta[name="description"]', empty), undefined);
      assert.strictEqual(select('head title', empty), undefined);

      const local = await compose(pageCtx, siteCtx, metadata({ 'gnav-source': '/navigation/local' }), '');
      assert.strictEqual(select('head meta[name="gnav-source"]', local).properties.content, '/navigation/local');
    });

    const sectionMetadata = `<main><div><p>Content</p><div class="section-metadata">
        <div><div>Style</div><div><p>wide, light</p><p>center</p></div></div>
        <div><div>Background</div><div><picture><img src="https://example.com/bg.jpg"></picture></div></div>
        <div><div>Masonry</div><div><p>span 6, span 6</p><p>span 4, span 8</p></div></div>
      </div></div></main>`;

    it('preserves legacy section metadata and its structured source for client decoration', async () => {
      const tree = await compose(pageCtx, siteCtx, sectionMetadata, '', { sectionMetadataEnabled: false });
      const section = select('main > div', tree);
      assert.strictEqual(selectAll('.section-metadata p', tree).length, 4);
      assert.ok(select('.section-metadata picture img', tree));
      assert.strictEqual(section.properties.className, undefined);
      assert.strictEqual(section.properties['data-background'], undefined);
    });

    it('extracts structured metadata only when the effective rendering mode enables it', async () => {
      const tree = await compose(pageCtx, siteCtx, sectionMetadata, '', { sectionMetadataEnabled: true });
      const section = select('main > div', tree);
      assert.strictEqual(select('.section-metadata', tree), undefined);
      assert.deepStrictEqual(section.properties.className, ['wide', 'light', 'center']);
      assert.strictEqual(section.properties['data-background'], 'https://example.com/bg.jpg');
      assert.strictEqual(section.properties['data-masonry'], 'span 6,span 6,span 4,span 8');
    });

    it('normalizes empty named blocks and cells without duplicating existing scaffolding or losing content', async () => {
      const tree = await compose(pageCtx, siteCtx, `<main><div>
          <div class="empty-block"></div>
          <div class="whitespace-block">\n &nbsp; </div>
          <div class="existing-block"><div><div></div></div></div>
          <div class="content-block"><div>
            <div><p>&nbsp;</p><p></p></div>
            <div><p>Text <strong>bold</strong></p><p><a href="/page"></a></p></div>
            <div><p><img src="https://example.com/image.jpg"></p></div>
          </div></div>
        </div></main>`, '');

      ['empty-block', 'whitespace-block', 'existing-block'].forEach((name) => {
        assert.strictEqual(selectAll(`.${name} > div`, tree).length, 1);
        const cell = select(`.${name} > div > div`, tree);
        assert.ok(cell);
        assert.strictEqual(cell.children.length, 0);
      });
      assert.strictEqual(select('.content-block > div > div', tree).children.length, 0);
      assert.strictEqual(select('.content-block strong', tree).children[0].value, 'bold');
      assert.ok(select('.content-block a', tree));
      assert.ok(select('.content-block img', tree));
      assert.strictEqual(selectAll('.content-block > div', tree).length, 1);
    });
  });
  it('composes the page (body, AEM head, metadata, relative images, icons)', async () => {
    const body = '<div><p>Hello :smile:</p>'
      + '<img src="https://content.da.live/org/site/media_1.png">'
      + '</div>';

    const tree = await composeHtml(daCtx, aemCtx, body, headHtml);
    const html = serializeHtml(tree);

    // body content preserved
    assert.ok(html.includes('Hello'));
    // AEM head injected
    assert.ok(html.includes('from-aem'));
    // local metadata injected into head
    assert.ok(html.includes('<title>My Page</title>'));
    assert.ok(html.includes('name="description"'));
    // content.da.live image rewritten to a relative path (host kept for restore)
    assert.ok(html.includes('src="/media_1.png"'));
    assert.ok(!html.includes('https://content.da.live'));
    assert.ok(html.includes('data-da-img-host="content.da.live"'));
    // icon syntax rewritten
    assert.ok(html.includes('icon-smile'));
  });

  it('does not add any UE instrumentation', async () => {
    const tree = await composeHtml(daCtx, aemCtx, '<div><p>content</p></div>', headHtml);
    const html = serializeHtml(tree);

    assert.ok(!html.includes('data-aue-'));
    assert.ok(!html.includes('urn:adobe:aue'));
    assert.ok(!html.includes('universal-editor-service'));
  });

  it('composes head.html as selectable CSP elements without noncing author body scripts', async () => {
    const cspHead = '<meta http-equiv="Content-Security-Policy"'
      + ' content="script-src \'nonce-aem\' \'strict-dynamic\'">'
      + '<script nonce="aem" src="/scripts/scripts.js"></script>';
    const body = '<main><script nonce="aem">console.log(\'author content\')</script></main>';

    const tree = await composeHtml(daCtx, aemCtx, body, cspHead);
    const nonce = applyCsp(tree);

    assert.ok(select('head meta[http-equiv]', tree).properties.content.includes(`'nonce-${nonce}'`));
    assert.strictEqual(select('head script', tree).properties.nonce, nonce);
    assert.strictEqual(select('body script', tree).properties.nonce, 'aem');
  });
});
