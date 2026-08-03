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

const LEGACY_SOURCE = { kind: 'legacy' };
const BUS_SOURCE = { kind: 'sourcebus', base: 'https://api.aem.live/org/sites/site/source' };
const UNKNOWN_SOURCE = { kind: 'unknown', reason: 'the config service answered 503' };

const authedReq = (url) => new Request(url, { headers: { Authorization: 'Bearer t' } });

/**
 * Builds the route module with the network replaced. `bus` answers the source bus, `legacy`
 * answers da-admin, and every request to each is recorded so a test can assert where a read
 * went and what it carried.
 */
const build = async (overrides = {}) => {
  const {
    source = LEGACY_SOURCE,
    bus = () => new Response('<body>from the source bus</body>', { status: 200, headers: { etag: '"busetag"' } }),
    legacy = () => new Response('<body>from da-admin</body>', { status: 200 }),
  } = overrides;
  // 'headHtml' in overrides rather than a destructured default, so passing
  // `{ headHtml: undefined }` really does simulate a missing head.html
  const headHtml = 'headHtml' in overrides ? overrides.headHtml : '<meta name="from" content="aem" />';
  const seen = { bus: [], legacy: [], stamps: [] };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.bus.push({ url: request.url, method: request.method, headers: request.headers });
    return bus(request);
  };
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    HLX_ADMIN: 'https://admin.hlx.page',
    daadmin: {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        seen.legacy.push({ url: request.url, method: request.method, headers: request.headers });
        return legacy(request);
      },
    },
  };
  const mod = await esmock('../../src/routes/da-admin.js', {
    '../../src/storage/content-source.js': {
      default: async () => source,
      SOURCE_BUS: 'sourcebus',
      LEGACY: 'legacy',
      UNKNOWN: 'unknown',
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
      applyUEInstrumentation: async (tree, daCtx, aemCtx, stamp) => { seen.stamps.push(stamp); },
    },
    '../../src/storage/config.js': {
      getSiteConfig: async () => { throw new Error('no config'); },
    },
  });
  return { ...mod, env, seen };
};

afterEach(() => {
  delete globalThis.fetch;
});

describe('reading with the content source resolved', () => {
  describe('an html read on a source-bus site', () => {
    it('reads from the base the config named', async () => {
      const { daSourceGet, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy.length, 0);
      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    it('composes the source-bus document, not da-admin\'s copy of it', async () => {
      const { daSourceGet, env } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(await res.text(), '<html><body>from the source bus</body></html>');
    });

    it('forwards the author token to the source bus', async () => {
      const { daSourceGet, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].headers.get('Authorization'), 'Bearer t');
    });
  });

  describe('an html read on a legacy site', () => {
    it('reads from da-admin over the service binding', async () => {
      const { daSourceGet, env, seen } = await build({ source: LEGACY_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
    });
  });

  describe('when the content source could not be resolved', () => {
    // guessing reads past a migrated site's live page and hands the author its stale
    // pre-migration copy, which the next save would then be based on
    it('refuses an html read with 503 rather than guessing a store', async () => {
      const { daSourceGet, env } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('asks the caller to retry', async () => {
      const { daSourceGet, env } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    it('touches neither store', async () => {
      const { daSourceGet, env, seen } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy.length, 0);
    });

    it('refuses a non-html read too', async () => {
      const { daSourceGet, env, seen } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    it('refuses a HEAD with 503 and no body', async () => {
      const { daSourceHead, env } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(await res.text(), '');
    });
  });

  describe('what a store status means', () => {
    // turning any of these into the blank starter template at HTTP 200 hands the author an
    // empty document to save over a page that exists
    [401, 403, 429, 500, 502].forEach((status) => {
      it(`passes a ${status} from the store through as itself`, async () => {
        const { daSourceGet, env } = await build({
          source: BUS_SOURCE,
          bus: () => new Response('upstream said no', { status }),
        });
        const req = authedReq('https://main--site--org.ue.da.live/folder/content');

        const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

        assert.strictEqual(res.status, status);
      });
    });

    it('composes the starter template on a 404, which is the one absent answer', async () => {
      const { daSourceGet, env } = await build({
        source: BUS_SOURCE,
        bus: () => new Response('', { status: 404 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.ok(!(await res.text()).includes('from the source bus'));
    });
  });

  describe('the stamp a read leaves for its write', () => {
    it('carries the source-bus etag it read', async () => {
      const { daSourceGet, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.deepStrictEqual(seen.stamps, ['sb.busetag']);
    });

    it('says the source-bus document is new when the read found nothing', async () => {
      const { daSourceGet, env, seen } = await build({
        source: BUS_SOURCE,
        bus: () => new Response('', { status: 404 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.deepStrictEqual(seen.stamps, ['sb.new']);
    });

    it('says only the store when a source-bus read carried no etag', async () => {
      const { daSourceGet, env, seen } = await build({
        source: BUS_SOURCE,
        bus: () => new Response('<body>x</body>', { status: 200 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.deepStrictEqual(seen.stamps, ['sb']);
    });

    it('names da-admin for a legacy read', async () => {
      const { daSourceGet, env, seen } = await build({ source: LEGACY_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.deepStrictEqual(seen.stamps, ['da']);
    });

    it('is not applied outside UE, where nothing posts back', async () => {
      const { daSourceGet, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.preview.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.deepStrictEqual(seen.stamps, []);
    });
  });

  describe('a non-html read', () => {
    it('goes to the source bus with the case it stored the file under', async () => {
      const { daSourceGet, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/Media/Holiday.PNG');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/Media/holiday.PNG');
    });

    it('goes to da-admin fully lowercased on a legacy site', async () => {
      const { daSourceGet, env, seen } = await build({ source: LEGACY_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/Media/Holiday.PNG');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/media/holiday.png');
    });
  });

  describe('a HEAD', () => {
    it('goes to the source bus on a source-bus site', async () => {
      const { daSourceHead, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].method, 'HEAD');
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    it('goes to da-admin on a legacy site', async () => {
      const { daSourceHead, env, seen } = await build({ source: LEGACY_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(seen.legacy[0].method, 'HEAD');
    });

    it('passes a 404 from the store through, since HEAD composes nothing', async () => {
      const { daSourceHead, env } = await build({
        source: BUS_SOURCE,
        bus: () => new Response('', { status: 404 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
    });
  });

  describe('a read that cannot be placed at all', () => {
    it('never asks a store when the hostname named no site', async () => {
      const { daSourceGet, env, seen } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://xyz.ue.da.live/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });
  });

  describe('a media read, which the handlers race against the AEM proxy', () => {
    // getHandler races an image read against *.aem.page and takes the proxy answer whenever the
    // store read is not a 200. So an unresolved source degrades an image to the published copy
    // rather than breaking the page, and an image cannot be laundered into a write: a POST to a
    // non-html path is refused with 415 before anything is resolved.
    it('falls through to the AEM proxy for an image when the source is unresolved', async () => {
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
    it('refuses a video read when the source is unresolved', async () => {
      const { daSourceGet, env } = await build({ source: UNKNOWN_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/clip.mp4');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('reads a video from the source bus when the source is known', async () => {
      const { daSourceGet, env, seen } = await build({ source: BUS_SOURCE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/clip.mp4');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/clip.mp4');
    });
  });

  describe('the order of the two things that can fail', () => {
    // a missing AEM branch is answered as it was before, so quick-edit still gets its shell
    it('reports a missing AEM branch even when the source is unresolved', async () => {
      const { daSourceGet, env } = await build({ source: UNKNOWN_SOURCE, headHtml: undefined });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
    });
  });
});
