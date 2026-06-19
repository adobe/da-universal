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
