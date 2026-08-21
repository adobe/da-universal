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

const { default: getSiteConfig } = await import('../../src/storage/site.js');

const env = {
  AEM_API: 'https://api.aem.live',
  HLX_CONFIG_SERVICE: 'https://config.aem.page',
  HLX_CONFIG_SERVICE_TOKEN: 'shared-secret',
};

const daCtx = (over = {}) => ({
  org: 'org', site: 'site', ref: 'main', ...over,
});

const HEAD = '<link rel="stylesheet" href="/styles/styles.css"/>';

let calls;

const stubFetch = (respond) => {
  calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: input.toString(), init });
    return respond();
  };
};

const capturingErrors = async (run) => {
  const errors = [];
  const saved = console.error;
  console.error = (m) => errors.push(m);
  try {
    await run();
  } finally {
    console.error = saved;
  }
  return errors;
};

const config = (over = {}) => new Response(JSON.stringify({
  head: { html: HEAD },
  contentSource: { type: 'markup', url: 'https://content.da.live/org/site/' },
  ...over,
}), { status: 200, headers: { 'content-type': 'application/json' } });

const onBus = () => config({ contentSource: { type: 'markup', url: 'https://api.aem.live/org/sites/site/source' } });

describe('getSiteConfig', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('the request it makes', () => {
    it('asks the config service once, for the pipeline scope', async () => {
      stubFetch(config);

      await getSiteConfig(env, daCtx());

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].url, 'https://config.aem.page/main--site--org/config.json?scope=pipeline');
    });

    it('sends the shared secret', async () => {
      stubFetch(config);

      await getSiteConfig(env, daCtx());

      const headers = new Headers(calls[0].init.headers);
      assert.strictEqual(headers.get('x-access-token'), 'shared-secret');
      assert.strictEqual(headers.get('x-backend-type'), 'aws');
    });

    it('gives up rather than hanging', async () => {
      stubFetch(config);

      await getSiteConfig(env, daCtx());

      assert.ok(calls[0].init.signal, 'the lookup carries an abort signal');
    });
  });

  describe('what one answer carries', () => {
    it('answers existence, head.html and the store together', async () => {
      stubFetch(onBus);

      assert.deepStrictEqual(await getSiteConfig(env, daCtx()), {
        exists: true, head: HEAD, onSourceBus: true,
      });
    });

    it('reads the url, not the type, since both stores are markup', async () => {
      stubFetch(config);

      const { onSourceBus } = await getSiteConfig(env, daCtx());
      assert.strictEqual(onSourceBus, false);
    });

    it('takes the source bus origin from env', async () => {
      stubFetch(() => config({ contentSource: { type: 'markup', url: 'https://api.stage.example/o/sites/s/source' } }));

      const { onSourceBus } = await getSiteConfig({ ...env, AEM_API: 'https://api.stage.example' }, daCtx());
      assert.strictEqual(onSourceBus, true);
    });

    ['https://drive.google.com/x', 'https://example.sharepoint.com/y'].forEach((url) => {
      it(`answers legacy for ${new URL(url).host}`, async () => {
        stubFetch(() => config({ contentSource: { type: 'markup', url } }));

        const { onSourceBus } = await getSiteConfig(env, daCtx());
        assert.strictEqual(onSourceBus, false);
      });
    });

    // a ref that was never built exists and has no head.html
    it('answers a missing head as undefined, and still names the store', async () => {
      stubFetch(() => config({ head: undefined }));

      const { exists, head, onSourceBus } = await getSiteConfig(env, daCtx());
      assert.strictEqual(exists, true);
      assert.strictEqual(head, undefined);
      assert.strictEqual(onSourceBus, false);
    });
  });

  describe('when there is no such site', () => {
    it('answers no-site on a 404', async () => {
      stubFetch(() => new Response('', { status: 404 }));

      assert.deepStrictEqual(await getSiteConfig(env, daCtx()), {
        exists: false, head: undefined, onSourceBus: false,
      });
    });

    [
      ['neither', { org: undefined, site: undefined }],
      ['no org', { org: undefined }],
      ['no site', { site: undefined }],
      ['an empty org', { org: '' }],
      ['an empty site', { site: '' }],
    ].forEach(([what, over]) => {
      it(`answers no-site without asking: ${what}`, async () => {
        stubFetch(config);

        assert.deepStrictEqual(await getSiteConfig(env, daCtx(over)), {
          exists: false, head: undefined, onSourceBus: false,
        });
        assert.strictEqual(calls.length, 0);
      });
    });
  });

  describe('when the answer names no content source', () => {
    it('reads as legacy, since that is where a site without one has always been', async () => {
      stubFetch(() => config({ contentSource: undefined }));

      assert.deepStrictEqual(await getSiteConfig(env, daCtx()), {
        exists: true, head: HEAD, onSourceBus: false,
      });
    });

    // a source-bus site read as legacy is served the wrong document and written to the wrong store,
    // so the site says so in the log rather than only in an author's lost edits
    it('names the site in a warning', async () => {
      stubFetch(() => config({ contentSource: undefined }));
      const warnings = [];
      const saved = console.warn;
      console.warn = (m) => warnings.push(m);

      try {
        await getSiteConfig(env, daCtx());
      } finally {
        console.warn = saved;
      }

      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /org\/site/);
      assert.match(warnings[0], /content source/);
    });

    it('answers the same when the source carries no url', async () => {
      stubFetch(() => config({ contentSource: { type: 'markup' } }));

      const { onSourceBus } = await getSiteConfig(env, daCtx());
      assert.strictEqual(onSourceBus, false);
    });
  });

  // an unset token goes out as the string "undefined" and comes back a refusal, which reads
  // exactly like an outage unless the worker says which of the two it is
  describe('when the worker carries no config service token', () => {
    it('says the worker is misconfigured, and asks anyway', async () => {
      stubFetch(config);

      const errors = await capturingErrors(
        () => getSiteConfig({ ...env, HLX_CONFIG_SERVICE_TOKEN: undefined }, daCtx()),
      );

      assert.strictEqual(errors.length, 1);
      assert.match(errors[0], /HLX_CONFIG_SERVICE_TOKEN/);
      assert.match(errors[0], /every site lookup/);
      assert.strictEqual(calls.length, 1);
    });

    it('says nothing when the token is there', async () => {
      stubFetch(config);

      const errors = await capturingErrors(() => getSiteConfig(env, daCtx()));

      assert.deepStrictEqual(errors, []);
    });
  });

  describe('when the config service refuses', () => {
    [401, 403, 429, 500, 503].forEach((status) => {
      it(`throws on a ${status}`, async () => {
        stubFetch(() => new Response('', { status }));

        await assert.rejects(() => getSiteConfig(env, daCtx()), new RegExp(`${status}`));
      });
    });

    // a rotated token and an upstream outage are the same status, so the message carries the
    // one thing that separates them
    [401, 403].forEach((status) => {
      it(`names the token as present on a ${status}`, async () => {
        stubFetch(() => new Response('', { status }));

        await assert.rejects(
          () => getSiteConfig(env, daCtx()),
          /HLX_CONFIG_SERVICE_TOKEN present/,
        );
      });

      it(`names the token as missing on a ${status}`, async () => {
        stubFetch(() => new Response('', { status }));
        const noToken = { ...env, HLX_CONFIG_SERVICE_TOKEN: undefined };

        await capturingErrors(() => assert.rejects(
          () => getSiteConfig(noToken, daCtx()),
          /HLX_CONFIG_SERVICE_TOKEN missing/,
        ));
      });
    });

    it('throws when the answer is not json', async () => {
      stubFetch(() => new Response('<html></html>', { status: 200 }));

      await assert.rejects(() => getSiteConfig(env, daCtx()));
    });

    // the cause reaches the caller, which reports it on the 503 as `x-error`
    it('lets a failure through', async () => {
      stubFetch(() => {
        throw new TypeError('fetch failed');
      });

      await assert.rejects(getSiteConfig(env, daCtx()), { message: 'fetch failed' });
    });
  });
});
