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

const { default: getSite, getSiteHead } = await import('../../src/storage/site.js');

const env = {
  AEM_API: 'https://api.aem.live',
  HLX_CONFIG_SERVICE: 'https://config.aem.page',
  HLX_CONFIG_SERVICE_TOKEN: 'shared-token',
};

const daCtx = (over = {}) => ({
  org: 'org', site: 'site', ref: 'main', authToken: 'Bearer t', ...over,
});

let calls;

const stubFetch = (respond) => {
  calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: input.toString(), init });
    return respond(input.toString(), init);
  };
};

// has the two fields the lookup reads; the service also answers with admin roles and secrets
const config = (sourceUrl) => () => new Response(
  JSON.stringify({ content: { source: { url: sourceUrl, type: 'markup' } } }),
  { status: 200 },
);
const legacy = config('https://content.da.live/org/site/');
const sourceBus = config('https://api.aem.live/org/sites/site/');
const absent = () => new Response('', { status: 404, headers: { 'x-error': 'config not found.' } });

const STYLESHEET = '<link rel="stylesheet" href="/styles/styles.css"/>';
// the pipeline scope carries the code bus object, under a lastModified the delivery pipeline reads
const withHead = (html) => () => new Response(
  JSON.stringify({ head: { lastModified: 'Mon, 30 Mar 2026 06:42:40 GMT', html } }),
  { status: 200 },
);

describe('getSite', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks the config service for the admin-scoped site config', async () => {
      stubFetch(legacy);

      await getSite(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://config.aem.page/main--site--org/config.json?scope=admin');
    });

    it('takes the config service from env, so dev can point elsewhere', async () => {
      stubFetch(legacy);

      await getSite({ ...env, HLX_CONFIG_SERVICE: 'http://localhost:4713' }, daCtx());

      assert.strictEqual(calls[0].url, 'http://localhost:4713/main--site--org/config.json?scope=admin');
    });

    it('names the ref the request came in on', async () => {
      stubFetch(legacy);

      await getSite(env, daCtx({ ref: 'feature' }));

      assert.match(calls[0].url, /\/feature--site--org\//);
    });

    it('sends the shared token', async () => {
      stubFetch(legacy);

      await getSite(env, daCtx());

      assert.strictEqual(calls[0].init.headers['x-access-token'], 'shared-token');
    });

    // the edge answers 400 without it, and that failure reads like a bad path
    it('sends the backend type', async () => {
      stubFetch(legacy);

      await getSite(env, daCtx());

      assert.strictEqual(calls[0].init.headers['x-backend-type'], 'aws');
    });

    // the author's token has no business at a service-to-service endpoint
    it('sends no author token', async () => {
      stubFetch(legacy);

      await getSite(env, daCtx());

      assert.strictEqual(calls[0].init.headers.Authorization, undefined);
    });

    it('gives up rather than hanging', async () => {
      stubFetch(legacy);

      await getSite(env, daCtx());

      assert.ok(calls[0].init.signal);
    });
  });

  describe('which store holds the site', () => {
    it('reads the source bus off the content source url', async () => {
      stubFetch(sourceBus);

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: true, onSourceBus: true });
    });

    it('reads a da-admin site as legacy', async () => {
      stubFetch(legacy);

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: true, onSourceBus: false });
    });

    it('tolerates a trailing slash on the configured source bus', async () => {
      stubFetch(sourceBus);

      const site = await getSite({ ...env, AEM_API: 'https://api.aem.live/' }, daCtx());

      assert.strictEqual(site.onSourceBus, true);
    });

    // a prefix match on the bare string would take api.aem.live.evil.example for the source bus
    it('does not take a lookalike host for the source bus', async () => {
      stubFetch(config('https://api.aem.live.evil.example/org/sites/site/'));

      const site = await getSite(env, daCtx());

      assert.strictEqual(site.onSourceBus, false);
    });

    it('reads a config with no content source as legacy', async () => {
      stubFetch(() => new Response(JSON.stringify({}), { status: 200 }));

      const site = await getSite(env, daCtx());

      assert.strictEqual(site.onSourceBus, false);
    });
  });

  describe('when there is no such site', () => {
    it('says so on a 404', async () => {
      stubFetch(absent);

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: false, onSourceBus: false });
    });

    // an unparseable hostname leaves org and site undefined, so there is nothing to ask about
    it('says so without asking when there is no org or site', async () => {
      stubFetch(absent);

      const site = await getSite(env, daCtx({ site: undefined }));

      assert.strictEqual(site.exists, false);
      assert.strictEqual(calls.length, 0);
    });
  });

  // a refusal leaves both answers unknown, and a guess reads the wrong store at 200
  describe('when the lookup cannot answer', () => {
    [401, 403, 429, 500, 502].forEach((status) => {
      it(`throws on a ${status}`, async () => {
        stubFetch(() => new Response('', { status }));

        await assert.rejects(() => getSite(env, daCtx()), /502|500|429|403|401/);
      });
    });

    it('throws when the config service cannot be reached', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      await assert.rejects(() => getSite(env, daCtx()), /fetch failed/);
    });

    it('names the status it got', async () => {
      stubFetch(() => new Response('', { status: 401 }));

      await assert.rejects(() => getSite(env, daCtx()), /401/);
    });

    // reads a 200 with an error page as a store it does not know, not as a legacy site
    it('throws when the body is not JSON', async () => {
      stubFetch(() => new Response('<html>the edge said no</html>', { status: 200 }));

      await assert.rejects(() => getSite(env, daCtx()));
    });

    // a misconfigured worker gets no answer, and calling that a missing site would 404 the pages
    it('throws when the config service host is missing, without asking', async () => {
      stubFetch(legacy);

      await assert.rejects(() => getSite({ ...env, HLX_CONFIG_SERVICE: undefined }, daCtx()));
      assert.strictEqual(calls.length, 0);
    });
  });
});

