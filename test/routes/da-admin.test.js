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
import reqs from '../mocks/req.js';

const { getDaCtx } = await import('../../src/utils/daCtx.js');
const { daSourceHead } = await import('../../src/routes/da-admin.js');

describe('daSourceHead', () => {
  describe('when no authToken is present', () => {
    it('returns 401 with no body', async () => {
      const daCtx = getDaCtx(reqs.content); // no Authorization header → no authToken

      const res = await daSourceHead({ env: {}, daCtx });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(await res.text(), '');
    });

    it('returns no Content-Type in the 401 response', async () => {
      const daCtx = getDaCtx(reqs.content);

      const res = await daSourceHead({ env: {}, daCtx });

      assert.strictEqual(res.headers.get('Content-Type'), null);
    });
  });
});

describe('daSourceGet', () => {
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    daadmin: { fetch: async () => new Response('<body>stored</body>', { status: 200 }) },
  };

  const authedReq = (url) => new Request(url, { headers: { Authorization: 'Bearer t' } });

  // record which composition / instrumentation calls happen and with what
  let calls;

  const mockDaSourceGet = async () => {
    calls = { compose: [], ue: 0, quickEdit: 0 };
    return (await esmock('../../src/routes/da-admin.js', {
      '../../src/utils/aemCtx.js': {
        getAemCtx: () => ({}),
        getAEMHtml: async () => '<meta name="from" content="aem" />',
      },
      '../../src/render/compose.js': {
        composeHtml: async (daCtx, aemCtx, bodyHtml) => {
          calls.compose.push(bodyHtml);
          return { tree: true };
        },
        serializeHtml: () => '<html>composed</html>',
      },
      '../../src/ue/ue.js': {
        applyUEInstrumentation: async () => { calls.ue += 1; },
      },
      '../../src/utils/quick-edit.js': {
        applyQuickEditToDocument: () => {
          calls.quickEdit += 1;
          return '/scripts/scripts.js';
        },
        buildQuickEditCookie: (p) => `da-quick-edit=${encodeURIComponent(p)}; Path=/`,
      },
      '../../src/storage/config.js': {
        getSiteConfig: async () => { throw new Error('no config'); },
      },
    })).daSourceGet;
  };

  it('applies UE instrumentation by default (ue.da.live)', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.ue, 1);
    assert.strictEqual(calls.quickEdit, 0);
    assert.strictEqual(res.headers.get('Set-Cookie'), null);
  });

  it('returns the composed page as-is for a preview host', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://main--site--org.preview.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.ue, 0);
    assert.strictEqual(calls.quickEdit, 0);
    assert.strictEqual(await res.text(), '<html>composed</html>');
  });

  it('returns the composed page as-is on localhost (no UE)', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://localhost:4712/org/site/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.ue, 0);
    assert.strictEqual(calls.quickEdit, 0);
  });

  it('applies quick-edit injection and sets the cookie when quick-edit is requested', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.quickEdit, 1);
    assert.strictEqual(calls.ue, 0);
    assert.ok(res.headers.get('Set-Cookie')?.includes('da-quick-edit=%2Fscripts%2Fscripts.js'));
  });

  it('composes a template when the stored content is missing', async () => {
    const daSourceGet = await mockDaSourceGet();
    const missingEnv = {
      ...env,
      daadmin: { fetch: async () => new Response('not found', { status: 404 }) },
    };
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env: missingEnv, daCtx });

    assert.strictEqual(res.status, 200);
    // composeHtml still ran (once), but with the template body, not stored content
    assert.strictEqual(calls.compose.length, 1);
    assert.ok(!calls.compose[0].includes('stored'));
  });
});
