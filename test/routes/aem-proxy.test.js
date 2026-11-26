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

describe('MP4 routing and proxying', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  [
    { method: 'GET', path: '/site/media_example.mp4', status: 200 },
    {
      method: 'GET', path: '/site/media_example.MP4?download=1', range: 'bytes=0-63', status: 206,
    },
    { method: 'HEAD', path: '/site/media_example.mp4', status: 200 },
    {
      method: 'HEAD', path: '/site/media_example.mp4', range: 'bytes=0-63', status: 200,
    },
  ].forEach(({
    method, path, range, status,
  }) => {
    it(`proxies ${method} ${path} with range=${range ?? 'none'} without reading DA source`, async () => {
      const headers = { 'x-site-token': 'token site-secret' };
      if (range) headers.Range = range;
      const req = new Request(`https://main--site--org.preview.da.live${path}`, { method, headers });
      const handler = (await esmock(`../../src/handlers/${method.toLowerCase()}.js`, {
        '../../src/routes/da-admin.js': {
          daSourceGet: async () => assert.fail('MP4 must not read DA source'),
          daSourceHead: async () => assert.fail('MP4 must not read DA source'),
        },
      })).default;
      const bytes = Uint8Array.from({ length: 64 }, (_, i) => i);
      let upstream;
      globalThis.fetch = async (request) => {
        upstream = request;
        return new Response(method === 'HEAD' ? null : bytes, {
          status,
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': '64',
            'Accept-Ranges': 'bytes',
            ...(status === 206 ? { 'Content-Range': 'bytes 0-63/692174' } : {}),
          },
        });
      };

      const response = await handler({ req, env: {}, daCtx: getDaCtx(req) });

      assert.strictEqual(upstream.method, method);
      assert.strictEqual(upstream.url, `https://main--site--org.aem.page${path}`);
      assert.strictEqual(upstream.headers.get('Range'), range ?? null);
      assert.strictEqual(upstream.headers.get('Authorization'), 'token site-secret');
      assert.strictEqual(response.status, status);
      assert.strictEqual(response.headers.get('Content-Type'), 'video/mp4');
      assert.strictEqual(response.headers.get('Content-Length'), '64');
      assert.strictEqual(response.headers.get('Accept-Ranges'), 'bytes');
      assert.strictEqual(response.headers.get('Content-Range'), status === 206 ? 'bytes 0-63/692174' : null);
      assert.deepStrictEqual(new Uint8Array(await response.arrayBuffer()), method === 'HEAD' ? new Uint8Array() : bytes);
    });
  });

  ['GET', 'HEAD'].forEach((method) => {
    [403, 404, 416].forEach((status) => {
      it(`preserves ${method} upstream ${status} responses`, async () => {
        const req = new Request('https://main--site--org.preview.da.live/media_example.mp4', { method });
        const handler = (await esmock(`../../src/handlers/${method.toLowerCase()}.js`)).default;
        globalThis.fetch = async () => new Response(null, {
          status, headers: { 'Content-Range': 'bytes */692174' },
        });

        const response = await handler({ req, env: {}, daCtx: getDaCtx(req) });

        assert.strictEqual(response.status, status);
        assert.strictEqual(response.headers.get('Content-Range'), 'bytes */692174');
        assert.strictEqual(await response.text(), '');
      });
    });
  });
});

