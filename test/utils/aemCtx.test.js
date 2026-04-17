/*
 * Copyright 2024 Adobe. All rights reserved.
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
import { getDaCtx } from '../../src/utils/daCtx.js';

describe('AEM context', () => {
  let getAemCtx;
  let getAEMHtml;
  let aemCtx;

  beforeEach(async () => {
    const mod = await esmock('../../src/utils/aemCtx.js');
    getAemCtx = mod.getAemCtx;
    getAEMHtml = mod.getAEMHtml;
  });

  describe('AEM context from environment', () => {
    const env = {
      UE_HOST: 'test-ue-host',
      UE_SERVICE: 'test-ue-service',
    };

    const daCtx = getDaCtx(reqs.content);

    beforeEach(() => {
      aemCtx = getAemCtx(env, daCtx);
    });

    it('should return correct preview hostname', () => {
      assert.strictEqual(aemCtx.previewHostname, 'main--site--org.aem.page');
    });

    it('should return correct preview URL', () => {
      assert.strictEqual(aemCtx.previewUrl, 'https://main--site--org.aem.page');
    });

    it('should return correct live hostname', () => {
      assert.strictEqual(aemCtx.liveHostname, 'main--site--org.aem.live');
    });

    it('should return correct live URL', () => {
      assert.strictEqual(aemCtx.liveUrl, 'https://main--site--org.aem.live');
    });

    it('should return correct UE hostname', () => {
      assert.strictEqual(aemCtx.ueHostname, 'test-ue-host');
    });

    it('should return correct UE service', () => {
      assert.strictEqual(aemCtx.ueService, 'test-ue-service');
    });
  });

  describe('getAEMHtml function', () => {
    const mockAemCtx = {
      previewUrl: 'https://main--site--org.aem.page',
    };

    beforeEach(async () => {
      // Mock global fetch
      global.fetch = async (url) => {
        if (url.includes('success')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<html>test content</html>',
          };
        }
        if (url.includes('unauthorized')) {
          return { ok: false, status: 401, text: async () => '' };
        }
        if (url.includes('forbidden')) {
          return { ok: false, status: 403, text: async () => '' };
        }
        return { ok: false, status: 404, text: async () => '' };
      };
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return HTML content and status 200 for successful request', async () => {
      const result = await getAEMHtml(mockAemCtx, '/success-path');
      assert.strictEqual(result.status, 200);
      assert.strictEqual(result.body, '<html>test content</html>');
    });

    it('should return undefined body and status for failed request', async () => {
      const result = await getAEMHtml(mockAemCtx, '/fail-path');
      assert.strictEqual(result.status, 404);
      assert.strictEqual(result.body, undefined);
    });

    it('should propagate 401 status for unauthorized request', async () => {
      const result = await getAEMHtml(mockAemCtx, '/unauthorized-path');
      assert.strictEqual(result.status, 401);
      assert.strictEqual(result.body, undefined);
    });

    it('should propagate 403 status for forbidden request', async () => {
      const result = await getAEMHtml(mockAemCtx, '/forbidden-path');
      assert.strictEqual(result.status, 403);
      assert.strictEqual(result.body, undefined);
    });
  });
});
