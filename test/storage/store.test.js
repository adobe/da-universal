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

const { default: getStore } = await import('../../src/storage/store.js');

const env = { DA_ADMIN: 'https://admin.da.live', AEM_API: 'https://api.aem.live' };
const ctxFor = (url) => getDaCtx(new Request(url, { headers: { Authorization: 'Bearer t' } }));

describe('getStore', () => {
  describe('the url a document has in the store', () => {
    it('builds the source-bus url from the normalized path, not the requested one', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/Media/Holiday.PNG'), true);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/org/sites/site/source/media/holiday.png');
    });

    it('builds a legacy url under DA_ADMIN from the lowercased source path', () => {
      const store = getStore(env, ctxFor('https://main--site--org.ue.da.live/Folder/Doc'), false);

      assert.strictEqual(store.url.toString(), 'https://admin.da.live/source/org/site/folder/doc.html');
    });

    // helix-api-service refuses a source url naming another org or site, so the request's own org
    // and site are the only base it can have
    it('builds the source-bus url from the request\'s own org and site', () => {
      const store = getStore(env, ctxFor('https://main--other--shared.ue.da.live/folder/doc'), true);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/shared/sites/other/source/folder/doc.html');
    });

    it('builds it on AEM_API, so stage moves it', () => {
      const bound = { ...env, AEM_API: 'https://api.stage.example' };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/folder/doc'), true);

      assert.strictEqual(store.url.toString(), 'https://api.stage.example/org/sites/site/source/folder/doc.html');
    });

    it('tolerates a trailing slash on AEM_API', () => {
      const bound = { ...env, AEM_API: 'https://api.aem.live/' };
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/folder/doc'), true);

      assert.strictEqual(store.url.toString(), 'https://api.aem.live/org/sites/site/source/folder/doc.html');
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
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), false);

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
      const store = getStore(bound, ctxFor('https://main--site--org.ue.da.live/doc'), true);

      await store.fetch(store.url, { method: 'GET' });

      delete globalThis.fetch;
      assert.strictEqual(seen.length, 1);
    });
  });
});