describe('getSiteHead', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks the config service for the pipeline-scoped config', async () => {
      stubFetch(withHead(STYLESHEET));

      await getSiteHead(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://config.aem.page/main--site--org/config.json?scope=pipeline');
    });

    // the code bus holds one head.html per ref, so a branch gets its own
    it('names the ref the request came in on', async () => {
      stubFetch(withHead(STYLESHEET));

      await getSiteHead(env, daCtx({ ref: 'feature' }));

      assert.match(calls[0].url, /\/feature--site--org\//);
    });

    it('sends the shared token', async () => {
      stubFetch(withHead(STYLESHEET));

      await getSiteHead(env, daCtx());

      assert.strictEqual(calls[0].init.headers['x-access-token'], 'shared-token');
    });

    it('sends the backend type', async () => {
      stubFetch(withHead(STYLESHEET));

      await getSiteHead(env, daCtx());

      assert.strictEqual(calls[0].init.headers['x-backend-type'], 'aws');
    });

    it('gives up rather than hanging', async () => {
      stubFetch(withHead(STYLESHEET));

      await getSiteHead(env, daCtx());

      assert.ok(calls[0].init.signal);
    });
  });

  describe('the head it answers', () => {
    it('reads head.html out of the config', async () => {
      stubFetch(withHead(STYLESHEET));

      assert.strictEqual(await getSiteHead(env, daCtx()), STYLESHEET);
    });

    // a ref with no head.html on the code bus answers 200 with an empty head, not a 404
    it('answers nothing when the ref has no head.html', async () => {
      stubFetch(() => new Response(JSON.stringify({ head: {} }), { status: 200 }));

      assert.strictEqual(await getSiteHead(env, daCtx()), undefined);
    });

    it('answers nothing when the config carries no head at all', async () => {
      stubFetch(() => new Response(JSON.stringify({}), { status: 200 }));

      assert.strictEqual(await getSiteHead(env, daCtx()), undefined);
    });

    // the lookup answers 404 with the site, and one 404 page is enough
    it('answers nothing on a 404', async () => {
      stubFetch(absent);

      assert.strictEqual(await getSiteHead(env, daCtx()), undefined);
    });

    it('asks nothing when there is no org or site', async () => {
      stubFetch(absent);

      assert.strictEqual(await getSiteHead(env, daCtx({ site: undefined })), undefined);
      assert.strictEqual(calls.length, 0);
    });
  });

  // the token is the worker's own, so a refusal is a broken worker rather than a site with no
  // head.html, and composing an empty project head would serve that as a page
  describe('when the read cannot answer', () => {
    [401, 403, 429, 500, 502].forEach((status) => {
      it(`throws on a ${status}`, async () => {
        stubFetch(() => new Response('', { status }));

        await assert.rejects(() => getSiteHead(env, daCtx()), /502|500|429|403|401/);
      });
    });

    it('throws when the config service cannot be reached', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      await assert.rejects(() => getSiteHead(env, daCtx()), /fetch failed/);
    });

    it('throws when the body is not JSON', async () => {
      stubFetch(() => new Response('<html>the edge said no</html>', { status: 200 }));

      await assert.rejects(() => getSiteHead(env, daCtx()));
    });
  });
});
