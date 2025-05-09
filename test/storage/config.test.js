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

import assert from 'assert';

describe('Config Module', () => {
  let mockFetch;
  let mockEnv;
  let configModule;
  let originalFetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    mockFetch = async (url, opts) => {
      mockFetch.lastCall = { url: url.href, opts };
      return mockFetch.nextResponse;
    };
    // Initialize mock properties
    mockFetch.lastCall = null;
    mockFetch.nextResponse = null;
    
    // Replace global fetch
    globalThis.fetch = mockFetch;

    mockEnv = {
      DA_ADMIN: 'https://admin.da.live',
      daadmin: {
        fetch: mockFetch
      }
    };

    // Import module after mocking
    configModule = await import('../../src/storage/config.js');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockDaCtx = {
    org: 'test-org',
    site: 'test-site',
    authToken: 'test-token',
  };

  const setMockResponse = (data) => {
    mockFetch.nextResponse = {
      ok: true,
      json: async () => ({ data })
    };
  };

  describe('getSiteConfig', () => {
    it('should fetch site config successfully', async () => {
      const mockData = [
        { key: 'editor.ue.template', value: '/content=/templates' },
        { key: 'editor.ue.template', value: '/components=/blocks' }
      ];
      setMockResponse(mockData);

      const result = await configModule.getSiteConfig(mockEnv, mockDaCtx);

      const expectedCall = {
        url: 'https://admin.da.live/config/test-org/test-site',
        opts: {
          headers: new Headers({
            'authorization': 'test-token'
          })
        }
      };
      assert.strictEqual(mockFetch.lastCall.url, expectedCall.url);
      assert.deepStrictEqual(
        Object.fromEntries(mockFetch.lastCall.opts.headers.entries()),
        Object.fromEntries(expectedCall.opts.headers.entries())
      );
      assert.deepStrictEqual(result, mockData);
    });

    it('should return null when fetch fails', async () => {
      mockFetch.nextResponse = { ok: false };

      const result = await configModule.getSiteConfig(mockEnv, mockDaCtx);

      assert.strictEqual(result, null);
    });
  });

  describe('getOrgConfig', () => {
    it('should fetch org config successfully', async () => {
      const mockData = [
        { key: 'editor.ue.template', value: '/content=/templates' },
        { key: 'editor.ue.template', value: '/components=/blocks' },
        { key: 'editor.ue.template', value: '/assets=/media' }
      ];
      setMockResponse(mockData);

      const result = await configModule.getOrgConfig(mockEnv, mockDaCtx);

      const expectedCall = {
        url: 'https://admin.da.live/config/test-org',
        opts: {
          headers: new Headers({
            'authorization': 'test-token'
          })
        }
      };
      assert.strictEqual(mockFetch.lastCall.url, expectedCall.url);
      assert.deepStrictEqual(
        Object.fromEntries(mockFetch.lastCall.opts.headers.entries()),
        Object.fromEntries(expectedCall.opts.headers.entries())
      );
      assert.deepStrictEqual(result, mockData);
    });

    it('should return null when fetch fails', async () => {
      mockFetch.nextResponse = { ok: false };

      const result = await configModule.getOrgConfig(mockEnv, mockDaCtx);

      assert.strictEqual(result, null);
    });
  });

  describe('Authorization handling', () => {
    it('should not include authorization header when authToken is not provided', async () => {
      const ctxWithoutToken = { org: 'test-org', site: 'test-site' };
      setMockResponse([
        { key: 'editor.ue.template', value: '/content=/templates' }
      ]);

      await configModule.getSiteConfig(mockEnv, ctxWithoutToken);

      const expectedCall = {
        url: 'https://admin.da.live/config/test-org/test-site',
        opts: {
          headers: new Headers()
        }
      };
      assert.strictEqual(mockFetch.lastCall.url, expectedCall.url);
      assert.deepStrictEqual(
        Object.fromEntries(mockFetch.lastCall.opts.headers.entries()),
        Object.fromEntries(expectedCall.opts.headers.entries())
      );
    });
  });
});
