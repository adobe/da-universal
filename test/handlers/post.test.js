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

const { getDaCtx } = await import('../../src/utils/daCtx.js');

describe('POST handler', () => {
  let postHandler;
  let writes;

  beforeEach(async () => {
    writes = 0;
    postHandler = (await esmock('../../src/handlers/post.js', {
      '../../src/routes/da-admin.js': {
        daSourcePost: async () => {
          writes += 1;
          return new Response('', { status: 201 });
        },
      },
    })).default;
  });

  // the store url is built from org and site, so a hostname naming neither would send the author
  // token to https://admin.da.live/source/undefined/undefined/...
  it('answers 404 when the hostname named no site, and writes nothing', async () => {
    const req = new Request('https://xyz.ue.da.live/content', { method: 'POST' });

    const res = await postHandler({ req, env: {}, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(writes, 0);
  });

  it('forwards a write on a site it can name', async () => {
    const req = new Request('https://main--site--org.ue.da.live/folder/content', { method: 'POST' });

    const res = await postHandler({ req, env: {}, daCtx: getDaCtx(req) });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(writes, 1);
  });
});
