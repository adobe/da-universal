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

const { default: isSourceBus } = await import('../../src/storage/source-bus.js');

const env = {
  AEM_API: 'https://api.aem.live',
  HLX_CONFIG_SERVICE: 'https://config.aem.page',
  HLX_CONFIG_SERVICE_TOKEN: 'shared-secret',
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

const config = (source, status = 200) => new Response(
  JSON.stringify({ content: { source, contentBusId: 'abc' } }),
  { status, headers: { 'content-type': 'application/json' } },
);

const onBus = () => config({ type: 'markup', url: 'https://api.aem.live/org/sites/site/source' });
const onDa = () => config({ type: 'markup', url: 'https://content.da.live/org/site/' });

describe('isSourceBus', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks the config service for the admin scope', async () => {
      stubFetch(onBus);

      await isSourceBus(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://config.aem.page/main--site--org/config.json?scope=admin');
    });

    it('takes the config service from env, so dev can point at the shim', async () => {
      stubFetch(onBus);

      await isSourceBus({ ...env, HLX_CONFIG_SERVICE: 'http://localhost:4713' }, daCtx());

      assert.strictEqual(calls[0].url, 'http://localhost:4713/main--site--org/config.json?scope=admin');
    });

    it('sends the shared secret, which the config service requires', async () => {
      stubFetch(onBus);

      await isSourceBus(env, daCtx());

      const headers = new Headers(calls[0].init.headers);
      assert.strictEqual(headers.get('x-access-token'), 'shared-secret');
      assert.strictEqual(headers.get('x-backend-type'), 'aws');
    });

    // an author's IMS token is refused by the config service, and sending it as well would only
    // hand a user credential to a service that has no use for it
    it('sends no author token', async () => {
      stubFetch(onBus);

      await isSourceBus(env, daCtx());

      assert.strictEqual(new Headers(calls[0].init.headers).get('Authorization'), null);
    });

    it('gives up rather than hanging', async () => {
      stubFetch(onBus);

      await isSourceBus(env, daCtx());

      assert.ok(calls[0].init.signal, 'the lookup carries an abort signal');
    });
  });

  // the source is per site, so the ref in the url is only there to address the site
  describe('when the content source is on the source bus', () => {
    it('answers true', async () => {
      stubFetch(onBus);

      assert.strictEqual(await isSourceBus(env, daCtx()), true);
    });

    it('answers the same for any ref', async () => {
      stubFetch(onBus);

      assert.strictEqual(await isSourceBus(env, daCtx({ ref: 'branch' })), true);
    });

    // helix-admin tests the same prefix, so two clients cannot split one site across two stores
    it('reads the url, not the type, since both stores are markup', async () => {
      stubFetch(() => config({ type: 'markup', url: 'https://api.aem.live/o/sites/s/source' }));

      assert.strictEqual(await isSourceBus(env, daCtx()), true);
    });

    it('takes the source bus origin from env', async () => {
      stubFetch(() => config({ type: 'markup', url: 'https://api.stage.example/o/sites/s/source' }));

      assert.strictEqual(await isSourceBus({ ...env, AEM_API: 'https://api.stage.example' }, daCtx()), true);
    });
  });

  describe('when the content source is da-admin', () => {
    it('answers false', async () => {
      stubFetch(onDa);

      assert.strictEqual(await isSourceBus(env, daCtx()), false);
    });

    ['https://content.da.live/org/site/', 'https://drive.google.com/x', 'https://example.sharepoint.com/y'].forEach((url) => {
      it(`answers false for ${new URL(url).host}`, async () => {
        stubFetch(() => config({ type: 'markup', url }));

        assert.strictEqual(await isSourceBus(env, daCtx()), false);
      });
    });
  });

  // 404 is the one status that means there is no such site, and the site lookup answers that
  describe('when there is no such site', () => {
    it('answers false', async () => {
      stubFetch(() => new Response('', { status: 404 }));

      assert.strictEqual(await isSourceBus(env, daCtx()), false);
    });
  });

  // a refusal carries no decision, and reading it as legacy sends a source-bus write to da-admin,
  // where nothing serves it back
  describe('when the config service refuses', () => {
    [401, 403, 429, 500, 503].forEach((status) => {
      it(`throws on a ${status}`, async () => {
        stubFetch(() => new Response('', { status }));

        await assert.rejects(() => isSourceBus(env, daCtx()), new RegExp(`${status}`));
      });
    });

    it('throws when the answer has no content source', async () => {
      stubFetch(() => new Response(JSON.stringify({ ref: 'main' }), { status: 200 }));

      await assert.rejects(() => isSourceBus(env, daCtx()), /content source/);
    });

    it('throws when the answer is not json', async () => {
      stubFetch(() => new Response('<html></html>', { status: 200 }));

      await assert.rejects(() => isSourceBus(env, daCtx()));
    });
  });

  describe('when the config service cannot answer', () => {
    // the cause reaches the caller, which reports it on the 503 as `x-error`. swallowing it here
    // would leave a timeout and a dropped connection indistinguishable
    it('lets the failure through', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      await assert.rejects(isSourceBus(env, daCtx()), { message: 'fetch failed' });
    });

    it('lets it through when the config service is unusable, without asking', async () => {
      stubFetch(onBus);

      await assert.rejects(isSourceBus({ AEM_API: 'https://api.aem.live' }, daCtx()));
      assert.strictEqual(calls.length, 0);
    });

    // the distinction the caller acts on: false is a store, a failure is no store
    it('is distinguishable from a legacy answer', async () => {
      stubFetch(onDa);
      assert.strictEqual(await isSourceBus(env, daCtx()), false);

      stubFetch(() => {
        throw new TypeError('fetch failed');
      });
      await assert.rejects(isSourceBus(env, daCtx()));
    });
  });

  describe('when there is no site to ask about', () => {
    // either one missing is enough: a half-parsed request would otherwise build a config url with
    // "undefined" in it
    [
      ['neither', { org: undefined, site: undefined }],
      ['no org', { org: undefined }],
      ['no site', { site: undefined }],
      ['an empty org', { org: '' }],
      ['an empty site', { site: '' }],
    ].forEach(([what, over]) => {
      it(`answers false without making a request: ${what}`, async () => {
        stubFetch(onBus);

        assert.strictEqual(await isSourceBus(env, daCtx(over)), false);
        assert.strictEqual(calls.length, 0);
      });
    });
  });
});
