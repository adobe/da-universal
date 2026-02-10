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

describe('GET handler', () => {
  describe('early returns', () => {
    let getHandler;

    beforeEach(async () => {
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': { daSourceGet: async () => new Response() },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
      })).default;
    });

    it('returns 404 when site is missing', async () => {
      const daCtx = getDaCtx(reqs.invalid);
      const env = {};

      const res = await getHandler({ req: reqs.invalid, env, daCtx });

      assert.strictEqual(res.status, 404);
    });

    it('returns 404 for /favicon.ico', async () => {
      const req = new Request('https://main--site--org.ue.da.live/favicon.ico');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 404);
    });

    it('returns robots.txt for /robots.txt', async () => {
      const req = new Request('https://main--site--org.ue.da.live/robots.txt');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      const body = await res.text();
      assert.ok(body.includes('User-agent:'));
      assert.ok(body.includes('Disallow:'));
    });
  });

  describe('gimme_cookie', () => {
    let getHandler;

    beforeEach(async () => {
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': { daSourceGet: async () => new Response() },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
        '../../src/routes/cookie.js': {
          getCookie: async () => new Response('cookie-set', { status: 200 }),
        },
      })).default;
    });

    it('returns getCookie response for /gimme_cookie', async () => {
      const req = new Request('https://main--site--org.ue.da.live/gimme_cookie');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'cookie-set');
    });
  });

  describe('resource extensions', () => {
    let getHandler;

    beforeEach(async () => {
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': { daSourceGet: async () => new Response() },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => new Response('proxied-resource', { status: 200 }),
        },
      })).default;
    });

    it('proxies to AEM for .css', async () => {
      const req = new Request('https://main--site--org.ue.da.live/style.css');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'proxied-resource');
    });

    it('proxies to AEM for .js', async () => {
      const req = new Request('https://main--site--org.ue.da.live/script.js');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'proxied-resource');
    });

    it('proxies to AEM for .json', async () => {
      const daCtx = getDaCtx(reqs.nonHtmlFile);
      const env = {};

      const res = await getHandler({ req: reqs.nonHtmlFile, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'proxied-resource');
    });
  });

  describe('assets', () => {
    describe('when daSourceGet returns 200', () => {
      let getHandler;

      beforeEach(async () => {
        getHandler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => new Response('<svg/>', {
              status: 200,
              headers: { 'Content-Type': 'image/svg+xml' },
            }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response('not used', { status: 404 }),
          },
        })).default;
      });

      it('sets Content-Disposition: attachment for SVG', async () => {
        const req = new Request('https://main--site--org.ue.da.live/folder/icon.svg');
        const daCtx = getDaCtx(req);
        const env = { daadmin: { fetch: () => {} } };

        const res = await getHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('Content-Disposition'), 'attachment');
      });

      it('does not set Content-Disposition for non-SVG assets', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png');
        const daCtx = getDaCtx(req);
        const env = { daadmin: { fetch: () => {} } };

        const res = await getHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('Content-Disposition'), null);
      });
    });

    describe('when both daSourceGet and AEM proxy fail', () => {
      let getHandler;

      beforeEach(async () => {
        getHandler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => Promise.reject(new Error('fail')),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => Promise.reject(new Error('fail')),
          },
        })).default;
      });

      it('returns 404', async () => {
        const req = new Request('https://main--site--org.ue.da.live/image.png');
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await getHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 404);
      });
    });

    describe('when daSourceGet fails and AEM proxy succeeds', () => {
      let getHandler;

      beforeEach(async () => {
        getHandler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => new Response('', { status: 404 }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response('from-aem', { status: 200 }),
          },
        })).default;
      });

      it('returns AEM proxy response', async () => {
        const req = new Request('https://main--site--org.ue.da.live/asset.png');
        const daCtx = getDaCtx(req);
        const env = {};

        const res = await getHandler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(await res.text(), 'from-aem');
      });
    });
  });

  describe('preview', () => {
    let getHandler;

    beforeEach(async () => {
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': { daSourceGet: async () => new Response() },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => new Response('preview-content', { status: 200 }),
        },
      })).default;
    });

    it('proxies to AEM when dapreview=on', async () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content?dapreview=on');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'preview-content');
    });

    it('proxies to AEM for preview host', async () => {
      const req = new Request('https://main--site--org.preview.da.live/folder/content');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'preview-content');
    });
  });

  describe('default content', () => {
    let getHandler;

    beforeEach(async () => {
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': {
          daSourceGet: async () => new Response('page-content', { status: 200 }),
        },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
      })).default;
    });

    it('returns daSourceGet for content path', async () => {
      const daCtx = getDaCtx(reqs.content);
      const env = {};

      const res = await getHandler({ req: reqs.content, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'page-content');
    });
  });
});