describe('native AEM HEAD proxying', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  [
    '/styles/styles.css',
    '/scripts/scripts.js',
    '/fonts/font.woff2',
    '/folder/content.html',
    '/image.png',
    '/config.json',
    '/taxonomy.json?sheet=tags&offset=0&limit=1',
  ].forEach((path) => {
    it(`forwards HEAD for ${path} without reading a response body`, async () => {
      const req = new Request(`https://main--site--org.preview.da.live${path}`, {
        method: 'HEAD',
        headers: { 'x-site-token': 'token site-secret' },
      });
      const handler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': {
          daSourceHead: async () => new Response(null, { status: 404 }),
        },
      })).default;
      const headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Length': '12345',
        'Content-Encoding': 'gzip',
        ETag: '"origin-etag"',
      };
      let upstreamCalls = 0;
      globalThis.fetch = async (upstreamReq, options) => {
        upstreamCalls += 1;
        assert.strictEqual(upstreamReq.method, 'HEAD');
        assert.strictEqual(upstreamReq.url, `https://main--site--org.aem.page${path}`);
        assert.strictEqual(upstreamReq.headers.get('Origin'), 'https://main--site--org.aem.page');
        assert.strictEqual(upstreamReq.headers.get('Authorization'), 'token site-secret');
        assert.strictEqual(options.cf.cacheTtl, 0);
        const response = new Response(null, { headers });
        response.text = () => assert.fail('HEAD must not read the upstream body');
        return response;
      };

      const response = await handler({ req, env: {}, daCtx: getDaCtx(req) });

      assert.strictEqual(upstreamCalls, 1);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body, null);
      Object.entries(headers).forEach(([name, value]) => {
        assert.strictEqual(response.headers.get(name), value);
      });
    });
  });

  [200, 304, 403, 404, 503].forEach((status) => {
    it(`does not inject Quick Edit into a HEAD entry script with status ${status}`, async () => {
      const req = new Request('https://main--site--org.preview.da.live/scripts/scripts.js', {
        method: 'HEAD',
        headers: {
          Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js',
          'Accept-Encoding': 'gzip',
        },
      });
      const { handleAEMProxyRequest } = await esmock('../../src/routes/aem-proxy.js', {
        '../../src/utils/quick-edit.js': {
          applyQuickEditToScript: async () => assert.fail('HEAD must not inject Quick Edit'),
        },
      });
      const headers = {
        'Content-Type': 'application/javascript',
        'Content-Length': '12345',
        'Content-Encoding': 'gzip',
        ETag: '"script-etag"',
      };
      globalThis.fetch = async (upstreamReq) => {
        assert.strictEqual(upstreamReq.method, 'HEAD');
        assert.strictEqual(upstreamReq.headers.get('Accept-Encoding'), 'gzip');
        return new Response(null, { status, statusText: 'Origin status', headers });
      };

      const response = await handleAEMProxyRequest({ req, env: {}, daCtx: getDaCtx(req) });

      assert.strictEqual(response.status, status);
      assert.strictEqual(response.statusText, 'Origin status');
      assert.strictEqual(response.body, null);
      Object.entries(headers).forEach(([name, value]) => {
        assert.strictEqual(response.headers.get(name), value);
      });
    });
  });
});

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
        assert.strictEqual(upstreamReq.method, method);
        upstreamUrls.push(upstreamReq.url);
        return new Response(method === 'HEAD' ? null : 'AEM sheet', {
          headers: { 'Content-Type': 'application/json' },
        });
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

  it('logs only upstream 5xx responses', async () => {
    const req = new Request('https://main--site--org.ue.da.live/styles/styles.css');
    const daCtx = getDaCtx(req);
    const logged = [];
    const { log, warn } = console;
    console.log = (...args) => logged.push(['log', ...args]);
    console.warn = (...args) => logged.push(['warn', ...args]);
    try {
      globalThis.fetch = async () => new Response('ok', { status: 200 });
      await handleAEMProxyRequest({ req, env, daCtx });
      assert.deepStrictEqual(logged, []);

      globalThis.fetch = async () => new Response('down', { status: 503, statusText: 'Service Unavailable' });
      await handleAEMProxyRequest({ req, env, daCtx });
      assert.strictEqual(logged.length, 1);
      assert.strictEqual(logged[0][0], 'warn');
      assert.match(logged[0][1], /^<- .*styles\.css\. 503 Service Unavailable$/);
    } finally {
      console.log = log;
      console.warn = warn;
    }
  });
});
