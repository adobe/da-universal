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
import reqs from '../mocks/req.js';

const { getDaCtx } = await import('../../src/utils/daCtx.js');

describe('HEAD handler', () => {
  describe('early returns', () => {
    let headHandler;

    beforeEach(async () => {
      headHandler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': { daSourceHead: async () => new Response(null, { status: 200 }) },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response(null, { status: 200 }) },
      })).default;
    });

    it('returns 404 when site is missing', async () => {
      const daCtx = getDaCtx(reqs.invalid);
      const env = {};

      const res = await headHandler({ req: reqs.invalid, env, daCtx });

      assert.strictEqual(res.status, 404);
    });

    it('returns 404 for /favicon.ico', async () => {
      const req = new Request('https://main--site--org.ue.da.live/favicon.ico', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 404);
    });

    it('returns 200 for /robots.txt', async () => {
      const req = new Request('https://main--site--org.ue.da.live/robots.txt', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
    });
  });

  describe('resource extensions', () => {
    let headHandler;
    let aemProxyCallCount;

    beforeEach(async () => {
      aemProxyCallCount = 0;
      headHandler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': { daSourceHead: async () => new Response(null, { status: 200 }) },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => {
            aemProxyCallCount += 1;
            return new Response('proxied', { status: 200, headers: { 'Content-Type': 'text/css' } });
          },
        },
      })).default;
    });

    it('proxies to AEM for .css and returns no body', async () => {
      const req = new Request('https://main--site--org.ue.da.live/style.css', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '');
      assert.strictEqual(aemProxyCallCount, 1);
    });

    it('proxies to AEM for .js and returns no body', async () => {
      const req = new Request('https://main--site--org.ue.da.live/script.js', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '');
      assert.strictEqual(aemProxyCallCount, 1);
    });

    it('proxies to AEM for .json and returns no body', async () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content.json', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '');
      assert.strictEqual(aemProxyCallCount, 1);
    });
  });

  describe('assets', () => {
    describe('when daSourceHead returns 200', () => {
      let headHandler;

      beforeEach(async () => {
        headHandler = (await esmock('../../src/handlers/head.js', {
          '../../src/routes/da-admin.js': {
            daSourceHead: async () => new Response(null, {
              status: 200,
              headers: { 'Content-Type': 'image/png', 'Content-Length': '42' },
            }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response(null, { status: 404 }),
          },
        })).default;
      });

      it('returns DA response for .png', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(await res.text(), '');
        assert.strictEqual(res.headers.get('Content-Type'), 'image/png');
        assert.strictEqual(res.headers.get('Content-Length'), '42');
      });

      it('returns DA response for .svg', async () => {
        const req = new Request('https://main--site--org.ue.da.live/icon.svg', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(await res.text(), '');
      });
    });

    describe('when daSourceHead fails and AEM proxy succeeds', () => {
      let headHandler;

      beforeEach(async () => {
        headHandler = (await esmock('../../src/handlers/head.js', {
          '../../src/routes/da-admin.js': {
            daSourceHead: async () => new Response(null, { status: 404 }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response(null, { status: 200 }),
          },
        })).default;
      });

      it('falls back to AEM response', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(await res.text(), '');
      });
    });

    describe('when AEM proxy returns 401', () => {
      let headHandler;

      beforeEach(async () => {
        headHandler = (await esmock('../../src/handlers/head.js', {
          '../../src/routes/da-admin.js': {
            daSourceHead: async () => new Response(null, { status: 404 }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response(null, { status: 401 }),
          },
        })).default;
      });

      it('passes through 401 so client can authenticate', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 401);
      });
    });

    describe('when AEM proxy returns 403', () => {
      let headHandler;

      beforeEach(async () => {
        headHandler = (await esmock('../../src/handlers/head.js', {
          '../../src/routes/da-admin.js': {
            daSourceHead: async () => new Response(null, { status: 404 }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response(null, { status: 403 }),
          },
        })).default;
      });

      it('passes through 403 so client knows access is denied', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 403);
      });
    });

    describe('when AEM proxy returns 5xx', () => {
      let headHandler;

      beforeEach(async () => {
        headHandler = (await esmock('../../src/handlers/head.js', {
          '../../src/routes/da-admin.js': {
            daSourceHead: async () => new Response(null, { status: 404 }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response(null, { status: 500 }),
          },
        })).default;
      });

      it('returns 404 when AEM has a server error', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 404);
      });
    });

    describe('when both daSourceHead and AEM proxy fail', () => {
      let headHandler;

      beforeEach(async () => {
        headHandler = (await esmock('../../src/handlers/head.js', {
          '../../src/routes/da-admin.js': {
            daSourceHead: async () => Promise.reject(new Error('fail')),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => Promise.reject(new Error('fail')),
          },
        })).default;
      });

      it('returns 404', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png', { method: 'HEAD' });
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await headHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 404);
      });
    });
  });

  describe('preview / quick-edit', () => {
    let headHandler;

    beforeEach(async () => {
      // HTML always resolves via daSourceHead now; the preview / quick-edit / UE
      // distinction only affects the GET response body, not HEAD routing.
      headHandler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': { daSourceHead: async () => new Response(null, { status: 200 }) },
        '../../src/routes/aem-proxy.js': {
          // distinct status so a regression to routing through aemHead is caught
          handleAEMProxyRequest: async () => new Response('from-aem', { status: 400 }),
        },
      })).default;
    });

    it('calls daSourceHead for preview host', async () => {
      const req = new Request('https://main--site--org.preview.da.live/folder/content', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '');
    });

    it('calls daSourceHead when quick-edit param is present', async () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content?quick-edit', { method: 'HEAD' });
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await headHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '');
    });
  });

  describe('default content (DA source)', () => {
    let headHandler;

    beforeEach(async () => {
      headHandler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': {
          daSourceHead: async () => new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'text/html', 'Content-Length': '1234' },
          }),
        },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
      })).default;
    });

    it('calls daSourceHead for content path and returns no body', async () => {
      const daCtx = getDaCtx(reqs.content);
      const env = {};

      const res = await headHandler({ req: reqs.content, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), '');
    });

    it('forwards headers from daSourceHead', async () => {
      const daCtx = getDaCtx(reqs.content);
      const env = {};

      const res = await headHandler({ req: reqs.content, env, daCtx });

      assert.strictEqual(res.headers.get('Content-Type'), 'text/html');
      assert.strictEqual(res.headers.get('Content-Length'), '1234');
    });

    it('forwards 404 from daSourceHead when content is not found', async () => {
      const notFoundHandler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': {
          daSourceHead: async () => new Response(null, { status: 404 }),
        },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
      })).default;

      const daCtx = getDaCtx(reqs.content);
      const env = {};

      const res = await notFoundHandler({ req: reqs.content, env, daCtx });

      assert.strictEqual(res.status, 404);
    });

    it('forwards 401 from daSourceHead when not authenticated', async () => {
      const unauthHandler = (await esmock('../../src/handlers/head.js', {
        '../../src/routes/da-admin.js': {
          daSourceHead: async () => new Response(null, { status: 401 }),
        },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
      })).default;

      const daCtx = getDaCtx(reqs.content);
      const env = {};

      const res = await unauthHandler({ req: reqs.content, env, daCtx });

      assert.strictEqual(res.status, 401);
    });
  });
});
