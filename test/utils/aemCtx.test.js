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
  let fixUrlsWhenLocalDev;
  let aemCtx;

  beforeEach(async () => {
    const mod = await esmock('../../src/utils/aemCtx.js');
    getAemCtx = mod.getAemCtx;
    getAEMHtml = mod.getAEMHtml;
    fixUrlsWhenLocalDev = mod.fixUrlsWhenLocalDev;
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
      global.fetch = async (url) => new Response(
        '<html>test content</html>',
        { status: url.includes('success') ? 200 : 404 },
      );
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return HTML content for successful request', async () => {
      const { html } = await getAEMHtml(mockAemCtx, '/success-path');
      assert.strictEqual(html, '<html>test content</html>');
    });

    it('reports the status alongside the html', async () => {
      const { status } = await getAEMHtml(mockAemCtx, '/success-path');
      assert.strictEqual(status, 200);
    });

    it('should return undefined for failed request', async () => {
      const { html } = await getAEMHtml(mockAemCtx, '/fail-path');
      assert.strictEqual(html, undefined);
    });

    // a 404 says the branch has no head.html; a 429 or a 503 says the caller should not read
    // that as an answer about the branch at all
    it('reports which status a refusal carried', async () => {
      global.fetch = async () => new Response('slow down', { status: 429 });
      const { status } = await getAEMHtml(mockAemCtx, '/any-path');
      assert.strictEqual(status, 429);
    });

    it('throws an UpstreamError naming the path when the origin does not answer', async () => {
      global.fetch = async () => {
        throw new TypeError('Network connection lost');
      };
      await assert.rejects(
        () => getAEMHtml(mockAemCtx, '/head.html'),
        (e) => e.name === 'UpstreamError'
          && e.error === '/head.html failed: TypeError: Network connection lost',
      );
    });

    it('throws when the body cannot be read', async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new TypeError('Network connection lost');
        },
      });
      await assert.rejects(
        () => getAEMHtml(mockAemCtx, '/head.html'),
        (e) => e.name === 'UpstreamError',
      );
    });
  });

  describe('fixUrlsWhenLocalDev', () => {
    it('returns head.html unchanged for hosted UE paths', () => {
      const head = '<script src="/scripts/scripts.js"></script>';
      const daCtx = getDaCtx(reqs.content);
      assert.strictEqual(fixUrlsWhenLocalDev(head, daCtx), head);
    });

    it('prefixes script and link URLs for localhost org/site paths', () => {
      const head = '<script src="/scripts/scripts.js"></script><link href="/styles/styles.css" rel="stylesheet">';
      const daCtx = getDaCtx(reqs.localhost);
      const out = fixUrlsWhenLocalDev(head, daCtx);
      assert.ok(out.includes('src="/org/site/scripts/scripts.js"'));
      assert.ok(out.includes('href="/org/site/styles/styles.css"'));
    });
  });
});
