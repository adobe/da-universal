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
      liveUrl: 'https://main--site--org.aem.live',
    };

    beforeEach(async () => {
      // Mock global fetch
      global.fetch = async (url) => ({
        ok: url.includes('success'),
        text: async () => '<html>test content</html>',
      });
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return HTML content for successful request', async () => {
      const html = await getAEMHtml(mockAemCtx, '/success-path');
      assert.strictEqual(html, '<html>test content</html>');
    });

    it('should return undefined for failed request', async () => {
      const html = await getAEMHtml(mockAemCtx, '/fail-path');
      assert.strictEqual(html, undefined);
    });
  });
});
