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
});
