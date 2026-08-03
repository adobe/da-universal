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
const UNKNOWN_SOURCE = { kind: 'unknown', reason: 'the config service answered 503' };

const DOC = '<body><main><div><p>the author typed this</p></div></main></body>';

/** The shape the Universal Editor Service posts: a `data` blob in a multipart form. */
const uePost = (url, html = DOC) => {
  const body = new FormData();
  body.set('data', new File([html], 'content.html', { type: 'text/html' }));
  return new Request(url, { method: 'POST', body, headers: { Authorization: 'Bearer t' } });
};

const build = async ({ source = LEGACY_SOURCE, status = 201 } = {}) => {
  const seen = { bus: [], legacy: [] };
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
    HLX_ADMIN: 'https://admin.hlx.page',
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
      default: async () => source,
      SOURCE_BUS: 'sourcebus',
      LEGACY: 'legacy',
      UNKNOWN: 'unknown',
    },
  });
  return { daSourcePost: mod.daSourcePost, env, seen };
};

const post = async (opts, url) => {
  const { daSourcePost, env, seen } = await build(opts);
  const req = uePost(url);
  const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });
  return { res, seen };
};

const AT = 'https://main--site--org.ue.da.live/folder/content';

afterEach(() => {
  delete globalThis.fetch;
});

