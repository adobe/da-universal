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
      UE_SERVICE: 'test-ue-service'
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
      liveUrl: 'https://main--site--org.aem.live'
    };

    beforeEach(async () => {
      // Mock global fetch
      global.fetch = async (url) => ({
        ok: url.includes('success'),
        text: async () => '<html>test content</html>'
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
