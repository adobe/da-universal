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

const { default: getSite } = await import('../../src/storage/site.js');

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

const STYLESHEET = '<link rel="stylesheet" href="/styles/styles.css"/>';
// the pipeline scope has the code bus object, with a lastModified the delivery pipeline reads
const withHead = (html) => () => new Response(
  JSON.stringify({ head: { lastModified: 'Mon, 30 Mar 2026 06:42:40 GMT', html } }),
  { status: 200 },
);
const found = withHead(STYLESHEET);
const absent = () => new Response('', { status: 404, headers: { 'x-error': 'config not found.' } });

describe('getSite', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks the config service for the pipeline-scoped config', async () => {
      stubFetch(found);

      await getSite(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://config.aem.page/main--site--org/config.json?scope=pipeline');
    });

    it('takes the config service from env, so dev can point elsewhere', async () => {
      stubFetch(found);

      await getSite({ ...env, HLX_CONFIG_SERVICE: 'http://localhost:4713' }, daCtx());

      assert.strictEqual(calls[0].url, 'http://localhost:4713/main--site--org/config.json?scope=pipeline');
    });

    // the code bus has one head.html per ref, so a branch gets its own
    it('names the ref the request came in on', async () => {
      stubFetch(found);

      await getSite(env, daCtx({ ref: 'feature' }));

      assert.match(calls[0].url, /\/feature--site--org\//);
    });

    it('sends the shared token', async () => {
      stubFetch(found);

      await getSite(env, daCtx());

      assert.strictEqual(calls[0].init.headers['x-access-token'], 'shared-token');
    });

    // the edge answers 400 without it, and that failure reads like a bad path
    it('sends the backend type', async () => {
      stubFetch(found);

      await getSite(env, daCtx());

      assert.strictEqual(calls[0].init.headers['x-backend-type'], 'aws');
    });

    // the author's token has no business at a service-to-service endpoint
    it('sends no author token', async () => {
      stubFetch(found);

      await getSite(env, daCtx());

      assert.strictEqual(calls[0].init.headers.Authorization, undefined);
    });

    it('gives up rather than hanging', async () => {
      stubFetch(found);

      await getSite(env, daCtx());

      assert.ok(calls[0].init.signal);
    });

    // the admin scope answers with the site's CDN token and its API key metadata, and one read
    // is enough for both questions this asks
    it('reads one scope, and not the admin one', async () => {
      stubFetch(found);

      await getSite(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.doesNotMatch(calls[0].url, /scope=admin/);
    });
  });

  describe('the head it answers', () => {
    it('reads head.html out of the config', async () => {
      stubFetch(found);

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: true, head: STYLESHEET });
    });

    // a ref with no head.html on the code bus answers 200 with an empty head, not a 404
    it('answers a site with no head.html for the ref', async () => {
      stubFetch(() => new Response(JSON.stringify({ head: {} }), { status: 200 }));

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: true, head: undefined });
    });

    it('answers a site whose config carries no head at all', async () => {
      stubFetch(() => new Response(JSON.stringify({}), { status: 200 }));

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: true, head: undefined });
    });
  });

  describe('when there is no such site', () => {
    it('says so on a 404', async () => {
      stubFetch(absent);

      assert.deepStrictEqual(await getSite(env, daCtx()), { exists: false, head: undefined });
    });

    // an unparseable hostname leaves org and site undefined, so there is nothing to ask about
    it('says so without asking when there is no org or site', async () => {
      stubFetch(absent);

      const site = await getSite(env, daCtx({ site: undefined }));

      assert.strictEqual(site.exists, false);
      assert.strictEqual(calls.length, 0);
    });
  });

  // a refusal leaves existence unknown, and reading that as a missing site 404s a live page
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

    // a worker deployed without the secret and a rate limit share the status and the body, so
    // `x-error` is what tells them apart
    it('names the status it got', async () => {
      stubFetch(() => new Response('', { status: 401 }));

      await assert.rejects(() => getSite(env, daCtx()), /401/);
    });

    it('throws when the body is not JSON', async () => {
      stubFetch(() => new Response('<html>the edge said no</html>', { status: 200 }));

      await assert.rejects(() => getSite(env, daCtx()));
    });

    // a misconfigured worker gets no answer, and calling that a missing site would 404 the pages
    it('throws when the config service host is missing, without asking', async () => {
      stubFetch(found);

      await assert.rejects(() => getSite({ ...env, HLX_CONFIG_SERVICE: undefined }, daCtx()));
      assert.strictEqual(calls.length, 0);
    });
  });
});
