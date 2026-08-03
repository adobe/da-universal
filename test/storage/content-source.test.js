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

const { default: resolveContentSource } = await import('../../src/storage/content-source.js');

const env = { HLX_ADMIN: 'https://admin.hlx.page' };

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
    it('asks the sidekick config for org, site and ref', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx({ ref: 'branch' }));

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(
        calls[0].url,
        'https://admin.hlx.page/sidekick/org/site/branch/config.json',
      );
    });

    it('passes the author token on, so a private site resolves', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx());

      assert.strictEqual(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer t');
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

    it('answers unknown for a host that only starts like api.aem.live', async () => {
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
    // a 404 is what helix-admin returns when config resolution produced nothing
    // (src/sidekick/handler.js: `if (config) { ... } return { status: 404 }`), so it
    // means "we do not know", not "legacy"
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

    it('answers unknown on a 401', async () => {
      stubFetch(() => new Response('', { status: 401 }));

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

  describe('when there is no site to ask about', () => {
    it('answers unknown without making a request', async () => {
      stubFetch(legacyBody);

      const source = await resolveContentSource(env, daCtx({ org: undefined, site: undefined }));

      assert.strictEqual(source.kind, 'unknown');
      assert.strictEqual(calls.length, 0);
    });
  });

  describe('reusing an answer within a page load', () => {
    // one previewed page is many worker requests: the document, then one per relative image src,
    // each of which would look the store up again. Measured live on 2026-08-03: the sidekick
    // config is `cache-control: no-store` and costs ~460ms, so 8 identical lookups spend 3.8s of
    // origin time and add that to every image.
    //
    // What is held is per isolate and shared across requests, so each test here uses its own site.
    it('asks once for a burst of reads of the same site', async () => {
      stubFetch(legacyBody);
      const ctx = daCtx({ site: 'burst' });

      await resolveContentSource(env, ctx, { reuse: true });
      await resolveContentSource(env, ctx, { reuse: true });
      await resolveContentSource(env, ctx, { reuse: true });

      assert.strictEqual(calls.length, 1);
    });

    it('gives the same answer each time', async () => {
      stubFetch(() => sidekick('https://api.aem.live/org/sites/same/source'));
      const ctx = daCtx({ site: 'same' });

      const first = await resolveContentSource(env, ctx, { reuse: true });
      const second = await resolveContentSource(env, ctx, { reuse: true });

      assert.deepStrictEqual(second, first);
    });

    it('asks again for a different site', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx({ site: 'one' }), { reuse: true });
      await resolveContentSource(env, daCtx({ site: 'two' }), { reuse: true });

      assert.strictEqual(calls.length, 2);
    });

    it('asks again for a different ref of the same site', async () => {
      stubFetch(legacyBody);

      await resolveContentSource(env, daCtx({ site: 'refs' }), { reuse: true });
      await resolveContentSource(env, daCtx({ site: 'refs', ref: 'branch' }), { reuse: true });

      assert.strictEqual(calls.length, 2);
    });

    // a write is the one operation a wrong store cannot be walked back from, so it always asks
    it('does not reuse an answer unless asked to', async () => {
      stubFetch(legacyBody);
      const ctx = daCtx({ site: 'writes' });

      await resolveContentSource(env, ctx, { reuse: true });
      await resolveContentSource(env, ctx);
      await resolveContentSource(env, ctx);

      assert.strictEqual(calls.length, 3);
    });

    // an outage that stuck would outlast itself
    it('never stores an answer it could not give', async () => {
      stubFetch(() => new Response('', { status: 503 }));
      const ctx = daCtx({ site: 'flaky' });

      await resolveContentSource(env, ctx, { reuse: true });
      await resolveContentSource(env, ctx, { reuse: true });

      assert.strictEqual(calls.length, 2);
    });

    it('picks up a recovery on the next read', async () => {
      let attempt = 0;
      stubFetch(() => {
        attempt += 1;
        return attempt === 1
          ? new Response('', { status: 503 })
          : sidekick('https://api.aem.live/org/sites/recovering/source');
      });
      const ctx = daCtx({ site: 'recovering' });

      const down = await resolveContentSource(env, ctx, { reuse: true });
      const up = await resolveContentSource(env, ctx, { reuse: true });

      assert.strictEqual(down.kind, 'unknown');
      assert.strictEqual(up.kind, 'sourcebus');
    });
  });

  describe('the admin host', () => {
    // the caller turns unknown into a 503 it can return; a throw here escapes into
    // withCorsHeaders, which reads response.headers and throws again on undefined
    it('answers unknown rather than throwing when it is not set', async () => {
      stubFetch(legacyBody);

      const source = await resolveContentSource({}, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('answers unknown rather than throwing when it is not a url', async () => {
      stubFetch(legacyBody);

      const source = await resolveContentSource({ HLX_ADMIN: 'not-a-url' }, daCtx());

      assert.strictEqual(source.kind, 'unknown');
    });

    it('comes from env, so stage can point elsewhere', async () => {
      stubFetch(legacyBody);

      await resolveContentSource({ HLX_ADMIN: 'https://admin.stage.example' }, daCtx());

      assert.strictEqual(
        calls[0].url,
        'https://admin.stage.example/sidekick/org/site/main/config.json',
      );
    });
  });
});
