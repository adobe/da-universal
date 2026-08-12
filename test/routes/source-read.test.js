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
// a namespace import, so a body pinned to a constant this branch does not export yet fails
// its own assertion rather than taking the file down at load
import * as messages from '../../src/utils/constants.js';

const authedReq = (url) => new Request(url, { headers: { Authorization: 'Bearer t' } });

// what the site lookup answers
const SOURCE_BUS = { exists: true, onSourceBus: true };
const LEGACY_STORE = { exists: true, onSourceBus: false };
const NO_SITE = { exists: false, onSourceBus: false };

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
  // `in overrides` rather than a destructured default on these, so an explicit undefined reads
  // as a ref with no head.html, a template the preview host does not have, or a failed lookup
  const headHtml = 'headHtml' in overrides ? overrides.headHtml : '<meta name="from" content="aem" />';
  const templateHtml = 'templateHtml' in overrides
    ? overrides.templateHtml
    : '<body>from the template</body>';
  const site = 'site' in overrides ? overrides.site : LEGACY_STORE;
  const lookupError = 'lookupError' in overrides ? overrides.lookupError : new TypeError('fetch failed');
  const {
    headError, templateError, configError, composeError, config = null,
  } = overrides;
  const seen = {
    bus: [], legacy: [], head: [], aem: [], ue: 0, lookups: 0, heads: 0,
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
    '../../src/storage/site.js': {
      default: async () => {
        seen.lookups += 1;
        // throws for undefined, which is how the lookup reports a failure
        if (site === undefined) throw lookupError;
        return site;
      },
      getSiteHead: async () => {
        if (headError) throw headError;
        seen.heads += 1;
        return headHtml;
      },
    },
    '../../src/utils/aemCtx.js': {
      getAemCtx: () => ({ previewUrl: 'https://main--site--org.aem.page' }),
      // the template is the only preview host read left on this path
      getAEMHtml: async (aemCtx, path) => {
        if (templateError) throw templateError;
        seen.aem.push(path);
        return templateHtml;
      },
    },
    '../../src/render/compose.js': {
      // returns a hast root, so quick-edit can walk what was built
      composeHtml: async (daCtx, aemCtx, bodyHtml, head) => {
        if (composeError) throw composeError;
        seen.head.push(head);
        return { type: 'root', children: [], bodyHtml };
      },
      serializeHtml: (tree) => `<html>${tree.bodyHtml}</html>`,
    },
    '../../src/ue/ue.js': {
      applyUEInstrumentation: async () => { seen.ue += 1; },
    },
    '../../src/storage/config.js': {
      // da-admin answers a site with no config with a 404, which getSiteConfig reports as null
      getSiteConfig: async () => {
        if (configError) throw configError;
        return config;
      },
    },
  });
  return { ...mod, env, seen };
};

describe('when the lookup cannot say which store holds the site', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // picking a store without an answer is a coin flip, and reading the wrong one hands the author
  // the wrong document at 200
  it('refuses an html read with 503 and touches neither store', async () => {
    const { daSourceGet, env, seen } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
  });

  it('asks the caller to retry', async () => {
    const { daSourceGet, env } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.ok(Number(res.headers.get('Retry-After')) > 0);
  });

  // the preview iframe renders this body, and the store answered nothing here: it was never
  // asked, since which store to ask is what could not be determined
  it('says the store could not be determined, not that it did not answer', async () => {
    const { daSourceGet, env } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    const body = await res.text();
    assert.notStrictEqual(body, messages.SOURCE_UNREACHABLE_HTML_MESSAGE);
    assert.strictEqual(body, messages.SOURCE_UNDETERMINED_HTML_MESSAGE);
  });

  it('refuses a non-html read too', async () => {
    const { daSourceGet, env, seen } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
  });

  it('refuses a HEAD with 503 and no body', async () => {
    const { daSourceHead, env, seen } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(await res.text(), '');
    assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
  });

  // both 503s share a status and an unparsed body, so only the header separates them
  it('names the failed lookup in x-error', async () => {
    const { daSourceGet, env } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.match(res.headers.get('x-error'), /site lookup failed/);
  });

  it('names the failed lookup on a HEAD too', async () => {
    const { daSourceHead, env } = await build({ site: undefined });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

    assert.match(res.headers.get('x-error'), /site lookup failed/);
  });

  // a read answers the same 503 and the same body whichever of the two failed, so the header is
  // the only thing on the wire that separates a timeout from a dropped connection
  it('names the lookup cause, not a category', async () => {
    const { daSourceGet, env } = await build({
      site: undefined,
      lookupError: new DOMException('timed out', 'TimeoutError'),
    });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.headers.get('x-error'), 'site lookup failed: TimeoutError: timed out');
  });

  // rendering a thrown non-Error as "undefined: undefined" would leave the 503 saying nothing
  it('survives a thrown non-Error', async () => {
    const { daSourceGet, env } = await build({ site: undefined, lookupError: 'boom' });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.headers.get('x-error'), 'site lookup failed: Error: boom');
  });

  it('tells a lookup failure apart from a store failure', async () => {
    const { daSourceGet, env } = await build({
      site: SOURCE_BUS,
      bus: () => { throw new TypeError('fetch failed'); },
    });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.headers.get('x-error'), 'content store failed: TypeError: fetch failed');
  });
});

