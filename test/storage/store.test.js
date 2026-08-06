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
import { getDaCtx } from '../../src/utils/daCtx.js';
import { LEGACY, SOURCE_BUS } from '../../src/storage/content-source.js';

const { default: getStore } = await import('../../src/storage/store.js');

const env = { DA_ADMIN: 'https://admin.da.live' };
const ctxFor = (url) => getDaCtx(new Request(url, { headers: { Authorization: 'Bearer t' } }));
const legacy = { kind: LEGACY };
const bus = { kind: SOURCE_BUS, base: 'https://api.aem.live/org/sites/site/source' };

describe('getStore', () => {
  describe('the url it reads and writes', () => {
    it('builds the source-bus url from the normalized path, not the requested one', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/Media/Holiday.PNG'), bus);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/org/sites/site/source/media/holiday.png');
    });

    it('builds a legacy url under DA_ADMIN from the lowercased source path', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/Folder/Doc'), legacy);

      assert.strictEqual(store.url.toString(), 'https://admin.da.live/source/org/site/folder/doc.html');
    });

    it('builds a source-bus url on the base the config named', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/folder/doc'), bus);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/org/sites/site/source/folder/doc.html');
    });

    it('takes the base verbatim, so a config naming another org is followed', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), {
        kind: SOURCE_BUS,
        base: 'https://api.aem.live/shared/sites/library/source',
      });

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/shared/sites/library/source/doc.html');
    });
  });

  describe('how it reaches the store', () => {
    it('sends a legacy request over the daadmin service binding', async () => {
      const seen = [];
      const record = async (input) => {
        seen.push(input);
        return new Response('');
      };
      const bound = { ...env, daadmin: { fetch: record } };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), legacy);

      await store.fetch(store.url, { method: 'GET' });

      assert.strictEqual(seen.length, 1);
    });

    it('sends a source-bus request over the public network', async () => {
      const seen = [];
      globalThis.fetch = async (input) => {
        seen.push(input);
        return new Response('');
      };
      const bound = { ...env, daadmin: { fetch: async () => assert.fail('used the binding') } };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), bus);

      await store.fetch(store.url, { method: 'GET' });

      delete globalThis.fetch;
      assert.strictEqual(seen.length, 1);
    });
  });

  describe('the write body each store parses', () => {
    // both stores are captured with the same recorder, so a test names the store it expects by
    // passing its kind rather than by picking a transport
    const written = async (kind, html = '<body></body>') => {
      let sent;
      const capture = async (input, init) => {
        sent = input instanceof Request ? input : new Request(input, init);
        return new Response('');
      };
      globalThis.fetch = capture;
      const bound = { ...env, daadmin: { fetch: capture } };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), kind);

      await store.write(html, 'Bearer t');

      delete globalThis.fetch;
      return sent;
    };

    // helix-api-service parses no form data anywhere: getValidPayload reads the raw buffer and
    // types it from the path extension. Sending da-admin's multipart envelope stores the
    // boundary lines as the document text and answers 201, so this is not a cosmetic difference.
    it('sends the source bus the document as the raw body', async () => {
      const sent = await written(bus, '<body><main><p>hi</p></main></body>');

      assert.strictEqual(await sent.text(), '<body><main><p>hi</p></main></body>');
    });

    it('types the source-bus write as text/html', async () => {
      const sent = await written(bus);

      assert.strictEqual(sent.headers.get('Content-Type'), 'text/html');
    });

    it('sends da-admin the document as a data form part', async () => {
      const sent = await written(legacy, '<body><main><p>hi</p></main></body>');

      const form = await sent.formData();

      assert.strictEqual(await form.get('data').text(), '<body><main><p>hi</p></main></body>');
      assert.strictEqual(form.get('data').type, 'text/html');
    });

    it('never wraps a source-bus write in a multipart envelope', async () => {
      const body = await (await written(bus)).text();

      assert.ok(!body.includes('Content-Disposition'), `envelope leaked into the body: ${body}`);
      assert.ok(!body.includes('form-data'), `envelope leaked into the body: ${body}`);
    });

    it('posts to the url the store resolved', async () => {
      const b = await written(bus);
      const l = await written(legacy);

      assert.strictEqual(b.method, 'POST');
      assert.strictEqual(b.url, 'https://api.aem.live/org/sites/site/source/doc.html');
      assert.strictEqual(l.method, 'POST');
      assert.strictEqual(l.url, 'https://admin.da.live/source/org/site/doc.html');
    });

    it('authorizes both writes with the caller token', async () => {
      assert.strictEqual((await written(bus)).headers.get('Authorization'), 'Bearer t');
      assert.strictEqual((await written(legacy)).headers.get('Authorization'), 'Bearer t');
    });

    // neither store's writes are conditional. Only the source bus sets an etag on a read, and
    // nothing carries it into the save: a marker on the connection uri would be minted once per
    // page load while UE saves many times against it, so no version pin could stay fresh.
    it('sends no precondition to either store', async () => {
      const sent = [await written(bus), await written(legacy)];

      sent.forEach(({ headers }) => {
        assert.strictEqual(headers.get('If-Match'), null);
        assert.strictEqual(headers.get('If-None-Match'), null);
        assert.strictEqual(headers.get('If-Unmodified-Since'), null);
      });
    });
  });
});
