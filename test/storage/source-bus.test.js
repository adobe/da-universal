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

const env = { AEM_API: 'https://api.aem.live', HLX_ADMIN: 'https://admin.hlx.page' };

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

const ping = (headers = {}, status = 200) => new Response('', { status, headers });
const upgraded = () => ping({ 'x-api-upgrade-available': 'true' });

describe('isSourceBus', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks /ping on the admin host', async () => {
      stubFetch(upgraded);

      await isSourceBus(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://admin.hlx.page/ping/org/site');
    });

    it('takes the admin host from env, so stage can point elsewhere', async () => {
      stubFetch(upgraded);

      await isSourceBus({ ...env, HLX_ADMIN: 'https://admin.stage.example' }, daCtx());

      assert.strictEqual(calls[0].url, 'https://admin.stage.example/ping/org/site');
    });

    // both stores read one config service and the source is per site, so the branch cannot change
    // the answer
    it('does not vary by ref', async () => {
      stubFetch(upgraded);

      await isSourceBus(env, daCtx({ ref: 'branch' }));

      assert.strictEqual(calls[0].url, 'https://admin.hlx.page/ping/org/site');
    });

    // /ping is exempt from authorize() in helix-admin and answers the same with or without a token
    it('sends no token, since /ping does not read one', async () => {
      stubFetch(upgraded);

      await isSourceBus(env, daCtx());

      assert.strictEqual(new Headers(calls[0].init.headers).get('Authorization'), null);
    });

    it('gives up rather than hanging', async () => {
      stubFetch(upgraded);

      await isSourceBus(env, daCtx());

      assert.ok(calls[0].init.signal, 'the probe carries an abort signal');
    });
  });

  describe('when /ping says the site is upgraded', () => {
    it('answers true', async () => {
      stubFetch(upgraded);

      assert.strictEqual(await isSourceBus(env, daCtx()), true);
    });

    // presence, not value: da-nx tests the same header with `!== null` (nx2/utils/api.js,
    // isHlx6), and two clients reading it differently would split one site across two stores
    ['false', '', 'TRUE'].forEach((value) => {
      it(`counts any value, including ${JSON.stringify(value)}`, async () => {
        stubFetch(() => ping({ 'x-api-upgrade-available': value }));

        assert.strictEqual(await isSourceBus(env, daCtx()), true);
      });
    });

    // no status test, for the same reason. the edge sets the header from its dictionary, so a
    // rate-limited or erroring origin behind it does not make an enrolled site legacy
    [429, 500, 503].forEach((status) => {
      it(`counts it on a ${status}, since the header is what carries the answer`, async () => {
        stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }, status));

        assert.strictEqual(await isSourceBus(env, daCtx()), true);
      });
    });
  });

  describe('when /ping does not say so', () => {
    [
      ['the header is absent', {}, 200],
      ['the header is absent on a 404', {}, 404],
      ['the header is absent on a 405', {}, 405],
      ['the header is absent on a 500', {}, 500],
    ].forEach(([what, headers, status]) => {
      it(`answers false: ${what}`, async () => {
        stubFetch(() => ping(headers, status));

        assert.strictEqual(await isSourceBus(env, daCtx()), false);
      });
    });

    it('answers false when the probe throws', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      assert.strictEqual(await isSourceBus(env, daCtx()), false);
    });

    // HLX_ADMIN is a wrangler.toml constant, so this is a broken deploy rather than a runtime
    // condition. It answers legacy instead of throwing out of every read.
    it('answers false without asking when HLX_ADMIN is unusable', async () => {
      stubFetch(upgraded);

      assert.strictEqual(await isSourceBus({ AEM_API: 'https://api.aem.live' }, daCtx()), false);
      assert.strictEqual(calls.length, 0);
    });
  });

  describe('when there is no site to ask about', () => {
    // either one missing is enough: a half-parsed request would otherwise build a ping url with
    // "undefined" in it
    [
      ['neither', { org: undefined, site: undefined }],
      ['no org', { org: undefined }],
      ['no site', { site: undefined }],
      ['an empty org', { org: '' }],
      ['an empty site', { site: '' }],
    ].forEach(([what, over]) => {
      it(`answers false without making a request: ${what}`, async () => {
        stubFetch(upgraded);

        assert.strictEqual(await isSourceBus(env, daCtx(over)), false);
        assert.strictEqual(calls.length, 0);
      });
    });
  });

  // nothing is remembered between calls, so an enrolment takes effect on the next read and a
  // config blip cannot pin a stale answer
  it('probes every time it is asked', async () => {
    let enrolled = false;
    stubFetch(() => (enrolled ? upgraded() : ping()));

    assert.strictEqual(await isSourceBus(env, daCtx()), false);
    enrolled = true;

    assert.strictEqual(await isSourceBus(env, daCtx()), true);
    assert.strictEqual(calls.length, 2);
  });
});
