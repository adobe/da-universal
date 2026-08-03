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
const UNKNOWN_SOURCE = { kind: 'unknown', reason: 'the API answered 503' };
const DENIED_SOURCE = { kind: 'unauthorized', status: 401 };

const AT = 'https://main--site--org.ue.da.live/folder/content';
const DOC = '<body><main><div><p>the author typed this</p></div></main></body>';

/** The shape the Universal Editor Service posts: a `data` blob in a multipart form. */
const uePost = (url, html = DOC) => {
  const body = new FormData();
  body.set('data', new File([html], 'content.html', { type: 'text/html' }));
  return new Request(url, { method: 'POST', body, headers: { Authorization: 'Bearer t' } });
};

const build = async ({ source = LEGACY_SOURCE, status = 201 } = {}) => {
  const seen = { bus: [], legacy: [], lookups: 0 };
  const capture = async (request) => {
    const clone = request.clone();
    return {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: await clone.text(),
      contentType: request.headers.get('Content-Type'),
    };
  };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.bus.push(await capture(request));
    return new Response('', { status });
  };
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    AEM_API: 'https://api.aem.live',
    daadmin: {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        seen.legacy.push(await capture(request));
        return new Response('', { status });
      },
    },
  };
  const mod = await esmock('../../src/routes/da-admin.js', {
    '../../src/storage/content-source.js': {
      default: async () => {
        seen.lookups += 1;
        return source;
      },
      SOURCE_BUS: 'sourcebus',
      LEGACY: 'legacy',
      UNKNOWN: 'unknown',
    },
  });
  return { daSourcePost: mod.daSourcePost, env, seen };
};

const post = async (opts, url = AT) => {
  const { daSourcePost, env, seen } = await build(opts);
  const req = uePost(url);
  const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });
  return { res, seen };
};

afterEach(() => {
  delete globalThis.fetch;
});

describe('writing to the store that holds the site', () => {
  describe('a source-bus site', () => {
    it('writes to the base the config named', async () => {
      const { seen } = await post({ source: BUS_SOURCE });

      assert.strictEqual(seen.legacy.length, 0);
      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    it('sends the document as the raw body the source bus parses', async () => {
      const { seen } = await post({ source: BUS_SOURCE });

      assert.strictEqual(seen.bus[0].body, DOC);
      assert.strictEqual(seen.bus[0].contentType, 'text/html');
    });

    // helix-api-service parses no form data; the envelope would be stored as the document text
    // and answered 201
    it('never wraps the body in a multipart envelope', async () => {
      const { seen } = await post({ source: BUS_SOURCE });

      assert.ok(!seen.bus[0].body.includes('Content-Disposition'), seen.bus[0].body);
      assert.ok(!/boundary/i.test(seen.bus[0].contentType ?? ''), seen.bus[0].contentType);
    });

    it('authorizes with the caller token', async () => {
      const { seen } = await post({ source: BUS_SOURCE });

      assert.strictEqual(seen.bus[0].headers.get('Authorization'), 'Bearer t');
    });

    it('passes the store answer back', async () => {
      const { res } = await post({ source: BUS_SOURCE, status: 412 });

      assert.strictEqual(res.status, 412);
    });
  });

  describe('a legacy site', () => {
    it('writes to da-admin as a data form part', async () => {
      const { seen } = await post({ source: LEGACY_SOURCE });

      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
      assert.ok(seen.legacy[0].body.includes('name="data"'), seen.legacy[0].body);
      assert.ok(seen.legacy[0].body.includes('the author typed this'), seen.legacy[0].body);
    });
  });

  describe('no write carries a precondition', () => {
    // only the source bus sets an etag on a read, and nothing round-trips it into the save: the
    // editor keeps the connection uri it was served at page load and posts back to it for every
    // edit, so a version pin would land the first save and refuse the rest with 412
    [['a source-bus', BUS_SOURCE, 'bus'], ['a legacy', LEGACY_SOURCE, 'legacy']].forEach(
      ([what, source, where]) => {
        it(`${what} write sends no If-Match or If-None-Match`, async () => {
          const { seen } = await post({ source });

          assert.strictEqual(seen[where][0].headers.get('If-Match'), null);
          assert.strictEqual(seen[where][0].headers.get('If-None-Match'), null);
        });
      },
    );

    it('so a UE session can save the same page many times', async () => {
      const { daSourcePost, env, seen } = await build({ source: BUS_SOURCE });
      const statuses = [];

      for (let i = 0; i < 4; i += 1) {
        const req = uePost(AT, `<body><main><div><p>edit ${i + 1}</p></div></main></body>`);
        // eslint-disable-next-line no-await-in-loop
        const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });
        statuses.push(res.status);
      }

      assert.deepStrictEqual(statuses, [201, 201, 201, 201]);
      assert.strictEqual(seen.bus.length, 4);
    });
  });

  describe('the store lookup on a write', () => {
    // nothing is held between requests, so a write and the read before it resolve independently
    it('happens once per write', async () => {
      const { seen } = await post({ source: BUS_SOURCE });

      assert.strictEqual(seen.lookups, 1);
    });

    it('happens before anything is sent to a store', async () => {
      const { seen } = await post({ source: UNKNOWN_SOURCE });

      assert.strictEqual(seen.lookups, 1);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });
  });

  describe('when the content source could not be resolved', () => {
    it('refuses with 503 and touches neither store', async () => {
      const { res, seen } = await post({ source: UNKNOWN_SOURCE });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    it('asks the caller to retry', async () => {
      const { res } = await post({ source: UNKNOWN_SOURCE });

      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    // nothing renders a POST body, and UES embeds it verbatim in its problem+json error string
    it('says so in plain text', async () => {
      const { res } = await post({ source: UNKNOWN_SOURCE });

      assert.match(res.headers.get('Content-Type'), /^text\/plain/);
      assert.ok((await res.text()).length > 0);
    });
  });

  describe('when the caller is not allowed to ask which store', () => {
    it('answers 401, not a retryable 503', async () => {
      const { res, seen } = await post({ source: DENIED_SOURCE });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.headers.get('Retry-After'), null);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });
  });

  describe('when the store cannot be reached at all', () => {
    it('answers 503 rather than throwing', async () => {
      const { daSourcePost, env } = await build({ source: BUS_SOURCE });
      globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
      const req = uePost(AT);

      const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });
  });

  describe('what is written', () => {
    it('strips the UE data attributes before the store sees them', async () => {
      const { daSourcePost, env, seen } = await build({ source: BUS_SOURCE });
      const req = uePost(
        AT,
        '<body><main><div data-aue-resource="urn:ab:page"><p>text</p></div></main></body>',
      );

      await daSourcePost({ req, env, daCtx: getDaCtx(req) });

      assert.ok(!seen.bus[0].body.includes('data-aue-resource'), seen.bus[0].body);
    });

    it('refuses a non-html path before resolving anything', async () => {
      const { daSourcePost, env, seen } = await build({ source: BUS_SOURCE });
      const req = uePost('https://main--site--org.ue.da.live/folder/data.json');

      const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 415);
      assert.strictEqual(seen.lookups, 0);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });
  });

  describe('the path a save is written to', () => {
    it('keeps the case the source bus stores it under', async () => {
      const { seen } = await post(
        { source: BUS_SOURCE },
        'https://main--site--org.ue.da.live/Folder/Content',
      );

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/Folder/content.html');
    });

    it('lowercases the whole path for da-admin', async () => {
      const { seen } = await post(
        { source: LEGACY_SOURCE },
        'https://main--site--org.ue.da.live/Folder/Content',
      );

      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
    });
  });
});
