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
import { select, selectAll } from 'hast-util-select';
import { fromHtml } from 'hast-util-from-html';
import applyCsp from '../../src/render/csp.js';

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

  it('renders AEM-compatible fragment targets for library variant headings', async () => {
    const body = '<main><div><h1>Default Hero</h1>'
      + '<div class="hero"><div><div>Default</div></div></div></div>'
      + '<div><h2>Legacy <em>Hero</em></h2>'
      + '<div class="hero legacy"><div><div>Legacy</div></div></div>'
      + '<h3>Cards &amp; Tabs</h3><h4>2 Columns</h4>'
      + '<h5>\u00dcber</h5><h6>  More examples!  </h6></div></main>';
    const tree = await composeHtml(daCtx, aemCtx, body, headHtml);
    const rendered = fromHtml(serializeHtml(tree));

    assert.deepStrictEqual(
      selectAll('h1, h2, h3, h4, h5, h6', rendered).map((node) => node.properties.id),
      ['default-hero', 'legacy-hero', 'cards--tabs', 'columns', '\u00fcber', 'more-examples'],
    );
    assert.ok(select('#legacy-hero + div.hero.legacy', rendered));
  });

  it('deduplicates heading IDs across sections and handles suffixed heading collisions', async () => {
    const body = '<main><div><h2>Default</h2><h3>Default-1</h3></div>'
      + '<div><h2>Default</h2><h2>Default</h2><h3>Default-1</h3></div></main>';
    const tree = await composeHtml(daCtx, aemCtx, body, headHtml);

    assert.deepStrictEqual(
      selectAll('h2, h3', tree).map((node) => node.properties.id),
      ['default', 'default-1', 'default-2', 'default-3', 'default-1-1'],
    );
  });

  it('preserves authored IDs and empty headings without consuming generated heading counts', async () => {
    const body = '<main><div><h2 id="authored">Default</h2>'
      + '<h2> \n </h2><h2 id="">Default</h2></div></main>';
    const tree = await composeHtml(daCtx, aemCtx, body, headHtml);

    assert.deepStrictEqual(
      selectAll('h2', tree).map((node) => node.properties.id),
      ['authored', undefined, 'default'],
    );
  });

  it('starts heading ID counts fresh for each composed document', async () => {
    const body = '<main><div><h2>Default</h2><h2>Default</h2></div></main>';
    await composeHtml(daCtx, aemCtx, body, headHtml);
    const tree = await composeHtml(daCtx, aemCtx, body, headHtml);

    assert.deepStrictEqual(
      selectAll('h2', tree).map((node) => node.properties.id),
      ['default', 'default-1'],
    );
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
