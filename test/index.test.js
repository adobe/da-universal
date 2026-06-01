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

describe('worker fetch handler', () => {
  describe('/.rum/ routing', () => {
    let worker;

    beforeEach(async () => {
      worker = (await esmock('../src/index.js', {
        '../src/handlers/get.js': {
          default: async () => new Response('get-handled', { status: 200 }),
        },
        '../src/handlers/post.js': {
          default: async () => new Response('post-handled', { status: 200 }),
        },
        '../src/handlers/options.js': {
          default: async () => new Response('options-handled', { status: 204 }),
        },
        '../src/handlers/head.js': {
          default: async () => new Response(null, { status: 200 }),
        },
        '../src/handlers/unknown.js': {
          default: () => new Response('unknown', { status: 405 }),
        },
      })).default;
    });

    it('silently returns 200 for GET /.rum/100', async () => {
      const req = new Request('https://main--site--org.ue.da.live/.rum/100');
      const res = await worker.fetch(req, {});

      assert.ok(res instanceof Response, 'must return a Response');
      assert.strictEqual(res.status, 200);
    });

    it('silently returns 200 for POST /.rum/100 with JSON body', async () => {
      const req = new Request('https://main--site--org.ue.da.live/.rum/100', {
        method: 'POST',
        body: JSON.stringify({ cwv: { LCP: 1000 } }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await worker.fetch(req, {});

      assert.ok(res instanceof Response, 'must return a Response');
      assert.strictEqual(res.status, 200);
    });

    it('silently returns 200 for /.rum/ on any hostname', async () => {
      const req = new Request('https://xyz.ue.da.live/.rum/100');
      const res = await worker.fetch(req, {});

      assert.ok(res instanceof Response, 'must return a Response');
      assert.strictEqual(res.status, 200);
    });
  });
});
