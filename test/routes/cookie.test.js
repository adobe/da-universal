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

const { getCookie } = await import('../../src/routes/cookie.js');

const env = { AEM_API: 'https://api.aem.live' };

const daCtx = (over = {}) => ({ org: 'org', site: 'site', ...over });

const req = (over = {}) => new Request('https://main--site--org.ue.da.live/gimme_cookie', {
  headers: {
    Origin: over.origin ?? 'https://da.live',
    ...(over.noAuth ? {} : { Authorization: 'Bearer thetoken' }),
  },
});

let calls;

const stubFetch = (respond) => {
  calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: input.toString(), init });
    return respond();
  };
};

const noAuthNeeded = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
const mints = () => new Response(
  JSON.stringify({ siteToken: 'sitetok', siteTokenExpiry: Date.now() + 3600_000 }),
  { status: 200, headers: { 'content-type': 'application/json' } },
);

const cookies = (res) => res.headers.getSetCookie();

describe('getCookie', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the exchange it asks for', () => {
    // one service behind two hostnames: minted in the same second, admin.hlx.page and api.aem.live
    // answer a byte-identical token, so the worker asks the one it uses for everything else
    it('goes to the source bus api', async () => {
      stubFetch(noAuthNeeded);

      await getCookie({ req: req(), env, daCtx: daCtx() });

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://api.aem.live/auth/adobe/exchange');
    });

    it('takes the api from env, so stage can point elsewhere', async () => {
      stubFetch(noAuthNeeded);

      await getCookie({ req: req(), env: { AEM_API: 'https://api.stage.example' }, daCtx: daCtx() });

      assert.strictEqual(calls[0].url, 'https://api.stage.example/auth/adobe/exchange');
    });

    it('sends the org, the site and the caller token', async () => {
      stubFetch(noAuthNeeded);

      await getCookie({ req: req(), env, daCtx: daCtx() });

      assert.deepStrictEqual(JSON.parse(calls[0].init.body), {
        org: 'org', site: 'site', accessToken: 'thetoken',
      });
    });
  });

  describe('what it sets', () => {
    it('sets the auth cookie for a site that needs no site token', async () => {
      stubFetch(noAuthNeeded);

      const res = await getCookie({ req: req(), env, daCtx: daCtx() });

      assert.strictEqual(res.status, 200);
      const set = cookies(res);
      assert.strictEqual(set.length, 1);
      assert.ok(set[0].startsWith('auth_token=thetoken;'));
    });

    it('adds the site token for a site behind helix authentication', async () => {
      stubFetch(mints);

      const res = await getCookie({ req: req(), env, daCtx: daCtx() });

      const set = cookies(res);
      assert.strictEqual(set.length, 2);
      assert.ok(set[1].startsWith('site_token=sitetok;'));
      assert.match(set[1], /Max-Age=\d+/);
    });

    // the author is signed in either way, so a refused exchange keeps the auth cookie
    it('keeps the auth cookie when the exchange refuses', async () => {
      stubFetch(() => new Response('', { status: 403 }));

      const res = await getCookie({ req: req(), env, daCtx: daCtx() });

      assert.strictEqual(cookies(res).length, 1);
    });

    it('keeps the auth cookie when the exchange cannot be reached', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      const res = await getCookie({ req: req(), env, daCtx: daCtx() });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(cookies(res).length, 1);
    });

    it('asks for no exchange when the caller already has a site token', async () => {
      stubFetch(mints);

      await getCookie({ req: req(), env, daCtx: daCtx({ siteToken: 'already' }) });

      assert.strictEqual(calls.length, 0);
    });
  });

  describe('what it refuses', () => {
    it('refuses an untrusted origin', async () => {
      stubFetch(mints);

      const res = await getCookie({ req: req({ origin: 'https://evil.example' }), env, daCtx: daCtx() });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(calls.length, 0);
    });

    // the stage experience shell has to reach the stage worker so the stage UE path has a
    // first-class entry point
    it('trusts the stage experience shell', async () => {
      stubFetch(mints);

      const res = await getCookie({
        req: req({ origin: 'https://experience-stage.adobe.com' }),
        env,
        daCtx: daCtx(),
      });

      assert.notStrictEqual(res.status, 403);
    });

    it('answers 401 without an Authorization header', async () => {
      stubFetch(mints);

      const res = await getCookie({ req: req({ noAuth: true }), env, daCtx: daCtx() });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(calls.length, 0);
    });
  });
});
