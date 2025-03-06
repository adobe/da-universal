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
import { describe, it, before, beforeEach } from 'mocha';
import esmock from 'esmock';
import { getAemCtx } from '../../src/utils/aemCtx.js';

describe('UE scaffold', () => {
  let scaffold;

  before(async () => {
    scaffold = await esmock('../../src/ue/scaffold.js');
  });

  describe('getHtmlDoc', () => {
    it('returns an empty starter document structure', () => {
      const doc = scaffold.getHtmlDoc();
      assert.strictEqual(doc.type, 'root');
      assert.strictEqual(doc.children.length, 2);
      assert.strictEqual(doc.children[0].type, 'doctype');
      assert.strictEqual(doc.children[1].tagName, 'html');
      assert.strictEqual(doc.children[1].children.length, 2);
      assert.strictEqual(doc.children[1].children[0].tagName, 'head');
      assert.strictEqual(doc.children[1].children[1].tagName, 'body');
    });
  });

  describe('getUEHtmlHeadEntries', () => {
    let daCtx;
    let aemCtx;

    beforeEach(() => {
      daCtx = {
        org: 'org',
        site: 'site',
        ref: 'ref',
        path: '/some-path',
        isLocal: false,
      };
      const env = {
        UE_HOST: 'test-ue-host',
        UE_SERVICE: 'test-ue-service',
      };
      aemCtx = getAemCtx(env, daCtx);
    });

    it('generates correct head entries', () => {
      const entries = scaffold.getUEHtmlHeadEntries(daCtx, aemCtx);

      // Check meta tags
      const metaTags = entries.filter((entry) => entry.tagName === 'meta');
      assert.strictEqual(metaTags.length, 2);

      // Check system:ab meta tag
      const ueSystemTag = metaTags.find(
        (tag) => tag.properties.name === 'urn:adobe:aue:system:ab'
      );
      assert.ok(ueSystemTag);
      assert.strictEqual(
        ueSystemTag.properties.content,
        'da:https://ref--site--org.test-ue-host/some-path'
      );

      // Check service meta tag
      const serviceTag = metaTags.find(
        (tag) => tag.properties.name === 'urn:adobe:aue:config:service'
      );
      assert.ok(serviceTag);
      assert.strictEqual(serviceTag.properties.content, 'test-ue-service');

      // Check script tags
      const scriptTags = entries.filter((entry) => entry.tagName === 'script');
      assert.strictEqual(scriptTags.length, 4);

      // Check CORS script
      const corsScript = scriptTags.find(
        (tag) =>
          tag.properties.src ===
          'https://universal-editor-service.adobe.io/cors.js'
      );
      assert.ok(corsScript);

      // Check component definition script
      const componentDefScript = scriptTags.find(
        (tag) =>
          tag.properties.type === 'application/vnd.adobe.aue.component+json'
      );
      assert.ok(componentDefScript);
      assert.strictEqual(
        componentDefScript.properties.src,
        '/component-definition.json'
      );

      // Check component models script
      const componentModelsScript = scriptTags.find(
        (tag) => tag.properties.type === 'application/vnd.adobe.aue.model+json'
      );
      assert.ok(componentModelsScript);
      assert.strictEqual(
        componentModelsScript.properties.src,
        '/component-models.json'
      );

      // Check component filters script
      const componentFiltersScript = scriptTags.find(
        (tag) => tag.properties.type === 'application/vnd.adobe.aue.filter+json'
      );
      assert.ok(componentFiltersScript);
      assert.strictEqual(
        componentFiltersScript.properties.src,
        '/component-filters.json'
      );
    });

    it('generates correct head entries for local environment', () => {
      daCtx.isLocal = true;
      daCtx.hostname = 'localhost';
      
      const entries = scaffold.getUEHtmlHeadEntries(daCtx, aemCtx);

      // Check meta tags
      const metaTags = entries.filter((entry) => entry.tagName === 'meta');
      assert.strictEqual(metaTags.length, 2);

      // Check system:ab meta tag
      const ueSystemTag = metaTags.find(
        (tag) => tag.properties.name === 'urn:adobe:aue:system:ab'
      );
      assert.ok(ueSystemTag);
      assert.strictEqual(
        ueSystemTag.properties.content,
        'da:https://test-ue-host/org/site/some-path'
      );

      // Check service meta tag
      const serviceTag = metaTags.find(
        (tag) => tag.properties.name === 'urn:adobe:aue:config:service'
      );
      assert.ok(serviceTag);
      assert.strictEqual(serviceTag.properties.content, 'test-ue-service');

      const scriptTags = entries.filter((entry) => entry.tagName === 'script');

      // Check component definition script
      const componentDefScript = scriptTags.find(
        (tag) =>
          tag.properties.type === 'application/vnd.adobe.aue.component+json'
      );
      assert.ok(componentDefScript);
      assert.strictEqual(
        componentDefScript.properties.src,
        '/org/site/component-definition.json'
      );

      // Check component models script
      const componentModelsScript = scriptTags.find(
        (tag) => tag.properties.type === 'application/vnd.adobe.aue.model+json'
      );
      assert.ok(componentModelsScript);
      assert.strictEqual(
        componentModelsScript.properties.src,
        '/org/site/component-models.json'
      );

      // Check component filters script
      const componentFiltersScript = scriptTags.find(
        (tag) => tag.properties.type === 'application/vnd.adobe.aue.filter+json'
      );
      assert.ok(componentFiltersScript);
      assert.strictEqual(
        componentFiltersScript.properties.src,
        '/org/site/component-filters.json'
      );
    });
  });

  describe('getUEConfig', () => {
    let fetchMock;
    let aemCtx;

    beforeEach(() => {
      aemCtx = {
        liveUrl: 'https://main--site--org.aem.live',
      };

      // Mock fetch
      fetchMock = async (url) => {
        const mockData = {
          'https://main--site--org.aem.live/component-definition.json': {
            components: ['def1', 'def2'],
          },
          'https://main--site--org.aem.live/component-models.json': {
            models: ['model1', 'model2'],
          },
          'https://main--site--org.aem.live/component-filters.json': {
            filters: ['filter1', 'filter2'],
          },
        };

        return {
          json: async () => mockData[url],
        };
      };

      // Replace global fetch with mock
      global.fetch = fetchMock;
    });

    it('fetches and combines all UE configuration files', async () => {
      const config = await scaffold.getUEConfig(aemCtx);

      assert.deepStrictEqual(config, {
        'component-definition': { components: ['def1', 'def2'] },
        'component-model': { models: ['model1', 'model2'] },
        'component-filter': { filters: ['filter1', 'filter2'] },
      });
    });

    it('handles fetch errors gracefully', async () => {
      // Mock fetch to throw error
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const config = await scaffold.getUEConfig(aemCtx);

      assert.deepStrictEqual(config, {
        'component-definition': undefined,
        'component-model': undefined,
        'component-filter': undefined,
      });
    });

    it('handles JSON parsing errors gracefully', async () => {
      // Mock fetch to return invalid JSON
      global.fetch = async () => ({
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const config = await scaffold.getUEConfig(aemCtx);

      assert.deepStrictEqual(config, {
        'component-definition': undefined,
        'component-model': undefined,
        'component-filter': undefined,
      });
    });
  });
});
