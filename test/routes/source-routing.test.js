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

const ORG = 'org';
const SITE = 'site';
const AUTH = 'Bearer test-token';
const DA_ADMIN = 'https://admin.da.live';
const HLX_ADMIN = 'https://admin.hlx.page';
const AEM_API = 'https://api.aem.live';
const PING_URL = `${HLX_ADMIN}/ping/${ORG}/${SITE}`;

function callDetails(input, init = {}) {
  const request = input instanceof Request ? input : null;
  return {
    input,
    url: request?.url ?? String(input),
    method: init.method ?? request?.method ?? 'GET',
    headers: new Headers(init.headers ?? request?.headers),
    body: init.body,
  };
}

describe('source backend routing', () => {
  let originalFetch;
  let originalLog;
  let originalWarn;
  let fetchCalls;
  let daAdminCalls;
  let logs;
  let warnings;
  let fetchResponse;
  let daAdminResponse;
  let composedBodies;
  let env;

  const authedRequest = (path, init = {}) => new Request(
    `https://main--${SITE}--${ORG}.preview.da.live${path}`,
    {
      ...init,
      headers: {
        Authorization: AUTH,
        ...init.headers,
      },
    },
  );

  const loadRoutes = async () => esmock('../../src/routes/da-admin.js', {
    '../../src/utils/aemCtx.js': {
      getAemCtx: () => ({}),
      getAEMHtml: async () => '<script src="/scripts.js"></script>',
    },
    '../../src/render/compose.js': {
      composeHtml: async (daCtx, aemCtx, bodyHtml) => {
        composedBodies.push(bodyHtml);
        return { bodyHtml };
      },
      serializeHtml: ({ bodyHtml }) => `<html>${bodyHtml}</html>`,
    },
    '../../src/helpers/source.js': {
      default: async () => ({ data: '<body><main>edited</main></body>' }),
    },
    '../../src/ue/attributes.js': {
      removeUEAttributes: (node) => node,
      unwrapParagraphs: (node) => node,
    },
    '../../src/render/rewrite-images.js': {
      restoreAbsoluteImages: () => {},
    },
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLog = console.log;
    originalWarn = console.warn;
    fetchCalls = [];
    daAdminCalls = [];
    logs = [];
    warnings = [];
    composedBodies = [];
    fetchResponse = async () => new Response('', { status: 404 });
    daAdminResponse = async () => new Response('', { status: 404 });

    globalThis.fetch = async (input, init) => {
      const details = callDetails(input, init);
      fetchCalls.push(details);
      return fetchResponse(details);
    };
    console.log = (...args) => logs.push(args);
    console.warn = (...args) => warnings.push(args);
    env = {
      DA_ADMIN,
      daadmin: {
        fetch: async (input, init) => {
          const details = callDetails(input, init);
          daAdminCalls.push(details);
          return daAdminResponse(details);
        },
      },
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
  });

  function upgradeResponse(upgraded = true) {
    return new Response('', {
      status: 200,
      headers: upgraded ? { 'x-api-upgrade-available': 'true' } : {},
    });
  }

  it('GETs a source-bus asset from api.aem.live', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/image.png`;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL) return upgradeResponse();
      if (url === sourceUrl) return new Response('source image', { status: 200 });
      return new Response('', { status: 500 });
    };
    daAdminResponse = async () => new Response('legacy image', { status: 200 });
    const req = authedRequest('/image.png');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();

    const response = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(await response.text(), 'source image');
    assert.strictEqual(daAdminCalls.length, 0);
    assert.strictEqual(fetchCalls[0].url, PING_URL);
    assert.strictEqual(fetchCalls[0].headers.get('Authorization'), null);
    assert.strictEqual(fetchCalls[1].url, sourceUrl);
    assert.strictEqual(fetchCalls[1].headers.get('Authorization'), AUTH);
    assert.deepStrictEqual(logs.map(([message]) => message), [
      `-> ${sourceUrl}`,
      `<- ${sourceUrl}. 200 `,
    ]);
  });

  it('composes source-bus HTML through the existing preview pipeline', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/page.html`;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL) return upgradeResponse();
      if (url === sourceUrl) {
        return new Response('<body><main>source page</main></body>', { status: 200 });
      }
      return new Response('', { status: 500 });
    };
    const req = authedRequest('/page');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();

    const response = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(composedBodies, ['<body><main>source page</main></body>']);
    assert.strictEqual(await response.text(), '<html><body><main>source page</main></body></html>');
    assert.strictEqual(daAdminCalls.length, 0);
    assert.deepStrictEqual(logs.map(([message]) => message), [
      `-> ${sourceUrl}`,
      `<- ${sourceUrl}. 200 `,
    ]);
  });

  [401, 403, 500, 503].forEach((status) => {
    it(`returns source-bus HTML status ${status} without composing a page`, async () => {
      const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/page.html`;
      fetchResponse = async ({ url }) => {
        if (url === PING_URL) return upgradeResponse();
        if (url === sourceUrl) {
          return new Response('source failed', {
            status,
            headers: { 'X-Error': 'source failed' },
          });
        }
        return new Response('', { status: 500 });
      };
      const req = authedRequest('/page');
      const daCtx = getDaCtx(req);
      const { daSourceGet } = await loadRoutes();

      const response = await daSourceGet({ req, env, daCtx });

      assert.strictEqual(response.status, status);
      assert.strictEqual(response.headers.get('X-Error'), 'source failed');
      assert.strictEqual(await response.text(), 'source failed');
      assert.deepStrictEqual(composedBodies, []);
    });
  });

  it('does not fall back to legacy content when a source-bus resource is missing', async () => {
    fetchResponse = async ({ url }) => (
      url === PING_URL ? upgradeResponse() : new Response('', { status: 404 })
    );
    daAdminResponse = async () => new Response('legacy image', { status: 200 });
    const req = authedRequest('/missing.png');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();

    const response = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(response.status, 404);
    assert.strictEqual(daAdminCalls.length, 0);
  });

  it('GETs legacy content when ping has no upgrade header', async () => {
    fetchResponse = async ({ url }) => (
      url === PING_URL ? upgradeResponse(false) : new Response('', { status: 500 })
    );
    daAdminResponse = async () => new Response('legacy image', { status: 200 });
    const req = authedRequest('/image.png');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();

    const response = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(await response.text(), 'legacy image');
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(daAdminCalls.length, 1);
    assert.strictEqual(
      daAdminCalls[0].url,
      `${DA_ADMIN}/source/${ORG}/${SITE}/image.png`,
    );
    assert.strictEqual(daAdminCalls[0].headers.get('Authorization'), AUTH);
  });

  [401, 403, 404, 500].forEach((status) => {
    it(`falls back to legacy GET when ping returns ${status}`, async () => {
      fetchResponse = async () => new Response('', { status });
      daAdminResponse = async () => new Response('legacy image', { status: 200 });
      const req = authedRequest('/image.png');
      const daCtx = getDaCtx(req);
      const { daSourceGet } = await loadRoutes();

      const response = await daSourceGet({ req, env, daCtx });

      assert.strictEqual(await response.text(), 'legacy image');
      assert.strictEqual(fetchCalls.length, 1);
      assert.strictEqual(daAdminCalls.length, 1);
    });
  });

  [
    new Error('Network connection lost.'),
    new DOMException('timed out', 'TimeoutError'),
  ].forEach((error) => {
    it(`falls back to legacy GET when ping fails with ${error.name}`, async () => {
      fetchResponse = async () => {
        throw error;
      };
      daAdminResponse = async () => new Response('legacy image', { status: 200 });
      const req = authedRequest('/image.png');
      const daCtx = getDaCtx(req);
      const { daSourceGet } = await loadRoutes();

      const response = await daSourceGet({ req, env, daCtx });

      assert.strictEqual(await response.text(), 'legacy image');
      assert.strictEqual(daAdminCalls.length, 1);
    });
  });

  it('HEADs a source-bus resource through api.aem.live', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/image.png`;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL) return upgradeResponse();
      if (url === sourceUrl) {
        return new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'image/png', 'Content-Length': '42' },
        });
      }
      return new Response('', { status: 500 });
    };
    const req = authedRequest('/image.png', { method: 'HEAD' });
    const daCtx = getDaCtx(req);
    const { daSourceHead } = await loadRoutes();

    const response = await daSourceHead({ env, daCtx });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('Content-Type'), 'image/png');
    assert.strictEqual(response.headers.get('Content-Length'), '42');
    assert.deepStrictEqual(fetchCalls.map(({ method }) => method), ['GET', 'HEAD']);
    assert.strictEqual(daAdminCalls.length, 0);
    assert.deepStrictEqual(logs.map(([message]) => message), [
      `-> HEAD ${sourceUrl}`,
      `<- HEAD ${sourceUrl}. 200 `,
    ]);
  });

  it('POSTs raw HTML to api.aem.live and does not write to da-admin', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/page.html`;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL) return upgradeResponse();
      if (url === sourceUrl) return new Response('', { status: 201 });
      return new Response('', { status: 500 });
    };
    const req = authedRequest('/page', { method: 'POST' });
    const daCtx = getDaCtx(req);
    const { daSourcePost } = await loadRoutes();

    const response = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(response.status, 201);
    const post = fetchCalls.find(({ method }) => method === 'POST');
    assert.ok(post);
    assert.strictEqual(post.url, sourceUrl);
    assert.strictEqual(post.headers.get('Authorization'), AUTH);
    assert.strictEqual(post.headers.get('Content-Type'), 'text/html');
    assert.strictEqual(post.body, '<body><main>edited</main></body>');
    assert.strictEqual(daAdminCalls.length, 0);
    assert.strictEqual(fetchCalls.filter(({ method }) => method === 'HEAD').length, 0);
    assert.deepStrictEqual(logs.map(([message]) => message), [
      `-> ${sourceUrl}`,
      `<- ${sourceUrl}. 201 `,
    ]);
  });

  it('POSTs FormData to da-admin and does not write to api.aem.live for legacy sites', async () => {
    fetchResponse = async () => upgradeResponse(false);
    daAdminResponse = async () => new Response('', { status: 200 });
    const req = authedRequest('/page', { method: 'POST' });
    const daCtx = getDaCtx(req);
    const { daSourcePost } = await loadRoutes();

    const response = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(daAdminCalls.length, 1);
    assert.strictEqual(daAdminCalls[0].method, 'POST');
    assert.strictEqual(daAdminCalls.filter(({ method }) => method === 'HEAD').length, 0);
    const body = await daAdminCalls[0].input.clone().formData();
    assert.strictEqual(
      await body.get('data').text(),
      '<body><main>edited</main></body>',
    );
  });

  [
    {
      title: 'uses api.aem.live when only source bus has the document',
      aemHead: 200,
      daHead: 404,
      backend: 'aem',
    },
    {
      title: 'uses da-admin when only legacy DA has the document',
      aemHead: 404,
      daHead: 200,
      backend: 'da',
    },
    {
      title: 'uses da-admin for a new document missing from both backends',
      aemHead: 404,
      daHead: 404,
      backend: 'da',
    },
    {
      title: 'uses api.aem.live when both backends have the document',
      aemHead: 200,
      daHead: 200,
      backend: 'aem',
    },
  ].forEach(({
    title, aemHead, daHead, backend,
  }) => {
    it(title, async () => {
      const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/page.html`;
      fetchResponse = async ({ url, method }) => {
        if (url === PING_URL) return new Response('', { status: 500 });
        if (url === sourceUrl && method === 'HEAD') {
          return new Response(null, { status: aemHead });
        }
        if (url === sourceUrl && method === 'POST') {
          return new Response('', { status: 201 });
        }
        return new Response('', { status: 500 });
      };
      daAdminResponse = async ({ method }) => (
        new Response(null, { status: method === 'HEAD' ? daHead : 200 })
      );
      const req = authedRequest('/page', { method: 'POST' });
      const daCtx = getDaCtx(req);
      const { daSourcePost } = await loadRoutes();

      const response = await daSourcePost({ req, env, daCtx });

      assert.strictEqual(response.status, backend === 'aem' ? 201 : 200);
      assert.strictEqual(fetchCalls.filter(({ method }) => method === 'HEAD').length, 1);
      assert.strictEqual(daAdminCalls.filter(({ method }) => method === 'HEAD').length, 1);
      assert.strictEqual(
        fetchCalls.filter(({ method }) => method === 'POST').length,
        backend === 'aem' ? 1 : 0,
      );
      assert.strictEqual(
        daAdminCalls.filter(({ method }) => method === 'POST').length,
        backend === 'da' ? 1 : 0,
      );
      assert.strictEqual(warnings.length, 0);
    });
  });

  it('uses da-admin when a backend HEAD fails', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/page.html`;
    fetchResponse = async ({ url, method }) => {
      if (url === PING_URL) return new Response('', { status: 500 });
      if (url === sourceUrl && method === 'HEAD') {
        throw new Error('Network connection lost.');
      }
      return new Response('', { status: 500 });
    };
    daAdminResponse = async ({ method }) => (
      new Response(null, { status: method === 'HEAD' ? 200 : 200 })
    );
    const req = authedRequest('/page', { method: 'POST' });
    const daCtx = getDaCtx(req);
    const { daSourcePost } = await loadRoutes();

    const response = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(fetchCalls.filter(({ method }) => method === 'POST').length, 0);
    assert.strictEqual(daAdminCalls.filter(({ method }) => method === 'HEAD').length, 1);
    assert.strictEqual(daAdminCalls.filter(({ method }) => method === 'POST').length, 1);
  });

  it('preserves explicit extensions when an uncertain write uses da-admin', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/sheet.json`;
    const adminUrl = `${DA_ADMIN}/source/${ORG}/${SITE}/sheet.json`;
    fetchResponse = async ({ url, method }) => {
      if (url === PING_URL) return new Response('', { status: 500 });
      if (url === sourceUrl && method === 'HEAD') {
        return new Response(null, { status: 404 });
      }
      return new Response('', { status: 500 });
    };
    daAdminResponse = async ({ method }) => (
      new Response(null, { status: method === 'HEAD' ? 200 : 200 })
    );
    const req = authedRequest('/sheet.json', { method: 'POST' });
    const daCtx = getDaCtx(req);
    const { daSourcePost } = await loadRoutes();

    const response = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      daAdminCalls.find(({ method }) => method === 'HEAD').url,
      adminUrl,
    );
    assert.strictEqual(
      daAdminCalls.find(({ method }) => method === 'POST').url,
      adminUrl,
    );
  });

  it('uses api.aem.live when its HEAD succeeds and da-admin HEAD fails', async () => {
    const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/page.html`;
    fetchResponse = async ({ url, method }) => {
      if (url === PING_URL) return new Response('', { status: 500 });
      if (url === sourceUrl && method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      if (url === sourceUrl && method === 'POST') {
        return new Response('', { status: 201 });
      }
      return new Response('', { status: 500 });
    };
    daAdminResponse = async ({ method }) => {
      if (method === 'HEAD') throw new Error('Network connection lost.');
      return new Response('', { status: 200 });
    };
    const req = authedRequest('/page', { method: 'POST' });
    const daCtx = getDaCtx(req);
    const { daSourcePost } = await loadRoutes();

    const response = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(response.status, 201);
    assert.strictEqual(fetchCalls.filter(({ method }) => method === 'POST').length, 1);
    assert.strictEqual(daAdminCalls.filter(({ method }) => method === 'HEAD').length, 1);
    assert.strictEqual(daAdminCalls.filter(({ method }) => method === 'POST').length, 0);
  });

  [401, 403, 404, 500].forEach((status) => {
    it(`POSTs to da-admin when ping returns ${status}`, async () => {
      fetchResponse = async () => new Response('', { status });
      daAdminResponse = async () => new Response('', { status: 200 });
      const req = authedRequest('/page', { method: 'POST' });
      const daCtx = getDaCtx(req);
      const { daSourcePost } = await loadRoutes();

      const response = await daSourcePost({ req, env, daCtx });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(fetchCalls.length, 2);
      assert.strictEqual(fetchCalls[0].method, 'GET');
      assert.strictEqual(fetchCalls[1].method, 'HEAD');
      assert.strictEqual(daAdminCalls.length, 2);
      assert.strictEqual(daAdminCalls[0].method, 'HEAD');
      assert.strictEqual(daAdminCalls[1].method, 'POST');
    });
  });

  [
    new Error('Network connection lost.'),
    new DOMException('timed out', 'TimeoutError'),
  ].forEach((error) => {
    it(`POSTs to da-admin when ping fails with ${error.name}`, async () => {
      fetchResponse = async () => {
        throw error;
      };
      daAdminResponse = async () => new Response('', { status: 200 });
      const req = authedRequest('/page', { method: 'POST' });
      const daCtx = getDaCtx(req);
      const { daSourcePost } = await loadRoutes();

      const response = await daSourcePost({ req, env, daCtx });

      assert.strictEqual(response.status, 200);
      assert.strictEqual(fetchCalls.length, 2);
      assert.strictEqual(fetchCalls[0].method, 'GET');
      assert.strictEqual(fetchCalls[1].method, 'HEAD');
      assert.strictEqual(daAdminCalls.length, 2);
      assert.strictEqual(daAdminCalls[0].method, 'HEAD');
      assert.strictEqual(daAdminCalls[1].method, 'POST');
    });
  });

  it('falls back after a probe error and probes again on the next request', async () => {
    let firstProbe = true;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL && firstProbe) {
        firstProbe = false;
        throw new Error('internal error; reference = test');
      }
      if (url === PING_URL) return upgradeResponse();
      return new Response('source image', { status: 200 });
    };
    daAdminResponse = async () => new Response('legacy image', { status: 200 });
    const req = authedRequest('/image.png');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();

    const first = await daSourceGet({ req, env, daCtx });
    const second = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(await first.text(), 'legacy image');
    assert.strictEqual(await second.text(), 'source image');
    assert.strictEqual(fetchCalls.filter(({ url }) => url === PING_URL).length, 2);
  });

  it('probes before every request so routing changes apply immediately', async () => {
    let upgraded = true;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL) return upgradeResponse(upgraded);
      return new Response('source image', { status: 200 });
    };
    daAdminResponse = async () => new Response('legacy image', { status: 200 });
    const req = authedRequest('/image.png');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();
    const first = await daSourceGet({ req, env, daCtx });
    upgraded = false;
    const second = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(await first.text(), 'source image');
    assert.strictEqual(await second.text(), 'legacy image');
    assert.strictEqual(fetchCalls.filter(({ url }) => url === PING_URL).length, 2);
    assert.strictEqual(daAdminCalls.length, 1);
  });

  it('does not use a stale routing decision when a later ping fails', async () => {
    let pingStatus = 200;
    fetchResponse = async ({ url }) => {
      if (url === PING_URL) {
        return pingStatus === 200
          ? upgradeResponse()
          : new Response('', { status: pingStatus });
      }
      return new Response('source image', { status: 200 });
    };
    daAdminResponse = async () => new Response('legacy image', { status: 200 });
    const req = authedRequest('/image.png');
    const daCtx = getDaCtx(req);
    const { daSourceGet } = await loadRoutes();

    const first = await daSourceGet({ req, env, daCtx });
    pingStatus = 500;
    const second = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(await first.text(), 'source image');
    assert.strictEqual(await second.text(), 'legacy image');
    assert.strictEqual(fetchCalls.filter(({ url }) => url === PING_URL).length, 2);
    assert.strictEqual(daAdminCalls.length, 1);
  });

  it('probes independently for GET, HEAD, and POST', async () => {
    fetchResponse = async ({ url, method }) => {
      if (url === PING_URL) return upgradeResponse();
      if (method === 'HEAD') return new Response(null, { status: 200 });
      if (method === 'POST') return new Response('', { status: 201 });
      return new Response('source image', { status: 200 });
    };
    const { daSourceGet, daSourceHead, daSourcePost } = await loadRoutes();
    const getReq = authedRequest('/image.png');
    const headReq = authedRequest('/image.png', { method: 'HEAD' });
    const postReq = authedRequest('/page', { method: 'POST' });

    await daSourceGet({ req: getReq, env, daCtx: getDaCtx(getReq) });
    await daSourceHead({ env, daCtx: getDaCtx(headReq) });
    await daSourcePost({ req: postReq, env, daCtx: getDaCtx(postReq) });

    const pingCalls = fetchCalls.filter(({ url }) => url === PING_URL);
    assert.strictEqual(pingCalls.length, 3);
    assert.ok(pingCalls.every(({ method }) => method === 'GET'));
    assert.strictEqual(daAdminCalls.length, 0);
  });
});
