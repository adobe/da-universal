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
const { PREVIEW_HOST, UpstreamError } = await import('../../src/utils/upstream.js');

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
    let getCookieArgs;

    beforeEach(async () => {
      getCookieArgs = undefined;
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': { daSourceGet: async () => new Response() },
        '../../src/routes/aem-proxy.js': { handleAEMProxyRequest: async () => new Response() },
        '../../src/routes/cookie.js': {
          getCookie: async (args) => {
            getCookieArgs = args;
            return new Response('cookie-set', { status: 200 });
          },
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
      assert.strictEqual(getCookieArgs.req, req);
      assert.strictEqual(getCookieArgs.env, env);
      assert.strictEqual(getCookieArgs.daCtx, daCtx);
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

    it('proxies to AEM for explicit .html', async () => {
      const req = new Request('https://main--site--org.preview.da.live/folder/content.html');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'proxied-resource');
    });
  });

  describe('JSON sheets', () => {
    it('starts the AEM read before the DA JSON read settles', async () => {
      const req = new Request('https://main--site--org.preview.da.live/config.json');
      let resolveSource;
      const source = new Promise((resolve) => {
        resolveSource = resolve;
      });
      let aemStarted = false;
      const handler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': { daSourceGet: async () => source },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => {
            aemStarted = true;
            return new Response('{"code":true}');
          },
        },
      })).default;

      const pending = handler({ req, env: {}, daCtx: getDaCtx(req) });
      const startedBeforeSourceSettled = aemStarted;
      resolveSource(new Response(null, { status: 404 }));
      const res = await pending;

      assert.ok(startedBeforeSourceSettled);
      assert.strictEqual(await res.text(), '{"code":true}');
    });

    ['json', 'JSON'].forEach((ext) => {
      it(`falls back to AEM for code-stored .${ext} when DA returns 404`, async () => {
        const req = new Request(`https://main--site--org.preview.da.live/config.${ext}?limit=1`);
        const daCtx = getDaCtx(req);
        const body = '{"code":true}';
        let sourceRead = false;
        const handler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => {
              sourceRead = true;
              return new Response(null, { status: 404 });
            },
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async (args) => {
              assert.ok(sourceRead);
              assert.strictEqual(args.req, req);
              assert.strictEqual(args.daCtx, daCtx);
              return new Response(body, { headers: { 'Content-Type': 'application/json' } });
            },
          },
        })).default;

        const res = await handler({ req, env: {}, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('Content-Type'), 'application/json');
        assert.strictEqual(await res.text(), body);
      });
    });

    [401, 403, 500, 503].forEach((status) => {
      it(`prefers AEM 200 for JSON when DA returns ${status}`, async () => {
        const req = new Request('https://main--site--org.preview.da.live/config.json');
        const response = new Response('{"code":true}', {
          headers: { 'Content-Type': 'application/json' },
        });
        const handler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => new Response(null, { status }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => response,
          },
        })).default;

        const res = await handler({ req, env: {}, daCtx: getDaCtx(req) });

        assert.strictEqual(res, response);
      });
    });

    [500, 503].forEach((status) => {
      [404, 'failure'].forEach((result) => {
        it(`preserves DA ${status} for JSON when AEM returns ${result}`, async () => {
          const req = new Request('https://main--site--org.preview.da.live/config.json');
          const response = new Response('DA error', { status });
          const handler = (await esmock('../../src/handlers/get.js', {
            '../../src/routes/da-admin.js': { daSourceGet: async () => response },
            '../../src/routes/aem-proxy.js': {
              handleAEMProxyRequest: async () => {
                if (result === 'failure') {
                  throw new UpstreamError(PREVIEW_HOST, new TypeError('fetch failed'));
                }
                return new Response(null, { status: result });
              },
            },
          })).default;

          const res = await handler({ req, env: {}, daCtx: getDaCtx(req) });

          assert.strictEqual(res, response);
        });
      });
    });

    [404, 'failure'].forEach((result) => {
      it(`handles AEM ${result} after DA returns 404 for JSON`, async () => {
        const req = new Request('https://main--site--org.preview.da.live/config.json');
        const handler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => new Response(null, { status: 404 }),
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => {
              if (result === 'failure') {
                throw new UpstreamError(PREVIEW_HOST, new TypeError('fetch failed'));
              }
              return new Response(null, { status: result });
            },
          },
        })).default;

        const res = await handler({ req, env: {}, daCtx: getDaCtx(req) });

        assert.strictEqual(res.status, 404);
        assert.strictEqual(await res.text(), '');
      });
    });

    ['json', 'JSON'].forEach((ext) => {
      it(`reads an unpreviewed .${ext} sheet from DA without changing the JSON`, async () => {
        const body = '{"total":1,"data":[{"title":"Unpreviewed"}]}';
        const req = new Request(`https://main--site--org.preview.da.live/folder/content.${ext}?limit=1`, {
          headers: { Authorization: 'Bearer test-token' },
        });
        const daCtx = getDaCtx(req);
        const { daSourceGet } = await esmock('../../src/routes/da-admin.js', {
          '../../src/storage/site.js': {
            default: async () => ({ exists: true, onSourceBus: false }),
          },
        });
        const handler = (await esmock('../../src/handlers/get.js', {
          '../../src/routes/da-admin.js': { daSourceGet },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response('{"code":true}', {
              headers: { 'Content-Type': 'application/json' },
            }),
          },
        })).default;
        const env = {
          DA_ADMIN: 'https://admin.da.live',
          daadmin: {
            fetch: async (url, init) => {
              assert.strictEqual(url.toString(), 'https://admin.da.live/source/org/site/folder/content.json');
              assert.strictEqual(init.method, 'GET');
              assert.strictEqual(init.headers.get('Authorization'), 'Bearer test-token');
              return new Response(body, { headers: { 'Content-Type': 'application/json' } });
            },
          },
        };

        const res = await handler({ req, env, daCtx });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('Content-Type'), 'application/json');
        assert.strictEqual(await res.text(), body);
      });
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

  describe('preview / quick-edit', () => {
    let getHandler;

    beforeEach(async () => {
      // HTML always composes via daSourceGet now; the preview / quick-edit / UE
      // distinction is applied as a layer inside daSourceGet, not routed here.
      getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': {
          daSourceGet: async () => new Response('composed-content', { status: 200 }),
        },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => new Response('from-aem', { status: 200 }),
        },
      })).default;
    });

    it('composes via daSourceGet for preview host', async () => {
      const req = new Request('https://main--site--org.preview.da.live/folder/content');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'composed-content');
    });

    it('composes via daSourceGet when quick-edit is requested', async () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content?quick-edit');
      const daCtx = getDaCtx(req);
      const env = {};

      const res = await getHandler({ req, env, daCtx });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'composed-content');
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

describe('GET handler resource reads', () => {
  let getHandler;

  beforeEach(async () => {
    getHandler = (await esmock('../../src/handlers/get.js', {
      '../../src/routes/da-admin.js': { daSourceGet: async () => new Response() },
      '../../src/routes/aem-proxy.js': {
        handleAEMProxyRequest: async () => {
          throw new UpstreamError(PREVIEW_HOST, new TypeError('fetch failed'));
        },
      },
    })).default;
  });

  it('refuses a stylesheet the preview host could not answer with a bodyless 503', async () => {
    const req = new Request('https://main--site--org.ue.da.live/styles/styles.css');
    const daCtx = getDaCtx(req);

    const res = await getHandler({ req, env: {}, daCtx });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.headers.get('Retry-After'), '5');
    assert.match(res.headers.get('x-error'), /preview host failed/);
    // an HTML shell would only corrupt a stylesheet the browser is parsing as CSS
    assert.strictEqual(await res.text(), '');
  });
});
