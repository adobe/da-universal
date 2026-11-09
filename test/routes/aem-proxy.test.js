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
import { PREVIEW_HOST, UpstreamError } from '../../src/utils/upstream.js';

describe('JSON sheet query routing', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  ['GET', 'HEAD'].forEach((method) => {
    it(`sends ${method} sheet parameters only to AEM, not DA source`, async () => {
      const req = new Request('https://main--site--org.preview.da.live/taxonomy.json?sheet=tags&offset=0&limit=1', {
        method,
      });
      let sourceReads = 0;
      const readSource = async () => {
        sourceReads += 1;
        return new Response('DA source');
      };
      const handler = (await esmock(`../../src/handlers/${method.toLowerCase()}.js`, {
        '../../src/routes/da-admin.js': {
          daSourceGet: readSource,
          daSourceHead: readSource,
        },
      })).default;
      const upstreamUrls = [];
      globalThis.fetch = async (upstreamReq) => {
        upstreamUrls.push(upstreamReq.url);
        return new Response('AEM sheet', { headers: { 'Content-Type': 'application/json' } });
      };

      const res = await handler({ req, env: {}, daCtx: getDaCtx(req) });

      assert.deepStrictEqual(upstreamUrls, [
        'https://main--site--org.aem.page/taxonomy.json?sheet=tags&offset=0&limit=1',
      ]);
      assert.strictEqual(sourceReads, 0);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), method === 'HEAD' ? '' : 'AEM sheet');
    });
  });
});

describe('AEM proxy quick-edit', () => {
  let handleAEMProxyRequest;
  const env = { UE_HOST: 'test-host', UE_SERVICE: 'test-service' };

  beforeEach(async () => {
    const mod = await esmock('../../src/routes/aem-proxy.js');
    handleAEMProxyRequest = mod.handleAEMProxyRequest;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('appends the bootstrap to the entry script matched by the cookie', async () => {
    const req = new Request('https://main--site--org.ue.da.live/scripts/scripts.js', {
      headers: { Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js' },
    });
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => new Response('function loadPage() {}', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    const code = await res.text();
    assert.ok(code.includes('function loadPage() {}'));
    assert.ok(code.includes('quick-edit'));
  });

  it('does not inject for a script that does not match the cookie path', async () => {
    const req = new Request('https://main--site--org.ue.da.live/scripts/other.js', {
      headers: { Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js' },
    });
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => new Response('function loadPage() {}', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'function loadPage() {}');
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

describe('AEM proxy upstream failures', () => {
  let handleAEMProxyRequest;
  const env = { UE_HOST: 'test-host', UE_SERVICE: 'test-service' };

  beforeEach(async () => {
    const mod = await esmock('../../src/routes/aem-proxy.js');
    handleAEMProxyRequest = mod.handleAEMProxyRequest;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('names the preview host when the read cannot be made', async () => {
    const req = new Request('https://main--site--org.ue.da.live/styles/styles.css');
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    await assert.rejects(
      () => handleAEMProxyRequest({ req, env, daCtx }),
      (e) => e instanceof UpstreamError && e.upstream === PREVIEW_HOST,
    );
  });
});
