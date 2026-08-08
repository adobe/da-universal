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
import { SOURCE_BUS_READ_ONLY_MESSAGE, SOURCE_UNDETERMINED_MESSAGE } from '../../src/utils/constants.js';

const AT = 'https://main--site--org.ue.da.live/folder/content';
const DOC = '<body><main><div><p>the author typed this</p></div></main></body>';

/** The shape the Universal Editor Service posts: a `data` blob in a multipart form. */
const uePost = (url, html = DOC) => {
  const body = new FormData();
  body.set('data', new File([html], 'content.html', { type: 'text/html' }));
  return new Request(url, { method: 'POST', body, headers: { Authorization: 'Bearer t' } });
};

const build = async (overrides = {}) => {
  const { status = 201 } = overrides;
  // `in overrides` rather than a destructured default, so passing an explicit undefined really
  // does simulate a probe that could not answer
  const onSourceBus = 'onSourceBus' in overrides ? overrides.onSourceBus : false;
  const seen = {
    bus: [], legacy: [], lookups: 0, order: [],
  };
  const capture = async (request) => {
    const contentType = request.headers.get('Content-Type');
    const [body, form] = await Promise.all([
      request.clone().text(),
      contentType?.startsWith('multipart/') ? request.clone().formData() : undefined,
    ]);
    return {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body,
      form,
      contentType,
    };
  };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    seen.order.push('store');
    seen.bus.push(await capture(request));
    return new Response('', { status });
  };
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    AEM_API: 'https://api.aem.live',
    daadmin: {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        seen.order.push('store');
        seen.legacy.push(await capture(request));
        return new Response('', { status });
      },
    },
  };
  const mod = await esmock('../../src/routes/da-admin.js', {
    '../../src/storage/source-bus.js': {
      default: async () => {
        seen.lookups += 1;
        seen.order.push('lookup');
        return onSourceBus;
      },
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

describe('writing to the store that holds the site', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  // the Universal Editor on da.live has never supported source-bus sites, and da-admin would take
  // the document at 201 for a key nothing serves, so the write is refused rather than misplaced
  describe('a source-bus site', () => {
    it('is refused with 405 and touches neither store', async () => {
      const { res, seen } = await post({ onSourceBus: true });

      assert.strictEqual(res.status, 405);
      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy.length, 0);
    });

    it('names the methods that are left', async () => {
      const { res } = await post({ onSourceBus: true });

      assert.strictEqual(res.headers.get('Allow'), 'GET, HEAD, OPTIONS');
    });

    it('does not ask the caller to retry, since retrying cannot help', async () => {
      const { res } = await post({ onSourceBus: true });

      assert.strictEqual(res.headers.get('Retry-After'), null);
    });

    // nothing renders a POST body, and UES embeds it verbatim in its problem+json error string,
    // so the exact text is what the author is shown
    it('says what happened in plain text', async () => {
      const { res } = await post({ onSourceBus: true });

      assert.match(res.headers.get('Content-Type'), /^text\/plain/);
      assert.strictEqual(await res.text(), SOURCE_BUS_READ_ONLY_MESSAGE);
    });
  });

  // a write is the one operation a wrong store cannot be walked back from, so no answer means no
  // write rather than a guess
  describe('when /ping cannot say which store holds the site', () => {
    it('is refused with 503 and touches neither store', async () => {
      const { res, seen } = await post({ onSourceBus: undefined });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy.length, 0);
    });

    it('asks the caller to retry, unlike the source-bus refusal', async () => {
      const { res } = await post({ onSourceBus: undefined });

      assert.ok(Number(res.headers.get('Retry-After')) > 0);
    });

    it('says which of the two refusals it is', async () => {
      const { res } = await post({ onSourceBus: undefined });

      assert.strictEqual(await res.text(), SOURCE_UNDETERMINED_MESSAGE);
    });
  });

  describe('a legacy site', () => {
    it('writes to da-admin over the service binding', async () => {
      const { seen } = await post({});

      assert.strictEqual(seen.bus.length, 0);
      assert.strictEqual(seen.legacy.length, 1);
      assert.strictEqual(seen.legacy[0].method, 'POST');
      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
    });

    // da-admin parses the document out of a `data` form part and ignores a raw body
    it('sends the document as a text/html data part', async () => {
      const { seen } = await post({});

      const data = seen.legacy[0].form.get('data');

      assert.strictEqual(await data.text(), DOC);
      assert.strictEqual(data.type, 'text/html');
    });

    it('authorizes with the caller token', async () => {
      const { seen } = await post({});

      assert.strictEqual(seen.legacy[0].headers.get('Authorization'), 'Bearer t');
    });

    it('passes the store answer back', async () => {
      const { res } = await post({ status: 412 });

      assert.strictEqual(res.status, 412);
    });

    it('normalizes the whole path', async () => {
      const { seen } = await post(
        {},
        'https://main--site--org.ue.da.live/Folder/Content',
      );

      assert.strictEqual(seen.legacy[0].url, 'https://admin.da.live/source/org/site/folder/content.html');
    });

    it('strips the UE data attributes before the store sees them', async () => {
      const { daSourcePost, env, seen } = await build({});
      const req = uePost(
        AT,
        '<body><main><div data-aue-resource="urn:ab:page"><p>text</p></div></main></body>',
      );

      await daSourcePost({ req, env, daCtx: getDaCtx(req) });

      assert.ok(!seen.legacy[0].body.includes('data-aue-resource'), seen.legacy[0].body);
    });
  });

  describe('a legacy write carries no precondition', () => {
    // nothing round-trips an etag into the save: the editor keeps the connection uri it was
    // served at page load and posts back to it for every edit, so a version pin would land the
    // first save and refuse the rest with 412
    it('sends no If-Match or If-None-Match', async () => {
      const { seen } = await post({});

      assert.strictEqual(seen.legacy[0].headers.get('If-Match'), null);
      assert.strictEqual(seen.legacy[0].headers.get('If-None-Match'), null);
    });

    it('so a UE session can save the same page many times', async () => {
      const { daSourcePost, env, seen } = await build({});
      const statuses = [];

      for (let i = 0; i < 4; i += 1) {
        const req = uePost(AT, `<body><main><div><p>edit ${i + 1}</p></div></main></body>`);
        // eslint-disable-next-line no-await-in-loop
        const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });
        statuses.push(res.status);
      }

      assert.deepStrictEqual(statuses, [201, 201, 201, 201]);
      assert.strictEqual(seen.legacy.length, 4);
    });
  });

  describe('the store lookup on a write', () => {
    // a legacy write is the case that can tell the two orderings apart: the store is reached
    // either way, so only the sequence says whether the write went out before it was placed
    it('happens before anything is sent to a store', async () => {
      const { seen } = await post({});

      assert.deepStrictEqual(seen.order, ['lookup', 'store']);
    });

    it('happens on a source-bus site too, which is what the refusal rests on', async () => {
      const { seen } = await post({ onSourceBus: true });

      assert.strictEqual(seen.lookups, 1);
    });
  });

  describe('when da-admin cannot be reached at all', () => {
    it('answers 503 rather than throwing', async () => {
      const { daSourcePost, env } = await build({});
      env.daadmin.fetch = async () => {
        throw new TypeError('fetch failed');
      };
      const req = uePost(AT);

      const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 503);
    });
  });

  describe('a non-html path', () => {
    // driven on a source-bus site, so the 415 has to come from the extension check rather than
    // from the refusal below it. on a legacy site either ordering would pass.
    it('is refused before anything is resolved', async () => {
      const { daSourcePost, env, seen } = await build({ onSourceBus: true });
      const req = uePost('https://main--site--org.ue.da.live/folder/data.json');

      const res = await daSourcePost({ req, env, daCtx: getDaCtx(req) });

      assert.strictEqual(res.status, 415);
      assert.strictEqual(seen.lookups, 0);
      assert.strictEqual(seen.bus.length + seen.legacy.length, 0);
    });
  });
});