describe('writing with the content source resolved', () => {
  describe('a stamped source-bus save', () => {
    it('goes to the source bus', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb.busetag`);

      assert.strictEqual(seen.legacy.length, 0);
      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/folder/content.html');
    });

    // this is the whole point: the etag came from the read, so a write conditioned on it cannot
    // land on a document the author never saw
    it('carries the etag the read returned as an If-Match', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb.busetag`);

      assert.strictEqual(seen.bus[0].headers.get('If-Match'), '"busetag"');
    });

    it('sends the document as the raw body the source bus parses', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb.busetag`);

      assert.strictEqual(seen.bus[0].body, DOC);
      assert.strictEqual(seen.bus[0].contentType, 'text/html');
    });

    // helix-api-service parses no form data; the envelope would be stored as the document text
    it('never wraps the body in a multipart envelope', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb.busetag`);

      assert.ok(!seen.bus[0].body.includes('Content-Disposition'), seen.bus[0].body);
      assert.ok(!/boundary/i.test(seen.bus[0].contentType ?? ''), seen.bus[0].contentType);
    });

    it('passes the store answer back, so a 412 reaches the editor', async () => {
      const { res } = await post({ source: BUS_SOURCE, status: 412 }, `${AT}?ab-src=sb.busetag`);

      assert.strictEqual(res.status, 412);
    });
  });

  describe('a save of a page the read did not find', () => {
    it('may only create, so an existing page is refused by the store', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb.new`);

      assert.strictEqual(seen.bus[0].headers.get('If-None-Match'), '*');
      assert.strictEqual(seen.bus[0].headers.get('If-Match'), null);
    });
  });

  describe('a source-bus save whose read carried no etag', () => {
    it('may overwrite but not create', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb`);

      assert.strictEqual(seen.bus[0].headers.get('If-Match'), '*');
    });
  });

  describe('a stamped legacy save', () => {
    it('goes to da-admin as a data form part', async () => {
      const { seen } = await post({ source: LEGACY_SOURCE }, `${AT}?ab-src=da`);

      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
      assert.ok(seen.legacy[0].body.includes('name="data"'), seen.legacy[0].body);
      assert.ok(seen.legacy[0].body.includes('the author typed this'), seen.legacy[0].body);
    });

    // da-admin sets no etag on a read, so there is nothing to condition on
    it('carries no precondition', async () => {
      const { seen } = await post({ source: LEGACY_SOURCE }, `${AT}?ab-src=da`);

      assert.strictEqual(seen.legacy[0].headers.get('If-Match'), null);
      assert.strictEqual(seen.legacy[0].headers.get('If-None-Match'), null);
    });
  });

  describe('when the store moved between the read and the save', () => {
    // the destructive case. The author read da-admin's copy, which for a migrated site is its
    // stale pre-migration content, and the site is now served from the source bus. Writing it
    // there would overwrite the live page with content the author never saw.
    it('refuses a legacy-stamped save to a site now on the source bus', async () => {
      const { res, seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=da`);

      assert.strictEqual(res.status, 409);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    it('refuses a source-bus-stamped save to a site now on da-admin', async () => {
      const { res, seen } = await post({ source: LEGACY_SOURCE }, `${AT}?ab-src=sb.busetag`);

      assert.strictEqual(res.status, 409);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    it('says so in plain text, since nothing renders a refused write', async () => {
      const { res } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=da`);

      assert.match(res.headers.get('Content-Type'), /^text\/plain/);
      assert.ok((await res.text()).length > 0);
    });
  });

  describe('a save with no stamp', () => {
    it('goes to da-admin unconditionally on a legacy site, as it did before', async () => {
      const { res, seen } = await post({ source: LEGACY_SOURCE }, AT);

      assert.strictEqual(res.status, 201);
      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(seen.legacy[0].headers.get('If-Match'), null);
    });

    // an old page, or a stamp the editor dropped. There is no provenance, so the save may
    // overwrite a page that exists but may not invent a new one.
    it('may overwrite but not create on a source-bus site', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, AT);

      assert.strictEqual(seen.bus.length, 1);
      assert.strictEqual(seen.bus[0].headers.get('If-Match'), '*');
    });
  });

  describe('a save carrying a stamp that cannot be trusted', () => {
    [
      ['an unknown store', 'gcs.abc'],
      ['an etag with a quote in it', 'sb.a"b'],
      ['a header injection attempt', 'sb.abc%0d%0aX-Evil:%201'],
      ['an empty value', ''],
    ].forEach(([what, value]) => {
      it(`falls back to no stamp: ${what}`, async () => {
        const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=${value}`);

        assert.strictEqual(seen.bus.length, 1);
        assert.strictEqual(seen.bus[0].headers.get('If-Match'), '*');
      });
    });

    it('never lets a stamp put a raw newline in a header', async () => {
      const { seen } = await post({ source: BUS_SOURCE }, `${AT}?ab-src=sb.a%0db`);

      assert.ok(!/[\r\n]/.test(seen.bus[0].headers.get('If-Match') ?? ''));
    });
  });

  describe('when the content source could not be resolved', () => {
    it('refuses with 503 and touches neither store', async () => {
      const { res, seen } = await post({ source: UNKNOWN_SOURCE }, `${AT}?ab-src=sb.busetag`);

      assert.strictEqual(res.status, 503);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });

    it('asks the caller to retry', async () => {
      const { res } = await post({ source: UNKNOWN_SOURCE }, AT);

      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    it('says so in plain text', async () => {
      const { res } = await post({ source: UNKNOWN_SOURCE }, AT);

      assert.match(res.headers.get('Content-Type'), /^text\/plain/);
    });
  });

  describe('what is written', () => {
    it('strips the UE data attributes before the store sees them', async () => {
      const { daSourcePost, env, seen } = await build({ source: BUS_SOURCE });
      const req = uePost(
        `${AT}?ab-src=sb.busetag`,
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
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });
  });

  describe('the path a save is written to', () => {
    it('keeps the case the source bus stores it under', async () => {
      const { seen } = await post(
        { source: BUS_SOURCE },
        'https://main--site--org.ue.da.live/Folder/Content?ab-src=sb.busetag',
      );

      assert.strictEqual(seen.bus[0].url, 'https://api.aem.live/org/sites/site/source/Folder/content.html');
    });

    it('lowercases the whole path for da-admin', async () => {
      const { seen } = await post(
        { source: LEGACY_SOURCE },
        'https://main--site--org.ue.da.live/Folder/Content?ab-src=da',
      );

      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
    });
  });
});
