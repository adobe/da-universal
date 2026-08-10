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

const authedReq = (url) => new Request(url, { headers: { Authorization: 'Bearer t' } });

/**
 * Builds the route module with the network replaced. `bus` answers the source bus, `legacy`
 * answers da-admin, and every request to each is recorded so a test can assert where a read
 * went and what it carried.
 */
const build = async (overrides = {}) => {
  const {
    bus = () => new Response('<body>from the source bus</body>', { status: 200, headers: { etag: '"busetag"' } }),
    legacy = () => new Response('<body>from da-admin</body>', { status: 200 }),
  } = overrides;
  // `in overrides` rather than a destructured default on these two, so passing an explicit
  // undefined really does simulate a missing head.html and a probe that could not answer
  const headHtml = 'headHtml' in overrides ? overrides.headHtml : '<meta name="from" content="aem" />';
  const onSourceBus = 'onSourceBus' in overrides ? overrides.onSourceBus : false;
  const seen = {
    bus: [], legacy: [], ue: 0, lookups: 0,
  };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.bus.push({ url: request.url, method: request.method, headers: request.headers });
    return bus(request);
  };
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    AEM_API: 'https://api.aem.live',
    daadmin: {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        seen.legacy.push({ url: request.url, method: request.method, headers: request.headers });
        return legacy(request);
      },
    },
  };
  const mod = await esmock('../../src/routes/da-admin.js', {
    '../../src/storage/source-bus.js': {
      default: async () => {
        seen.lookups += 1;
        return onSourceBus;
      },
    },
    '../../src/utils/aemCtx.js': {
      getAemCtx: () => ({}),
      getAEMHtml: async () => headHtml,
    },
    '../../src/render/compose.js': {
      composeHtml: async (daCtx, aemCtx, bodyHtml) => ({ bodyHtml }),
      serializeHtml: (tree) => `<html>${tree.bodyHtml}</html>`,
    },
    '../../src/ue/ue.js': {
      applyUEInstrumentation: async () => { seen.ue += 1; },
    },
    '../../src/storage/config.js': {
      getSiteConfig: async () => { throw new Error('no config'); },
    },
  });
  return { ...mod, env, seen };
};

