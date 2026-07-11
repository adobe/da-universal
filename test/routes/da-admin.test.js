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

const ORG = 'myorg';
const SITE = 'mysite';
const DA_ADMIN = 'https://admin.da.live';
const AEM_API = 'https://api.aem.live';

const BASE_DA_CTX = {
  org: ORG,
  site: SITE,
  ref: 'main',
  path: '/folder/page',
  ext: 'html',
  filename: 'page.html',
  name: 'page',
  authToken: 'Bearer test-token',
  siteToken: null,
  isLocal: false,
  orgSiteInPath: false,
};

describe('da-admin routes', () => {
  let daSourceGet;
  let daSourceHead;
  let daSourcePost;
  let globalFetchCalls;
  let daadminFetchCalls;
  let globalFetchResponses;
  let daadminFetchResponses;
  let env;
  let originalFetch;

  function makeGlobalFetch() {
    return async (urlOrReq, opts) => {
      const url = urlOrReq instanceof Request ? urlOrReq.url : String(urlOrReq);
      const method = opts?.method || (urlOrReq instanceof Request ? urlOrReq.method : 'GET');
      globalFetchCalls.push({ url, method, opts });
      return globalFetchResponses.get(url) ?? new Response('not found', { status: 404 });
    };
  }

  function makeDaadminFetch() {
    return async (urlOrReq, opts) => {
      const url = urlOrReq instanceof Request ? urlOrReq.url : String(urlOrReq);
      const method = opts?.method || (urlOrReq instanceof Request ? urlOrReq.method : 'GET');
      daadminFetchCalls.push({
        url, method, opts, req: urlOrReq instanceof Request ? urlOrReq : null,
      });
      return daadminFetchResponses.get(url) ?? new Response('not found', { status: 404 });
    };
  }

  const SHARED_MOCKS = {
    '../../src/utils/aemCtx.js': {
      getAemCtx: () => ({
        previewUrl: 'https://main--mysite--myorg.aem.page',
        previewHostname: 'main--mysite--myorg.aem.page',
        liveUrl: 'https://main--mysite--myorg.aem.live',
        siteToken: null,
      }),
      getAEMHtml: async () => '<head><title>Test</title></head>',
      withAemAuth: (_ctx, init) => init ?? {},
    },
    '../../src/ue/ue.js': {
      prepareHtml: async (_daCtx, _aemCtx, html) => `<html><body>${html}</body></html>`,
    },
    '../../src/storage/config.js': {
      getSiteConfig: async () => null,
    },
    '../../src/helpers/source.js': {
      default: async () => ({ data: '<body><p>edited</p></body>' }),
    },
    '../../src/ue/attributes.js': {
      removeUEAttributes: (node) => node,
      unwrapParagraphs: (node) => node,
    },
    '../../src/ue/rewrite-images.js': {
      restoreAbsoluteImages: () => {},
    },
  };

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    globalFetchCalls = [];
    daadminFetchCalls = [];
    globalFetchResponses = new Map();
    daadminFetchResponses = new Map();

    globalThis.fetch = makeGlobalFetch();
    env = {
      DA_ADMIN,
      UE_HOST: 'ue.da.live',
      UE_SERVICE: 'https://universal-editor-service.adobe.io',
      daadmin: { fetch: makeDaadminFetch() },
    };

    const mod = await esmock('../../src/routes/da-admin.js', SHARED_MOCKS);
    daSourceGet = mod.daSourceGet;
    daSourceHead = mod.daSourceHead;
    daSourcePost = mod.daSourcePost;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // daSourceGet — non-HTML
  // =========================================================================

  describe('daSourceGet (non-HTML)', () => {
    const daCtx = {
      ...BASE_DA_CTX, ext: 'json', path: '/folder/data', filename: 'data.json', name: 'data',
    };
    const req = new Request('https://main--mysite--myorg.ue.da.live/folder/data.json');
    const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
    const hlx6SourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/data`;
    const daSourceUrl = `${DA_ADMIN}/source/${ORG}/${SITE}/folder/data`;

    it('fetches from api.aem.live when site is hlx6', async () => {
      const hlx6Content = '{"data":[]}';
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(hlx6SourceUrl, new Response(hlx6Content, { status: 200 }));

      const resp = await daSourceGet({ req, env, daCtx });

      assert.strictEqual(resp.status, 200);
      assert.strictEqual(await resp.text(), hlx6Content);
      assert.strictEqual(daadminFetchCalls.length, 0, 'should not call da-admin');
    });

    it('fetches from da-admin when site is not hlx6', async () => {
      const daContent = '{"sheets":[]}';
      // probe returns 404 (default) → not hlx6
      daadminFetchResponses.set(daSourceUrl, new Response(daContent, { status: 200 }));

      const resp = await daSourceGet({ req, env, daCtx });

      assert.strictEqual(resp.status, 200);
      assert.strictEqual(await resp.text(), daContent);
      const hlx6SourceCalls = globalFetchCalls.filter((c) => c.url === hlx6SourceUrl);
      assert.strictEqual(hlx6SourceCalls.length, 0, 'should not call api.aem.live source');
    });

    it('returns da-admin 404 when not hlx6 and source missing', async () => {
      // probe 404 (default), da-admin 404 (default)
      const resp = await daSourceGet({ req, env, daCtx });
      assert.strictEqual(resp.status, 404);
    });

    it('returns 401 when no authToken', async () => {
      const resp = await daSourceGet({ req, env, daCtx: { ...daCtx, authToken: undefined } });
      assert.strictEqual(resp.status, 401);
    });
  });

  // =========================================================================
  // daSourceGet — HTML
  // =========================================================================

  describe('daSourceGet (HTML)', () => {
    const req = new Request('https://main--mysite--myorg.ue.da.live/folder/page');
    const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
    const hlx6SourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;
    const daSourceUrl = `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`;

    it('fetches from api.aem.live and uses its content when site is hlx6', async () => {
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(
        hlx6SourceUrl,
        new Response('<body><main>hlx6 content</main></body>', { status: 200 }),
      );

      const resp = await daSourceGet({ req, env, daCtx: BASE_DA_CTX });

      assert.strictEqual(resp.status, 200);
      assert.ok((await resp.text()).includes('hlx6 content'));
      assert.strictEqual(daadminFetchCalls.length, 0, 'should not call da-admin');
    });

    it('fetches from da-admin and uses its content when site is not hlx6', async () => {
      // probe 404 (default) → not hlx6
      daadminFetchResponses.set(
        daSourceUrl,
        new Response('<body><main>da-admin content</main></body>', { status: 200 }),
      );

      const resp = await daSourceGet({ req, env, daCtx: BASE_DA_CTX });

      assert.strictEqual(resp.status, 200);
      assert.ok((await resp.text()).includes('da-admin content'));
      const hlx6SourceCalls = globalFetchCalls.filter((c) => c.url === hlx6SourceUrl);
      assert.strictEqual(hlx6SourceCalls.length, 0, 'should not call api.aem.live source');
    });

    it('returns 200 with template when source returns non-200', async () => {
      // probe 404 (default) → not hlx6; da-admin 404 (default) → use template
      const resp = await daSourceGet({ req, env, daCtx: BASE_DA_CTX });
      assert.strictEqual(resp.status, 200);
    });

    it('returns 404 when head.html is unavailable', async () => {
      const mod = await esmock('../../src/routes/da-admin.js', {
        ...SHARED_MOCKS,
        '../../src/utils/aemCtx.js': {
          ...SHARED_MOCKS['../../src/utils/aemCtx.js'],
          getAEMHtml: async () => undefined,
        },
      });

      const resp = await mod.daSourceGet({ req, env, daCtx: BASE_DA_CTX });
      assert.strictEqual(resp.status, 404);
    });

    it('returns 401 when no authToken', async () => {
      const resp = await daSourceGet({ req, env, daCtx: { ...BASE_DA_CTX, authToken: undefined } });
      assert.strictEqual(resp.status, 401);
    });
  });

  // =========================================================================
  // daSourceHead
  // =========================================================================

  describe('daSourceHead', () => {
    it('returns 401 with no body when no authToken', async () => {
      const resp = await daSourceHead({ env, daCtx: { ...BASE_DA_CTX, authToken: undefined } });
      assert.strictEqual(resp.status, 401);
      assert.strictEqual(await resp.text(), '');
    });

    it('returns no Content-Type in the 401 response', async () => {
      const resp = await daSourceHead({ env, daCtx: { ...BASE_DA_CTX, authToken: undefined } });
      assert.strictEqual(resp.headers.get('Content-Type'), null);
    });

    it('HEADs api.aem.live when site is hlx6', async () => {
      const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
      const headUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(headUrl, new Response(null, { status: 200 }));

      const resp = await daSourceHead({ env, daCtx: BASE_DA_CTX });

      assert.strictEqual(resp.status, 200);
      const hlx6HeadCalls = globalFetchCalls.filter(
        (c) => c.url === headUrl && c.method === 'HEAD',
      );
      assert.strictEqual(hlx6HeadCalls.length, 1);
      assert.strictEqual(daadminFetchCalls.length, 0);
    });

    it('HEADs da-admin when site is not hlx6', async () => {
      // probe returns 404 (default) → not hlx6
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response(null, { status: 200 }),
      );

      const resp = await daSourceHead({ env, daCtx: BASE_DA_CTX });

      assert.strictEqual(resp.status, 200);
      assert.strictEqual(daadminFetchCalls.length, 1);
      const hlx6HeadCalls = globalFetchCalls.filter(
        (c) => c.url.includes('/folder/page.html') && c.method === 'HEAD',
      );
      assert.strictEqual(hlx6HeadCalls.length, 0);
    });

    it('probes api.aem.live on cache miss, uses hlx6 when probe succeeds', async () => {
      const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
      const headUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(headUrl, new Response(null, { status: 200 }));

      const resp = await daSourceHead({ env, daCtx: BASE_DA_CTX });

      assert.strictEqual(resp.status, 200);
      const hlx6Calls = globalFetchCalls.filter((c) => c.url.startsWith(AEM_API));
      assert.ok(hlx6Calls.length >= 2, 'should probe then HEAD api.aem.live');
      assert.strictEqual(daadminFetchCalls.length, 0);
    });
  });

  // =========================================================================
  // daSourcePost
  // =========================================================================

  describe('daSourcePost', () => {
    const req = new Request('https://main--mysite--myorg.ue.da.live/folder/page', { method: 'POST' });

    it('POSTs raw body to api.aem.live when cache says hlx6', async () => {
      const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
      const postUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(postUrl, new Response(null, { status: 200 }));

      await daSourcePost({ req, env, daCtx: BASE_DA_CTX });

      const hlx6Posts = globalFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(hlx6Posts.length, 1);
      assert.ok(hlx6Posts[0].url.startsWith(AEM_API));

      const daadminPosts = daadminFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(daadminPosts.length, 0);
    });

    it('POSTs FormData to da-admin when cache says not hlx6', async () => {
      // warm cache via GET: da-admin 200
      const getReq = new Request('https://main--mysite--myorg.ue.da.live/folder/page');
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response('<body></body>', { status: 200 }),
      );
      await daSourceGet({ req: getReq, env, daCtx: BASE_DA_CTX });

      daadminFetchCalls = [];
      globalFetchCalls = [];
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response(null, { status: 200 }),
      );

      await daSourcePost({ req, env, daCtx: BASE_DA_CTX });

      const daadminPosts = daadminFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(daadminPosts.length, 1);
      assert.ok(daadminPosts[0].url.endsWith('/folder/page.html'));

      const hlx6Posts = globalFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(hlx6Posts.length, 0);
    });

    it('sends Content-Type: text/html header (not FormData) when posting to hlx6', async () => {
      const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
      const postUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(postUrl, new Response(null, { status: 200 }));

      await daSourcePost({ req, env, daCtx: BASE_DA_CTX });

      const hlx6Post = globalFetchCalls.find((c) => c.method === 'POST');
      assert.ok(hlx6Post, 'should have a POST to api.aem.live');
      const ct = hlx6Post.opts?.headers?.['Content-Type'];
      assert.ok(ct?.startsWith('text/html'), `expected Content-Type: text/html, got: ${ct}`);
    });

    it('passes Request to daadmin.fetch when posting to da-admin', async () => {
      const getReq = new Request('https://main--mysite--myorg.ue.da.live/folder/page');
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response('<body></body>', { status: 200 }),
      );
      await daSourceGet({ req: getReq, env, daCtx: BASE_DA_CTX });

      daadminFetchCalls = [];
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response(null, { status: 200 }),
      );

      await daSourcePost({ req, env, daCtx: BASE_DA_CTX });

      const daPost = daadminFetchCalls.find((c) => c.method === 'POST');
      assert.ok(daPost, 'should have a POST to da-admin');
      assert.ok(daPost.req instanceof Request, 'should pass a Request to daadmin.fetch');
    });

    it('routes to hlx6 on cache miss when probe confirms hlx6 site', async () => {
      const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
      const postUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(postUrl, new Response(null, { status: 200 }));

      await daSourcePost({ req, env, daCtx: BASE_DA_CTX });

      const hlx6Posts = globalFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(hlx6Posts.length, 1);
      assert.ok(hlx6Posts[0].url.startsWith(AEM_API));
    });

    it('routes to da-admin on cache miss when probe returns non-200', async () => {
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response(null, { status: 200 }),
      );
      // probe returns 404 (default)

      await daSourcePost({ req, env, daCtx: BASE_DA_CTX });

      const daadminPosts = daadminFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(daadminPosts.length, 1);
      const hlx6Posts = globalFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(hlx6Posts.length, 0);
    });
  });

  // =========================================================================
  // Cache warm-up: GET sets cache used by subsequent POST without extra probe
  // =========================================================================

  describe('hlx6 cache across GET → POST', () => {
    it('POST after hlx6 GET skips probe and posts to api.aem.live', async () => {
      const postReq = new Request('https://main--mysite--myorg.ue.da.live/folder/page', { method: 'POST' });
      const probeUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/`;
      const sourceUrl = `${AEM_API}/${ORG}/sites/${SITE}/source/folder/page.html`;

      // probe URL set so GET warms cache as hlx6=true
      globalFetchResponses.set(probeUrl, new Response(null, { status: 200 }));
      globalFetchResponses.set(sourceUrl, new Response('<body></body>', { status: 200 }));
      await daSourceGet({ env, daCtx: BASE_DA_CTX });

      globalFetchCalls = [];
      daadminFetchCalls = [];
      globalFetchResponses.set(sourceUrl, new Response(null, { status: 200 }));

      await daSourcePost({ req: postReq, env, daCtx: BASE_DA_CTX });

      // Probe should not be called (cache warm)
      const probeCalls = globalFetchCalls.filter(
        (c) => c.url.endsWith('/source/') && c.method === 'HEAD',
      );
      assert.strictEqual(probeCalls.length, 0, 'should not probe when cache is warm');

      const hlx6Posts = globalFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(hlx6Posts.length, 1);
    });

    it('POST after non-hlx6 GET skips probe and posts to da-admin', async () => {
      const getReq = new Request('https://main--mysite--myorg.ue.da.live/folder/page');
      const postReq = new Request('https://main--mysite--myorg.ue.da.live/folder/page', { method: 'POST' });

      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response('<body></body>', { status: 200 }),
      );
      await daSourceGet({ req: getReq, env, daCtx: BASE_DA_CTX });

      globalFetchCalls = [];
      daadminFetchCalls = [];
      daadminFetchResponses.set(
        `${DA_ADMIN}/source/${ORG}/${SITE}/folder/page.html`,
        new Response(null, { status: 200 }),
      );

      await daSourcePost({ req: postReq, env, daCtx: BASE_DA_CTX });

      // No probe to api.aem.live at all
      assert.strictEqual(globalFetchCalls.length, 0, 'should not call api.aem.live when cache says not hlx6');

      const daadminPosts = daadminFetchCalls.filter((c) => c.method === 'POST');
      assert.strictEqual(daadminPosts.length, 1);
    });
  });
});