describe('reading from the store that holds the site', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('an html read on a source-bus site', () => {
    it('reads from the source bus', async () => {
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.legacy.length, 0);
      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    it('composes the source-bus document, not da-admin\'s copy of it', async () => {
      const { daSourceGet, env } = await build({ site: SOURCE_BUS });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(await res.text(), '<html><body>from the source bus</body></html>');
    });

    it('forwards the author token to the source bus', async () => {
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
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
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.lookups, 1);
      assert.strictEqual(seen.legacy.length, 0);
    });
  });

  describe('when the store cannot be reached at all', () => {
    it('answers 503 rather than throwing on an html read', async () => {
      const { daSourceGet, env } = await build({
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('answers 503 rather than throwing on a non-html read', async () => {
      const { daSourceGet, env } = await build({
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      assert.strictEqual((await daSourceGet({ req, env, daCtx: getDaCtx(req) })).status, 503);
    });

    it('answers 503 rather than throwing on a HEAD', async () => {
      const { daSourceHead, env } = await build({
        site: SOURCE_BUS,
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
        site: SOURCE_BUS,
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
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const html = authedReq('https://main--site--org.ue.da.live/folder/content');
      const asset = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const htmlRes = await daSourceGet({ req: html, env, daCtx: getDaCtx(html) });
      const assetRes = await daSourceGet({ req: asset, env, daCtx: getDaCtx(asset) });

      assert.strictEqual(await htmlRes.text(), messages.SOURCE_UNREACHABLE_HTML_MESSAGE);
      assert.strictEqual(await assetRes.text(), messages.SOURCE_UNREACHABLE_HTML_MESSAGE);
    });

    it('answers 503 with no body on a HEAD', async () => {
      const { daSourceHead, env } = await build({
        site: SOURCE_BUS,
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
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('Network connection lost'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'content store failed: TypeError: Network connection lost');
    });

    it('names the cause on a non-html read', async () => {
      const { daSourceGet, env } = await build({
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('Network connection lost'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'content store failed: TypeError: Network connection lost');
    });

    it('names the cause on a HEAD', async () => {
      const { daSourceHead, env } = await build({
        site: SOURCE_BUS,
        bus: () => { throw new DOMException('The operation timed out', 'TimeoutError'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'content store failed: TimeoutError: The operation timed out');
    });

    it('names the cause when da-admin is unreachable', async () => {
      const { daSourceGet, env } = await build({
        legacy: () => { throw new TypeError('Network connection lost'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'content store failed: TypeError: Network connection lost');
    });

    // a header value cannot span lines, so a message carrying a stack would throw where the 503
    // is built and turn the 503 into a 500
    it('collapses a multi-line cause onto one line', async () => {
      const { daSourceGet, env } = await build({
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('lost\n    at fetch'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'content store failed: TypeError: lost at fetch');
    });
  });

  describe('what a store status means', () => {
    // turning any of these into the blank starter template at HTTP 200 hands the author an
    // empty document to save over a page that exists
    [401, 403, 429, 500, 502].forEach((status) => {
      it(`keeps the store's ${status} as the status`, async () => {
        const { daSourceGet, env } = await build({
          site: SOURCE_BUS,
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
          site: SOURCE_BUS,
          bus: () => new Response('upstream said no', { status }),
        });
        const req = authedReq('https://main--site--org.ue.da.live/folder/content');

        const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

        assert.strictEqual(await res.text(), 'upstream said no');
      });
    });

    // the lookup does not send the author token, so the store is the only place a 401 can come
    // from. the authorbus extension matches this sentinel and recovers by refetching
    // /gimme_cookie and refreshing
    [401, 403].forEach((status) => {
      it(`serves the da:401 shell when the store answers ${status} on an html read`, async () => {
        const { daSourceGet, env } = await build({
          site: SOURCE_BUS,
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
        site: SOURCE_BUS,
        bus: () => new Response('', { status: 401 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('Retry-After'), null);
    });

    it('passes a store 401 through bare on a non-html read, which renders nothing', async () => {
      const { daSourceGet, env } = await build({
        site: SOURCE_BUS,
        bus: () => new Response('', { status: 401 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(await res.text(), '');
    });

    it('answers a store 401 on a HEAD with no body', async () => {
      const { daSourceHead, env } = await build({
        site: SOURCE_BUS,
        bus: () => new Response('', { status: 401 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(await res.text(), '');
    });

    // hands the author the starter template over whatever da-admin still has, with no second
    // store to retry against
    it('composes the starter template on a 404 without asking the other store', async () => {
      const { daSourceGet, env, seen } = await build({
        site: SOURCE_BUS,
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
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.ue, 1);
    });

    it('is not applied on a preview host', async () => {
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
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
        '../../src/storage/site.js': { default: async () => ({ exists: true, onSourceBus: true }) },
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
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
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
      const { daSourceHead, env, seen } = await build({ site: SOURCE_BUS });
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
        site: SOURCE_BUS,
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
        site: SOURCE_BUS,
        bus: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/clip.mp4');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('reads a video from the source bus on a source-bus site', async () => {
      const { daSourceGet, env, seen } = await build({ site: SOURCE_BUS });
      const req = authedReq('https://main--site--org.ue.da.live/folder/clip.mp4');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/clip.mp4');
    });
  });

  describe('the order of the three things that can fail', () => {
    // answers the settled 404 ahead of the retryable 503
    it('reports no such site even when the store did not answer', async () => {
      const { daSourceGet, env } = await build({
        site: NO_SITE,
        bus: () => { throw new TypeError('fetch failed'); },
        legacy: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
    });

    // names which failure it was: a site that does not exist has no preview host either
    it('reports no such site even when the preview host did not answer', async () => {
      const { daSourceGet, env } = await build({
        site: NO_SITE,
        headError: new TypeError('Network connection lost'),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
    });

    it('reports an unreachable store on a site with no head.html', async () => {
      const { daSourceGet, env } = await build({
        headHtml: undefined,
        legacy: () => { throw new TypeError('fetch failed'); },
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });
  });

  // the config service reads head.html off the code bus, so a site behind Helix authentication
  // and a ref the preview host will not serve both still get the project's css and js
  describe('where the page head comes from', () => {
    it('reads it off the config service, and asks the preview host for nothing', async () => {
      const { daSourceGet, env, seen } = await build();
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.heads, 1);
      assert.deepStrictEqual(seen.aem, []);
    });

    it('composes the page with it', async () => {
      const { daSourceGet, env, seen } = await build();
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.head[0], '<meta name="from" content="aem" />');
    });

    // one read each, rather than a second lookup to carry the head
    it('reads it alongside the lookup', async () => {
      const { daSourceGet, env, seen } = await build();
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.lookups, 1);
      assert.strictEqual(seen.heads, 1);
    });
  });

  // #258: head.html does not say whether a site exists, so a missing head.html is not a 404
  describe('when the site serves no head.html', () => {
    it('reads the document anyway', async () => {
      const { daSourceGet, env, seen } = await build({ headHtml: undefined });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(await res.text(), '<html><body>from da-admin</body></html>');
    });

    // serves the page without the project's css and js rather than not at all
    it('composes with no project head entries', async () => {
      const { daSourceGet, env, seen } = await build({ headHtml: undefined });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(seen.head.length, 1);
      assert.strictEqual(seen.head[0] ?? '', '');
    });

    it('composes the starter template when the document is missing too', async () => {
      const { daSourceGet, env } = await build({
        headHtml: undefined,
        legacy: () => new Response('', { status: 404 }),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.match(await res.text(), /<main>/);
    });

    it('instruments UE without a head', async () => {
      const { daSourceGet, env, seen } = await build({ headHtml: undefined });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(seen.ue, 1);
    });

    // sets no cookie: the cookie names the entry script, and no head.html means no entry script
    it('serves quick-edit the page without an entry-script cookie', async () => {
      const { daSourceGet, env } = await build({ headHtml: undefined });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('Set-Cookie'), null);
    });

    it('is not answered 404 by a missing head.html alone', async () => {
      const { daSourceGet, env } = await build({ headHtml: undefined });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.notStrictEqual(res.status, 404);
    });
  });

  describe('when there is no such site', () => {
    it('refuses an html read with 404 and touches neither store', async () => {
      const { daSourceGet, env, seen } = await build({ site: NO_SITE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
      assert.match(await res.text(), /Site not found/);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    // nothing renders an image, so a body would only corrupt it
    it('refuses a non-html read with 404 and no body', async () => {
      const { daSourceGet, env, seen } = await build({ site: NO_SITE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/photo.png');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
      assert.strictEqual(await res.text(), '');
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    it('refuses a HEAD with 404 and no body', async () => {
      const { daSourceHead, env, seen } = await build({ site: NO_SITE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceHead({ env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
      assert.strictEqual(await res.text(), '');
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    // needs a shell with the import map, since the editor loads into this page
    it('gives quick-edit its shell', async () => {
      const { daSourceGet, env } = await build({ site: NO_SITE });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 404);
      assert.match(await res.text(), /importmap/);
    });
  });

  // a throw out of the head read used to reach the worker's catch as a 500 with no body
  describe('when the head read cannot be reached', () => {
    const dead = () => new TypeError('Network connection lost');

    it('answers 503 rather than throwing', async () => {
      const { daSourceGet, env } = await build({ headError: dead() });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });

    it('names the cause in x-error', async () => {
      const { daSourceGet, env } = await build({ headError: dead() });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.headers.get('x-error'), 'page head failed: TypeError: Network connection lost');
    });

    it('asks the caller to retry', async () => {
      const { daSourceGet, env } = await build({
        headError: new DOMException('The operation timed out', 'TimeoutError'),
      });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    // says what happened, since the preview iframe renders the refusal
    it('says the page head did not arrive, not that the store is undetermined', async () => {
      const { daSourceGet, env } = await build({ headError: dead() });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(await res.text(), messages.HEAD_UNREACHABLE_HTML_MESSAGE);
    });

    // a 404 would say the site is gone, which is #258 again, this time on the head read
    it('does not answer 404', async () => {
      const { daSourceGet, env } = await build({ headError: dead() });
      const req = authedReq('https://main--site--org.ue.da.live/folder/content');

      const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

      assert.notStrictEqual(res.status, 404);
    });
  });
});

describe('when the site config cannot be reached', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  const missing = () => ({
    legacy: () => new Response('', { status: 404 }),
    configError: new TypeError('fetch failed'),
  });

  // the config names the template built over a document that is not there, so a store that did
  // not answer would hand the author the wrong blank page to save over
  it('refuses with 503 rather than composing the starter template', async () => {
    const { daSourceGet, env } = await build(missing());
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
  });

  // da-admin serves the config as well as the document, so the store is what did not answer.
  // x-error is what separates the two reads
  it('says the store did not answer', async () => {
    const { daSourceGet, env } = await build(missing());
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(await res.text(), messages.SOURCE_UNREACHABLE_HTML_MESSAGE);
  });

  it('names the site config in x-error', async () => {
    const { daSourceGet, env } = await build(missing());
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.headers.get('x-error'), 'site config failed: TypeError: fetch failed');
  });

  it('asks the caller to retry', async () => {
    const { daSourceGet, env } = await build(missing());
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.ok(Number(res.headers.get('Retry-After')) > 0);
  });

  // da-admin answers a site with no config with a 404, not a throw, and that is the ordinary case
  it('composes the starter template when there is no config at all', async () => {
    const { daSourceGet, env } = await build({ legacy: () => new Response('', { status: 404 }) });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /<main>/);
  });
});

// getSiteHead is not stubbed here: a stub hides a config service that answers, but with
// something other than a head
describe('when the config service refuses the head read', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  const readWithConfigStatus = async (status) => {
    globalThis.fetch = async () => new Response('the config service said no', { status });
    const env = {
      DA_ADMIN: 'https://admin.da.live',
      AEM_API: 'https://api.aem.live',
      HLX_CONFIG_SERVICE: 'https://config.aem.page',
      HLX_CONFIG_SERVICE_TOKEN: 'shared-token',
      daadmin: { fetch: async () => new Response('<body>from da-admin</body>', { status: 200 }) },
    };
    const { daSourceGet } = await esmock('../../src/routes/da-admin.js', {
      '../../src/storage/site.js': { default: async () => LEGACY_STORE },
    });
    // a preview host rather than a UE host, so nothing is instrumented onto the composed page
    const req = authedReq('https://main--site--org.preview.da.live/folder/content');
    return daSourceGet({ req, env, daCtx: getDaCtx(req) });
  };

  // a 200 with no head is a page with no stylesheet, no scripts and no entry script
  it('refuses a 500 with 503 rather than composing an empty project head', async () => {
    const res = await readWithConfigStatus(500);

    assert.strictEqual(res.status, 503);
  });

  it('names the page head in x-error', async () => {
    const res = await readWithConfigStatus(500);

    assert.match(res.headers.get('x-error'), /page head failed/);
  });

  // the shared secret is the worker's own, so a 401 is a deploy without it rather than a site
  // that has no head.html
  it('refuses a 401 with 503', async () => {
    const res = await readWithConfigStatus(401);

    assert.strictEqual(res.status, 503);
  });

  // a ref that was never built has no head.html, which is not a failure
  it('composes the page without a head on a 404', async () => {
    const res = await readWithConfigStatus(404);

    assert.strictEqual(res.status, 200);
  });
});

describe('a read that carries no token', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // the authorbus extension recovers off the da:401 meta rather than off the status
  it('is refused with the da:401 shell, and nothing is looked up', async () => {
    const { daSourceGet, env, seen } = await build();
    const req = new Request('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(await res.text(), messages.UNAUTHORIZED_HTML_MESSAGE);
    assert.strictEqual(seen.lookups, 0);
  });
});

describe('a path the site config gives a template', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // the template is composed over a document that is not there, so the store answers 404
  const missingDoc = (rows) => ({
    legacy: () => new Response('', { status: 404 }),
    config: rows.map((value) => ({ key: 'editor.ue.template', value })),
  });

  it('composes the configured template rather than the starter', async () => {
    const { daSourceGet, env, seen } = await build(missingDoc(['/folder=/scripts/tpl.html']));
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), '<html><body>from the template</body></html>');
    assert.ok(seen.aem.includes('/scripts/tpl.html'));
  });

  // unwrapped, this read escapes as the bodyless 500 that #258 is about
  it('refuses with 503 when the template read cannot be reached', async () => {
    const { daSourceGet, env } = await build({
      ...missingDoc(['/folder=/scripts/tpl.html']),
      templateError: new TypeError('fetch failed'),
    });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 503);
    assert.match(res.headers.get('x-error'), /preview host failed/);
  });

  it('takes the longest matching prefix', async () => {
    const { daSourceGet, env, seen } = await build(missingDoc([
      '/=/scripts/site.html',
      '/folder=/scripts/folder.html',
    ]));
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.ok(seen.aem.includes('/scripts/folder.html'));
    assert.ok(!seen.aem.includes('/scripts/site.html'));
  });

  it('ignores a template configured for another path', async () => {
    const { daSourceGet, env, seen } = await build(missingDoc(['/other=/scripts/other.html']));
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.match(await res.text(), /<main>/);
    assert.strictEqual(seen.aem.length, 1);
  });

  // the config names a path the preview host answers 404 for, which leaves the starter
  it('falls back to the starter when the preview host has no such template', async () => {
    const { daSourceGet, env } = await build({
      ...missingDoc(['/folder=/scripts/gone.html']),
      templateHtml: undefined,
    });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    const res = await daSourceGet({ req, env, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /<main>/);
  });
});

describe('when the worker itself has a bug', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // only an unreachable upstream is retryable, and a 503 would keep the throw out of the log
  // the worker boundary writes
  it('lets the throw through rather than rendering it as a 503', async () => {
    const { daSourceGet, env } = await build({ composeError: new TypeError('tree is not iterable') });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');

    await assert.rejects(
      () => daSourceGet({ req, env, daCtx: getDaCtx(req) }),
      /tree is not iterable/,
    );
  });
});