describe('when /ping cannot say which store holds the site', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // picking a store without an answer is a coin flip, and reading the wrong one hands the author
  // the wrong document at 200
  it('refuses an html read with 503 and touches neither store', async () => {
    const { daSourceGet, env, seen } = await build({ onSourceBus: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
  });

  it('asks the caller to retry', async () => {
    const { daSourceGet, env } = await build({ onSourceBus: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.ok(Number(res.headers.get('Retry-After')) > 0);
  });

  it('refuses a non-html read too', async () => {
    const { daSourceGet, env, seen } = await build({ onSourceBus: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
  });

  it('refuses a HEAD with 503 and no body', async () => {
    const { daSourceHead, env, seen } = await build({ onSourceBus: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(await res.text(), '');
    assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
  });

  // both 503s carry the same status and a body nobody parses, so the header is what tells an
  // unanswerable probe apart from a store that was picked and then failed
  it('names the failed probe in x-error', async () => {
    const { daSourceGet, env } = await build({ onSourceBus: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.match(res.headers.get('x-error'), /ping/);
  });

  it('names the failed probe on a HEAD too', async () => {
    const { daSourceHead, env } = await build({ onSourceBus: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

    assert.match(res.headers.get('x-error'), /ping/);
  });
});

describe('reading from the store that holds the site', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('an html read on a source-bus site', () => {
    it('reads from the source bus', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy.length, 0);
      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    it('composes the source-bus document, not da-admin\'s copy of it', async () => {
      const { daSourceGet, env } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(await res.text(), '<html><body>from the source bus</body></html>');
    });

    it('forwards the author token to the source bus', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].headers.get('Authorization'), 'Bearer t');
    });
  });

  describe('an html read on a legacy site', () => {
    it('reads from da-admin over the service binding', async () => {
      const { daSourceGet, env, seen } = await build();
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
    });
  });

  describe('the store lookup on a read', () => {
    it('happens once, and only the store it named is asked', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.lookups, 1);
      assert.strictEqual(seen.legacy.length, 0);
    });
  });

  describe('when the store cannot be reached at all', () => {
    it('answers 503 rather than throwing on an html read', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('answers 503 rather than throwing on a non-html read', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      assert.strictEqual((await daSourceGet({ req, env, daCtx: getDaCtx(req) })).status, 503);
    });

    it('answers 503 rather than throwing on a HEAD', async () => {
      const { daSourceHead, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      assert.strictEqual((await daSourceHead({ env, daCtx: getDaCtx(req) })).status, 503);
    });

    it('answers 503 rather than throwing when da-admin is unreachable', async () => {
      const { daSourceGet, env } = await build({
        legacy: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      assert.strictEqual((await daSourceGet({ req, env, daCtx: getDaCtx(req) })).status, 503);
    });

    it('asks the caller to retry', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    // the read refusals are rendered, by the preview iframe and by quick-edit, so they carry a
    // body that says what happened rather than an empty page
    it('says what happened, on both GET paths', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const html = authedReq('https://main--site--org.ue.da.live/folder/content');
      const asset = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const htmlRes = await daSourceGet({ req: html, env, daCtx: getDaCtx(html) });
      const assetRes = await daSourceGet({ req: asset, env, daCtx: getDaCtx(asset) });

      assert.match(await htmlRes.text(), /503/);
      assert.match(await assetRes.text(), /503/);
    });

    it('answers 503 with no body on a HEAD', async () => {
      const { daSourceHead, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(await res.text(), '');
      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    // a rate limit, a DNS failure and a timeout all arrive here as the same 503, and the worker
    // log is not where the caller is looking
    it('names the cause in x-error on an html read', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('Network connection lost'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'TypeError: Network connection lost');
    });

    it('names the cause on a non-html read', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('Network connection lost'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'TypeError: Network connection lost');
    });

    it('names the cause on a HEAD', async () => {
      const { daSourceHead, env } = await build({
        onSourceBus: true,
        bus: () => { throw new DOMException('The operation timed out', 'TimeoutError'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'TimeoutError: The operation timed out');
    });

    it('names the cause when da-admin is unreachable', async () => {
      const { daSourceGet, env } = await build({
        legacy: () => { throw new TypeError('Network connection lost'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'TypeError: Network connection lost');
    });

    // a header value cannot span lines, so a message carrying a stack would throw where the 503
    // is built and turn the 503 into a 500
    it('collapses a multi-line cause onto one line', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('lost\n    at fetch'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'TypeError: lost at fetch');
    });
  });

  describe('what a store status means', () => {
    // turning any of these into the blank starter template at HTTP 200 hands the author an
    // empty document to save over a page that exists
    [401, 403, 429, 500, 502].forEach((status) => {
      it(`keeps the store's ${status} as the status`, async () => {
        const { daSourceGet, env } = await build({
          onSourceBus: true,
          bus: () => new Response('upstream said no', { status }),
        });
        const req = authedReq('https://main--site--org.ue.da.live/folder/content');

        const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

        assert.strictEqual(res.status, status);
      });
    });

    // the body is the store's own except on a refusal, where it is replaced below
    [429, 500, 502].forEach((status) => {
      it(`passes the store's body through on a ${status}`, async () => {
        const { daSourceGet, env } = await build({
          onSourceBus: true,
          bus: () => new Response('upstream said no', { status }),
        });
        const req = authedReq('https://main--site--org.ue.da.live/folder/content');

        const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

        assert.strictEqual(await res.text(), 'upstream said no');
      });
    });

    // /ping reads no token, so the store is the only thing to see one. the authorbus extension
    // matches this sentinel exactly and recovers by refetching /gimme_cookie and refreshing
    [401, 403].forEach((status) => {
      it(`serves the da:401 shell when the store answers ${status} on an html read`, async () => {
        const { daSourceGet, env } = await build({
          onSourceBus: true,
          bus: () => new Response('', { status }),
        });
        const req = authedReq('https://main--site--org.ue.da.live/folder/content');

        const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

        assert.strictEqual(res.status, status);
        assert.match(await res.text(), /content="da:401"/);
      });
    });

    it('does not ask the caller to retry a 401, since retrying cannot help', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => new Response('', { status: 401 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('Retry-After'), null);
    });

    it('passes a store 401 through bare on a non-html read, which renders nothing', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => new Response('', { status: 401 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(await res.text(), '');
    });

    it('answers a store 401 on a HEAD with no body', async () => {
      const { daSourceHead, env } = await build({
        onSourceBus: true,
        bus: () => new Response('', { status: 401 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(await res.text(), '');
    });

    // a wrong yes from /ping produces this, and there is no second store to retry against: the
    // author is handed the starter template over whatever da-admin still holds
    it('composes the starter template on a 404 without asking the other store', async () => {
      const { daSourceGet, env, seen } = await build({
        onSourceBus: true,
        bus: () => new Response('', { status: 404 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.ok(!(await res.text()).includes('from the source bus'));
      assert.strictEqual(seen.legacy.length, 0);
    });
  });

  describe('UE instrumentation', () => {
    it('is applied on a UE host', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.ue, 1);
    });

    it('is not applied on a preview host', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.preview.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.ue, 0);
    });

    // the connection uri names the page and nothing else; the store a read came from is not
    // carried on it, so a save resolves the store for itself
    it('leaves no marker on the connection uri', async () => {
      const seenReq = [];
      globalThis.fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        seenReq.push(request.url);
        if (request.url.startsWith('https://api.aem.live/')) {
          return new Response('<body><main><div><p>x</p></div></main></body>', { status: 200 });
        }
        return new Response('not found', { status: 404 });
      };
      const env = {
        DA_ADMIN: 'https://admin.da.live',
        AEM_API: 'https://api.aem.live',
        UE_HOST: 'ue.da.live',
        daadmin: { fetch: async () => new Response('<body></body>', { status: 200 }) },
      };
      const { daSourceGet } = await esmock('../../src/routes/da-admin.js', {
        '../../src/storage/source-bus.js': { default: async () => true },
        '../../src/utils/aemCtx.js': {
          getAemCtx: () => ({ ueHostname: 'ue.da.live', previewUrl: 'https://p.example' }),
          getAEMHtml: async () => '<meta name="from" content="aem" />',
        },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const html = await (await daSourceGet({ req, env, daCtx: getDaCtx(req) })).text();

      assert.match(html, /urn:adobe:aue:system:ab" content="da:[^"?]*"/);
      assert.ok(!html.includes('ab-src'), 'no marker on the connection uri');
      assert.ok(!html.includes('content-store'), 'no marker on the connection uri');
    });
  });

  describe('a non-html read', () => {
    it('goes to the source bus fully normalized', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/Media/Holiday.PNG');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/media/holiday.png');
    });

    it('goes to da-admin fully lowercased on a legacy site', async () => {
      const { daSourceGet, env, seen } = await build();
      const req = authedReq('https://main--site--org.ue.da.live/Media/Holiday.PNG');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/media/holiday.png');
    });
  });

  describe('a HEAD', () => {
    it('goes to the source bus on a source-bus site', async () => {
      const { daSourceHead, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].method, 'HEAD');
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    it('goes to da-admin on a legacy site', async () => {
      const { daSourceHead, env, seen } = await build();
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(seen.legacy[0].method, 'HEAD');
    });

    it('passes a 404 from the store through, since HEAD composes nothing', async () => {
      const { daSourceHead, env } = await build({
        onSourceBus: true,
        bus: () => new Response('', { status: 404 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
    });
  });

  describe('a media read, which the handlers race against the AEM proxy', () => {
    // the store answer is preferred at 200 and the published copy otherwise, so an image that is
    // published still resolves during a store outage. But when neither answers, a 404 says "this
    // image does not exist" where the truth is "we could not find out", so the store's own 503
    // wins over a non-200 from the proxy.
    const raced = async (handler, storeStatus, aemStatus) => {
      const mod = await esmock(`../../src/handlers/${handler}.js`, {
        '../../src/routes/da-admin.js': {
          daSourceGet: async () => new Response('', { status: storeStatus }),
          daSourceHead: async () => new Response(null, { status: storeStatus }),
        },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => new Response(aemStatus === 200 ? 'the published bytes' : '', { status: aemStatus }),
        },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');
      return (await mod.default({ req, env: {}, daCtx: getDaCtx(req) })).status;
    };

    ['get', 'head'].forEach((handler) => {
      it(`prefers the published copy over an unreachable store on a ${handler.toUpperCase()}`, async () => {
        assert.strictEqual(await raced(handler, 503, 200), 200);
      });

      it(`answers 503 rather than 404 when neither answers on a ${handler.toUpperCase()}`, async () => {
        assert.strictEqual(await raced(handler, 503, 404), 503);
      });

      it(`still answers 404 when the image is simply absent on a ${handler.toUpperCase()}`, async () => {
        assert.strictEqual(await raced(handler, 404, 404), 404);
      });

      it(`still prefers the store at 200 on a ${handler.toUpperCase()}`, async () => {
        assert.strictEqual(await raced(handler, 200, 404), 200);
      });

      // the reason an undetermined store answers 503 rather than throwing: allSettled turns a
      // rejection into "no answer" and the proxy's 404 would win, claiming the image is absent
      it(`answers 503 when the store is undetermined on a ${handler.toUpperCase()}`, async () => {
        const mod = await esmock(`../../src/handlers/${handler}.js`, {
          '../../src/routes/da-admin.js': {
            daSourceGet: async () => { throw new TypeError('fetch failed'); },
            daSourceHead: async () => { throw new TypeError('fetch failed'); },
          },
          '../../src/routes/aem-proxy.js': {
            handleAEMProxyRequest: async () => new Response('', { status: 404 }),
          },
        });
        const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

        const thrown = (await mod.default({ req, env: {}, daCtx: getDaCtx(req) })).status;

        assert.strictEqual(thrown, 404, 'a rejection is swallowed and the proxy answers');
        assert.strictEqual(await raced(handler, 503, 404), 503, 'a 503 response is not');
      });
    });

    // getHandler races an image read against *.aem.page and takes the proxy answer whenever the
    // store read is not a 200. So an unreachable store degrades an image to the published copy
    // rather than breaking the page, and an image cannot be laundered into a write: a POST to a
    // non-html path is refused with 415 before anything is resolved.
    it('falls through to the AEM proxy for an image when the store did not answer', async () => {
      const seen = [];
      globalThis.fetch = async (input) => {
        seen.push(input.toString());
        return new Response('the published bytes', { status: 200 });
      };
      const getHandler = (await esmock('../../src/handlers/get.js', {
        '../../src/routes/da-admin.js': {
          daSourceGet: async () => new Response('', { status: 503 }),
        },
        '../../src/routes/aem-proxy.js': {
          handleAEMProxyRequest: async () => new Response('the published bytes', { status: 200 }),
        },
      })).default;
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await getHandler({ req, env: {}, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(await res.text(), 'the published bytes');
    });

    // mp4 is not in the raced extensions, so it has no published copy to fall back to and the
    // refusal reaches the caller as itself
    it('refuses a video read when the store could not be reached', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/clip.mp4');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('reads a video from the source bus on a source-bus site', async () => {
      const { daSourceGet, env, seen } = await build({ onSourceBus: true });
      const req = authedReq('https://main--site--org.ue.da.live/folder/clip.mp4');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/clip.mp4');
    });
  });

  describe('the order of the two things that can fail', () => {
    // a missing AEM branch is answered as it was before, so quick-edit still gets its shell
    it('reports a missing AEM branch even when the store did not answer', async () => {
      const { daSourceGet, env } = await build({
        onSourceBus: true,
        headHtml: undefined,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
    });
  });
});
