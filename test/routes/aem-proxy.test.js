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
import esmock from 'esmock';
import { getDaCtx } from '../../src/utils/daCtx.js';

describe('AEM proxy quick-edit', () => {
  let handleAEMProxyRequest;
  let fetchCalls;
  const env = { UE_HOST: 'test-host', UE_SERVICE: 'test-service' };

  const HEAD_HTML = '<meta name="cms" content="edge-delivery" /><script nonce="aem" src="/scripts/scripts.js" type="module"></script>';

  beforeEach(async () => {
    fetchCalls = [];
    globalThis.fetch = async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      fetchCalls.push(url);
      if (url.includes('/head.html')) {
        return new Response(HEAD_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('<html><body>not found</body></html>', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'text/html' },
      });
    };

    const mod = await esmock('../../src/routes/aem-proxy.js');
    handleAEMProxyRequest = mod.handleAEMProxyRequest;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('serves a quick-edit scaffold when the upstream document 404s', async () => {
    const req = new Request('https://main--site--org.ue.da.live/missing?quick-edit=on');
    const daCtx = getDaCtx(req);

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 404);
    const html = await res.text();
    assert.ok(fetchCalls.some((url) => url.includes('/head.html')));
    assert.ok(html.includes('edge-delivery'));
    assert.ok(html.includes('nonce="aem"'));
    assert.ok(html.includes('<header></header>'));
    assert.ok(html.includes('<main>'));
    assert.ok(html.includes('<footer></footer>'));
    assert.ok(!html.includes('not found'));
    assert.ok(res.headers.get('Set-Cookie')?.includes('da-quick-edit=%2Fscripts%2Fscripts.js'));
  });

  it('does not synthesize HTML for a 404 entry script request', async () => {
    const req = new Request('https://main--site--org.ue.da.live/scripts/scripts.js', {
      headers: { Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js' },
    });
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => new Response('missing script', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await res.text(), 'missing script');
    assert.strictEqual(res.headers.get('Set-Cookie'), null);
  });
});
