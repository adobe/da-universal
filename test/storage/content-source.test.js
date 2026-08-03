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

const {
  default: resolveContentSource, fastSourceBus,
} = await import('../../src/storage/content-source.js');

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

const sidekick = (contentSourceUrl) => new Response(
  JSON.stringify({ contentSourceUrl, contentSourceType: 'markup' }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
);

const legacyBody = () => sidekick('https://content.da.live/org/site/');

describe('resolveContentSource', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks the AEM API for the site', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://api.aem.live/org/sites/site/sidekick');
    });

    // both stores read the same config service and the source is per site, so the branch does
    // not change the answer
    it('does not vary by ref', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx({ ref: 'branch' }));

      assert.strictEqual(calls[0].url, 'https://api.aem.live/org/sites/site/sidekick');
    });

    it('passes the author token on, so a private site resolves', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx());

      assert.strictEqual(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer t');
    });

    // a config service that accepts the connection and never answers would otherwise hold the
    // request open for as long as the platform allows
    it('gives up on the lookup rather than hanging', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx());

      const { signal } = calls[0].init;
      assert.ok(signal, 'the lookup carries an abort signal');
      assert.strictEqual(typeof signal.aborted, 'boolean');
    });

    it('asks anyway when there is no author token', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx({ authToken: undefined }));

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(new Headers(calls[0].init.headers).get('Authorization'), null);
    });
  });

  describe('when the content source is on api.aem.live', () => {
    it('answers sourcebus', async () => {
      stubFetch(() => sidekick('https://api.aem.live/org/sites/site/source'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'sourcebus');
    });

    it('carries the base url from the config, rather than rebuilding it', async () => {
      stubFetch(() => sidekick('https://api.aem.live/other/sites/elsewhere/source'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.base, 'https://api.aem.live/other/sites/elsewhere/source');
    });

    it('drops a trailing slash on the base, so paths do not double up', async () => {
      stubFetch(() => sidekick('https://api.aem.live/org/sites/site/source/'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.base, 'https://api.aem.live/org/sites/site/source');
    });
  });

  describe('when the content source is on content.da.live', () => {
    it('answers legacy', async () => {
      stubFetch(legacyBody);

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'legacy');
    });
  });

  describe('when the answer is not one of the two stores', () => {
    // this worker only serves DA-backed sites, so a google or onedrive mount is not
    // something either store can answer for and must not be guessed at
    it('answers unknown for a source url it does not recognise', async () => {
      stubFetch(() => sidekick('https://drive.google.com/drive/folders/abc'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown when contentSourceUrl is missing from the body', async () => {
      stubFetch(() => new Response(JSON.stringify({ project: 'site' }), { status: 200 }));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown for a host that only starts like the API', async () => {
      stubFetch(() => sidekick('https://api.aem.live.evil.example/org/sites/site/source'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    // the base is used verbatim as a store url and the author token goes with it, so the store
    // has to be named at the front of the url and not merely somewhere inside it
    it('answers unknown when a store url appears anywhere but the start', async () => {
      stubFetch(() => sidekick('https://elsewhere.example/?to=https://api.aem.live/org/sites/site/source'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown for a legacy url buried mid-string too', async () => {
      stubFetch(() => sidekick('https://elsewhere.example/#https://content.da.live/org/site/'));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });
  });

  describe('when the question could not be answered', () => {
    // a 404 is what the sidekick route returns when config resolution produced nothing
    // (helix-api-service and helix-admin both: `if (config) { ... } return { status: 404 }`), so
    // it means "we do not know", not "legacy"
    it('answers unknown on a 404', async () => {
      stubFetch(() => new Response('', { status: 404 }));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown on a 5xx', async () => {
      stubFetch(() => new Response('', { status: 503 }));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown when the body is not json', async () => {
      stubFetch(() => new Response('<html>gateway</html>', { status: 200 }));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown when the fetch throws', async () => {
      stubFetch(() => {
        throw new Error('boom');
      });

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('says why it could not answer', async () => {
      stubFetch(() => new Response('', { status: 404 }));

      const source = await resolveContentSource(env, daCtx());

      assert.match(source.reason, /404/);
    });
  });

  describe('when the caller is not allowed to ask', () => {
    // "we do not know" is retryable and "you are not authenticated" is not. Reporting an expired
    // session as unknown turns into a 503 that says retry, so the client never re-authenticates
    // and the da:401 recovery the authorbus extension has never fires.
    [401, 403].forEach((status) => {
      it(`answers unauthorized on a ${status}, not unknown`, async () => {
        stubFetch(() => new Response('', { status }));

        const source = await resolveContentSource(env, daCtx());

        assert.strictEqual(source.kind, 'unauthorized');
      });

      it(`carries the ${status} through, so the caller answers the same`, async () => {
        stubFetch(() => new Response('', { status }));

        const source = await resolveContentSource(env, daCtx());

        assert.strictEqual(source.status, status);
      });
    });

    it('still answers unknown for a 5xx, which is retryable', async () => {
      stubFetch(() => new Response('', { status: 502 }));

      const source = await resolveContentSource(env, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });
  });

  describe('when there is no site to ask about', () => {
    // either one missing is enough: a half-parsed request would otherwise build a url with
    // "undefined" in it and send the author's token to it
    [
      ['neither', { org: undefined, site: undefined }],
      ['no org', { org: undefined }],
      ['no site', { site: undefined }],
      ['an empty org', { org: '' }],
      ['an empty site', { site: '' }],
    ].forEach(([what, over]) => {
      it(`answers unknown without making a request: ${what}`, async () => {
        stubFetch(legacyBody);

        const source = await resolveContentSource(env, daCtx(over));

        assert.strictEqual(source.kind, 'unknown');
        assert.strictEqual(calls.length, 0);
      });
    });
  });

  describe('the API host', () => {
    // the caller turns unknown into a 503 it can return; a throw here escapes into
    // withCorsHeaders, which reads response.headers and throws again on undefined
    it('answers unknown rather than throwing when it is not set', async () => {
      stubFetch(legacyBody);

      const source = await resolveContentSource({}, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown rather than throwing when it is not a url', async () => {
      stubFetch(legacyBody);

      const source = await resolveContentSource({ AEM_API: 'not-a-url' }, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('comes from env, so stage can point elsewhere', async () => {
      stubFetch(legacyBody);

      await resolveContentSource({ AEM_API: 'https://api.stage.example' }, daCtx());

      assert.strictEqual(calls[0].url, 'https://api.stage.example/org/sites/site/sidekick');
    });

    it('tolerates a trailing slash on it', async () => {
      stubFetch(legacyBody);

      await resolveContentSource({ AEM_API: 'https://api.aem.live/' }, daCtx());

      assert.strictEqual(calls[0].url, 'https://api.aem.live/org/sites/site/sidekick');
    });

    // the same env value decides where we ask and what counts as the source bus, so pointing at
    // stage must not leave the prefix test matching production
    it('is also what makes a source url the source bus', async () => {
      stubFetch(() => sidekick('https://api.aem.live/org/sites/site/source'));

      const source = await resolveContentSource({ AEM_API: 'https://api.stage.example' }, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });
  });
});

describe('fastSourceBus', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // /ping answers an enrolled site from the Fastly edge dictionary in ~37ms without reaching an
  // origin, where the config read is ~529ms and always reaches one. Its `true` is positive
  // evidence; its absence conflates legacy, a config that would not resolve, and a site that does
  // not exist, so only the yes is usable.
  const ping = (headers = {}, status = 200) => new Response('', { status, headers });

  it('asks /ping on the admin host', async () => {
    stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

    await fastSourceBus(env, daCtx());

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://admin.hlx.page/ping/org/site');
  });

  // /ping is exempt from authorize() in helix-admin and answers the same with or without a token
  it('sends no token, since /ping does not read one', async () => {
    stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

    await fastSourceBus(env, daCtx());

    assert.strictEqual(new Headers(calls[0].init.headers).get('Authorization'), null);
  });

  it('gives up rather than hanging', async () => {
    stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

    await fastSourceBus(env, daCtx());

    assert.ok(calls[0].init.signal, 'the probe carries an abort signal');
  });

  describe('when /ping says the site is upgraded', () => {
    it('answers sourcebus', async () => {
      stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

      assert.strictEqual((await fastSourceBus(env, daCtx())).kind, 'sourcebus');
    });

    // helix-api-service parses org and site out of the source url and 400s unless both match the
    // request's own (src/contentproxy/source/utils.js, "only allow source bus from the same org
    // and site"), so this is the only base a source-bus site can legally have
    it('builds the only base that org and site can legally have', async () => {
      stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

      const source = await fastSourceBus(env, daCtx());

      assert.strictEqual(source.base, 'https://api.aem.live/org/sites/site/source');
    });

    it('builds it on AEM_API, so stage moves it', async () => {
      stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

      const source = await fastSourceBus({ ...env, AEM_API: 'https://api.stage.example' }, daCtx());

      assert.strictEqual(source.base, 'https://api.stage.example/org/sites/site/source');
    });
  });

  describe('when /ping does not say so', () => {
    [
      ['the header is absent', {}, 200],
      ['the header is false', { 'x-api-upgrade-available': 'false' }, 200],
      ['the header is empty', { 'x-api-upgrade-available': '' }, 200],
      ['the header is TRUE in capitals', { 'x-api-upgrade-available': 'TRUE' }, 200],
      ['the status is 404', { 'x-api-upgrade-available': 'true' }, 404],
      ['the status is 405', {}, 405],
      ['the status is 500', {}, 500],
    ].forEach(([what, headers, status]) => {
      it(`answers undefined: ${what}`, async () => {
        stubFetch(() => ping(headers, status));

        assert.strictEqual(await fastSourceBus(env, daCtx()), undefined);
      });
    });

    it('answers undefined when the probe throws', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      assert.strictEqual(await fastSourceBus(env, daCtx()), undefined);
    });

    it('answers undefined without asking when there is no site', async () => {
      stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

      assert.strictEqual(await fastSourceBus(env, daCtx({ site: undefined })), undefined);
      assert.strictEqual(calls.length, 0);
    });

    it('answers undefined when the admin host is unusable', async () => {
      stubFetch(() => ping({ 'x-api-upgrade-available': 'true' }));

      assert.strictEqual(await fastSourceBus({ ...env, HLX_ADMIN: 'nope' }, daCtx()), undefined);
    });
  });
});
