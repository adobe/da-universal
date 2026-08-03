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

const { default: getStore, sourceBusPath } = await import('../../src/storage/store.js');

const env = { DA_ADMIN: 'https://admin.da.live' };
const ctxFor = (url) => getDaCtx(new Request(url, { headers: { Authorization: 'Bearer t' } }));
const legacy = { kind: LEGACY };
const bus = { kind: SOURCE_BUS, base: 'https://api.aem.live/org/sites/site/source' };

describe('sourceBusPath', () => {
  // helix-api-service sanitizes only the basename: computePaths pops the filename, runs
  // sanitizeName on it and recombines the directory segments untouched. Verified live on
  // 2026-08-03 by uploading /Media/CaseProbe.PNG and fetching six spellings back: only
  // /Media/CaseProbe.PNG and /Media/caseprobe.PNG answered 200.
  const cases = [
    ['/folder/content', '/folder/content.html', 'appends .html when the request had no extension'],
    ['/', '/index.html', 'names the root document index.html'],
    ['/sub-folder/', '/sub-folder/index.html', 'names a directory index'],
    ['/Media/Holiday.PNG', '/Media/holiday.PNG', 'lowercases the stem, keeps directory and extension case'],
    ['/A/B/c.JSON', '/A/B/c.JSON', 'keeps every directory segment as requested'],
    ['/Sub-Folder/', '/Sub-Folder/index.html', 'keeps directory case on a directory index'],
    ['/folder/Content', '/folder/content.html', 'lowercases a stem that had no extension'],
    ['/folder/content.plain.html', '/folder/content.plain.html', 'treats only the last dot as the extension'],
  ];

  cases.forEach(([path, expected, what]) => {
    it(what, () => {
      assert.strictEqual(sourceBusPath(ctxFor(`https://main--site--org.ue.da.live${path}`)), expected);
    });
  });

  it('differs from daCtx.sourcePath, which da-admin wants lowercased throughout', () => {
    const daCtx = ctxFor('https://main--site--org.ue.da.live/Media/Holiday.PNG');

    assert.strictEqual(daCtx.sourcePath, '/media/holiday.png');
    assert.strictEqual(sourceBusPath(daCtx), '/Media/holiday.PNG');
  });
});

describe('getStore', () => {
  describe('the url it reads and writes', () => {
    it('builds a legacy url under DA_ADMIN from the lowercased source path', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/Folder/Doc'), legacy);

      assert.strictEqual(store.url.toString(), 'https://admin.da.live/source/org/site/folder/doc.html');
    });

    it('builds a source-bus url on the base the config named', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/folder/doc'), bus);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/org/sites/site/source/folder/doc.html');
    });

    it('keeps the case the source bus stored a file under', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/Media/Holiday.PNG'), bus);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/org/sites/site/source/Media/holiday.PNG');
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
      const bound = { ...env, daadmin: { fetch: async (i) => { seen.push(i); return new Response(''); } } };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), legacy);

      await store.fetch(store.url, { method: 'GET' });

      assert.strictEqual(seen.length, 1);
    });

    it('sends a source-bus request over the public network', async () => {
      const seen = [];
      globalThis.fetch = async (i) => { seen.push(i); return new Response(''); };
      const bound = { ...env, daadmin: { fetch: async () => assert.fail('used the binding') } };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), bus);

      await store.fetch(store.url, { method: 'GET' });

      delete globalThis.fetch;
      assert.strictEqual(seen.length, 1);
    });
  });

  describe('the write body each store parses', () => {
    // helix-api-service parses no form data anywhere: getValidPayload reads the raw buffer and
    // types it from the path extension. Sending da-admin's multipart envelope stores the
    // boundary lines as the document text and answers 201, so this is not a cosmetic difference.
    it('sends the source bus the document as the raw body', async () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), bus);

      const init = store.writeInit('<body><main><p>hi</p></main></body>', 'Bearer t');
      const body = await new Request('https://example.test', { method: 'POST', ...init }).text();

      assert.strictEqual(body, '<body><main><p>hi</p></main></body>');
    });

    it('types the source-bus write as text/html', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), bus);

      const init = store.writeInit('<body></body>', 'Bearer t');

      assert.strictEqual(new Headers(init.headers).get('Content-Type'), 'text/html');
    });

    it('sends da-admin the document as a data form part', async () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), legacy);

      const init = store.writeInit('<body><main><p>hi</p></main></body>', 'Bearer t');
      const form = await new Request('https://example.test', { method: 'POST', ...init }).formData();

      assert.strictEqual(await form.get('data').text(), '<body><main><p>hi</p></main></body>');
      assert.strictEqual(form.get('data').type, 'text/html');
    });

    it('never wraps a source-bus write in a multipart envelope', async () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), bus);

      const init = store.writeInit('<body></body>', 'Bearer t');
      const body = await new Request('https://example.test', { method: 'POST', ...init }).text();

      assert.ok(!body.includes('Content-Disposition'), `envelope leaked into the body: ${body}`);
      assert.ok(!body.includes('form-data'), `envelope leaked into the body: ${body}`);
    });

    it('authorizes both writes with the caller token', () => {
      const b = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), bus);
      const l = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), legacy);

      assert.strictEqual(new Headers(b.writeInit('<body></body>', 'Bearer t').headers).get('Authorization'), 'Bearer t');
      assert.strictEqual(new Headers(l.writeInit('<body></body>', 'Bearer t').headers).get('Authorization'), 'Bearer t');
    });

    it('adds a precondition to the source-bus write when one is given', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), bus);

      const init = store.writeInit('<body></body>', 'Bearer t', { 'If-Match': '"abc"' });

      assert.strictEqual(new Headers(init.headers).get('If-Match'), '"abc"');
    });

    it('sends no precondition when none is given', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/doc'), legacy);

      const init = store.writeInit('<body></body>', 'Bearer t');

      assert.strictEqual(new Headers(init.headers).get('If-Match'), null);
      assert.strictEqual(new Headers(init.headers).get('If-None-Match'), null);
    });
  });
});
