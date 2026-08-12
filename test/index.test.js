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

// everything but the POST handler, so a write can be driven through the real route
const READ_HANDLER_MOCKS = {
  '../src/handlers/get.js': {
    default: async () => new Response('get-handled', { status: 200 }),
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
};

const HANDLER_MOCKS = {
  ...READ_HANDLER_MOCKS,
  '../src/handlers/post.js': {
    default: async () => new Response('post-handled', { status: 200 }),
  },
};

const throwingWorker = async (handler) => (await esmock('../src/index.js', {
  ...HANDLER_MOCKS,
  [handler]: {
    default: async () => {
      throw new TypeError('fetch failed');
    },
  },
})).default;

describe('worker fetch handler', () => {
  describe('when a handler throws', () => {
    // a throw used to reject worker.fetch, and the runtime answered a bare 500 with no CORS on it,
    // which the editor cannot read at all
    it('answers 500 rather than rejecting', async () => {
      const worker = await throwingWorker('../src/handlers/get.js');
      const req = new Request('https://main--site--org.ue.da.live/some/path');

      const res = await worker.fetch(req, {});

      assert.ok(res instanceof Response, 'must return a Response');
      assert.strictEqual(res.status, 500);
    });

    // the assertion that pins the catch inside the switch: wrapped around withCorsHeaders instead,
    // the status would still be 500 and the headers would be gone
    it('keeps the CORS headers on it', async () => {
      const worker = await throwingWorker('../src/handlers/get.js');
      const req = new Request('https://main--site--org.ue.da.live/some/path', {
        headers: { Origin: 'https://da.live' },
      });

      const res = await worker.fetch(req, {});

      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://da.live');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), 'true');
    });

    it('answers the same on a POST', async () => {
      const worker = await throwingWorker('../src/handlers/post.js');
      const req = new Request('https://main--site--org.ue.da.live/some/path', { method: 'POST' });

      const res = await worker.fetch(req, {});

      assert.strictEqual(res.status, 500);
    });

    it('sends no body, so nothing internal reaches the browser', async () => {
      const worker = await throwingWorker('../src/handlers/get.js');
      const req = new Request('https://main--site--org.ue.da.live/some/path');

      const res = await worker.fetch(req, {});

      assert.strictEqual(await res.text(), '');
    });
  });

  describe('/.rum/ routing', () => {
    let worker;

    beforeEach(async () => {
      worker = (await esmock('../src/index.js', HANDLER_MOCKS)).default;
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

  describe('CORS headers', () => {
    let worker;

    beforeEach(async () => {
      worker = (await esmock('../src/index.js', HANDLER_MOCKS)).default;
    });

    it('mirrors origin and sets credentials for a trusted origin', async () => {
      const req = new Request('https://main--site--org.ue.da.live/some/path', {
        headers: { Origin: 'https://da.live' },
      });
      const res = await worker.fetch(req, {});

      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://da.live');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), 'true');
    });

    it('returns wildcard and no credentials for an untrusted origin', async () => {
      const req = new Request('https://main--site--org.ue.da.live/some/path', {
        headers: { Origin: 'https://evil.example.com' },
      });
      const res = await worker.fetch(req, {});

      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), null);
    });

    it('returns wildcard and no credentials when no Origin header is present', async () => {
      const req = new Request('https://main--site--org.ue.da.live/some/path');
      const res = await worker.fetch(req, {});

      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), null);
    });

    it('sets Allow-Methods and Allow-Headers on trusted origin responses', async () => {
      const req = new Request('https://main--site--org.ue.da.live/some/path', {
        headers: { Origin: 'https://da.live' },
      });
      const res = await worker.fetch(req, {});

      assert.strictEqual(res.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, POST, OPTIONS');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type, x-site-token');
    });

    it('sets Allow-Methods and Allow-Headers on untrusted origin responses', async () => {
      const req = new Request('https://main--site--org.ue.da.live/some/path', {
        headers: { Origin: 'https://untrusted.example.com' },
      });
      const res = await worker.fetch(req, {});

      assert.strictEqual(res.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, POST, OPTIONS');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type, x-site-token');
    });
  });

  // withCorsHeaders rebuilds every response from the handler, so a header the route set only
  // reaches the caller if that rebuild carries it
  describe('a refused write on a source-bus site', () => {
    const busWorker = async () => (await esmock('../src/index.js', READ_HANDLER_MOCKS, {
      '../src/storage/source-bus.js': { default: async () => true },
      // a write reads both lookups, and this env names no config service
      '../src/storage/site.js': { default: async () => ({ exists: true, head: undefined }) },
    })).default;

    const uePost = (origin) => {
      const body = new FormData();
      body.set('data', new File(['<body><main><p>x</p></main></body>'], 'c.html', { type: 'text/html' }));
      return new Request('https://main--site--org.ue.da.live/folder/content', {
        method: 'POST',
        body,
        headers: { Authorization: 'Bearer t', Origin: origin },
      });
    };

    it('keeps the Allow header alongside the CORS headers', async () => {
      const worker = await busWorker();

      const res = await worker.fetch(uePost('https://da.live'), {});

      assert.strictEqual(res.status, 405);
      assert.strictEqual(res.headers.get('Allow'), 'GET, HEAD, OPTIONS');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://da.live');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Credentials'), 'true');
    });

    it('keeps it for an untrusted origin too', async () => {
      const worker = await busWorker();

      const res = await worker.fetch(uePost('https://evil.example.com'), {});

      assert.strictEqual(res.headers.get('Allow'), 'GET, HEAD, OPTIONS');
      assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
    });
  });
});
