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

describe('DA context', () => {
  let getDaCtx;
  let daCtx;

  beforeEach(async () => {
    getDaCtx = (await esmock('../../src/utils/daCtx.js')).getDaCtx;
  });

  describe('Content URL context from localhost', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.localhost);
    });

    it('should return an org', () => {
      assert.strictEqual(daCtx.org, 'org');
    });

    it('should return a site', () => {
      assert.strictEqual(daCtx.site, 'site');
    });

    it('should return a ref', () => {
      assert.strictEqual(daCtx.ref, 'main');
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.sourcePath, '/folder/content.html');
      assert.strictEqual(daCtx.aemPathname, '/folder/content');
    });

    it('should return isLocal as true', () => {
      assert.ok(daCtx.isLocal);
    });
  });

  describe('Content URL context', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.content);
    });

    it('should return an org', () => {
      assert.strictEqual(daCtx.org, 'org');
    });

    it('should return a site', () => {
      assert.strictEqual(daCtx.site, 'site');
    });

    it('should return a ref', () => {
      assert.strictEqual(daCtx.ref, 'main');
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.sourcePath, '/folder/content.html');
      assert.strictEqual(daCtx.aemPathname, '/folder/content');
    });

    it('should return isLocal as false', () => {
      assert.equal(daCtx.isLocal, false);
    });
  });

  describe('Index page URL context from localhost', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.localhostIndex);
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.sourcePath, '/index.html');
      assert.strictEqual(daCtx.aemPathname, '/');
    });
  });

  describe('Index page URL context', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.contentIndex);
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.sourcePath, '/index.html');
      assert.strictEqual(daCtx.aemPathname, '/');
    });
  });

  describe('Index page URL context with sub folder', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.contentSubFolderIndex);
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.sourcePath, '/sub-folder/index.html');
      assert.strictEqual(daCtx.aemPathname, '/sub-folder/');
    });
  });

  describe('File with non-html extension', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.nonHtmlFile);
    });

    it('should return the correct path names with extension', () => {
      assert.strictEqual(daCtx.sourcePath, '/folder/content.json');
      assert.strictEqual(daCtx.aemPathname, '/folder/content.json');
      assert.strictEqual(daCtx.ext, 'json');
    });
  });

  describe('File with plain in name', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.plainFile);
    });

    it('should return the correct path names with extension', () => {
      assert.strictEqual(daCtx.sourcePath, '/folder/content.plain.html');
      assert.strictEqual(daCtx.aemPathname, '/folder/content.plain.html');
      assert.strictEqual(daCtx.ext, 'html');
    });
  });

  describe('sourcePath', () => {
    const ctxFor = (pathname) => getDaCtx(
      new Request(`https://main--site--org.ue.da.live${pathname}`),
    );

    it('maps / to /index.html', () => {
      const ctx = ctxFor('/');
      assert.strictEqual(ctx.sourcePath, '/index.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /index to /index.html', () => {
      const ctx = ctxFor('/index');
      assert.strictEqual(ctx.sourcePath, '/index.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /folder/ to /folder/index.html', () => {
      const ctx = ctxFor('/folder/');
      assert.strictEqual(ctx.sourcePath, '/folder/index.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /folder to /folder.html', () => {
      const ctx = ctxFor('/folder');
      assert.strictEqual(ctx.sourcePath, '/folder.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /page to /page.html', () => {
      const ctx = ctxFor('/page');
      assert.strictEqual(ctx.sourcePath, '/page.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /page.html to /page.html', () => {
      const ctx = ctxFor('/page.html');
      assert.strictEqual(ctx.sourcePath, '/page.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /Page.HTML to /page.html', () => {
      const ctx = ctxFor('/Page.HTML');
      assert.strictEqual(ctx.sourcePath, '/page.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /x.html.html to /x.html.html', () => {
      const ctx = ctxFor('/x.html.html');
      assert.strictEqual(ctx.sourcePath, '/x.html.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /Media/Logo.PNG to /media/logo.png', () => {
      const ctx = ctxFor('/Media/Logo.PNG');
      assert.strictEqual(ctx.sourcePath, '/media/logo.png');
      assert.strictEqual(ctx.ext, 'png');
    });

    it('maps /A/B/c.JSON to /a/b/c.json', () => {
      const ctx = ctxFor('/A/B/c.JSON');
      assert.strictEqual(ctx.sourcePath, '/a/b/c.json');
      assert.strictEqual(ctx.ext, 'json');
    });

    it('maps /folder/Sub-Folder/ to /folder/sub-folder/index.html', () => {
      const ctx = ctxFor('/folder/Sub-Folder/');
      assert.strictEqual(ctx.sourcePath, '/folder/sub-folder/index.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /sheet.json to /sheet.json', () => {
      const ctx = ctxFor('/sheet.json');
      assert.strictEqual(ctx.sourcePath, '/sheet.json');
      assert.strictEqual(ctx.ext, 'json');
    });

    it('maps /a/b.plain.html to /a/b.plain.html', () => {
      const ctx = ctxFor('/a/b.plain.html');
      assert.strictEqual(ctx.sourcePath, '/a/b.plain.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /a//b to /a/b.html', () => {
      const ctx = ctxFor('/a//b');
      assert.strictEqual(ctx.sourcePath, '/a/b.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /.hidden to /.hidden', () => {
      const ctx = ctxFor('/.hidden');
      assert.strictEqual(ctx.sourcePath, '/.hidden');
      assert.strictEqual(ctx.ext, 'hidden');
    });

    it('maps /page. to /page.', () => {
      const ctx = ctxFor('/page.');
      assert.strictEqual(ctx.sourcePath, '/page.');
      assert.strictEqual(ctx.ext, '');
    });

    it('maps /explaining to /explaining.html', () => {
      const ctx = ctxFor('/explaining');
      assert.strictEqual(ctx.sourcePath, '/explaining.html');
      assert.strictEqual(ctx.ext, 'html');
    });

    it('maps /v1.2 to /v1.2', () => {
      const ctx = ctxFor('/v1.2');
      assert.strictEqual(ctx.sourcePath, '/v1.2');
      assert.strictEqual(ctx.ext, '2');
    });
  });

  describe('Invalid URL context', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.invalid);
    });

    it('should return undefined', () => {
      assert.ifError(daCtx.org);
      assert.ifError(daCtx.site);
    });
  });

  describe('siteToken', () => {
    it('should return header value as-is when x-site-token header is present', () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content', {
        headers: { 'x-site-token': 'token abc123' },
      });
      daCtx = getDaCtx(req);
      assert.strictEqual(daCtx.siteToken, 'token abc123');
    });

    it('should prepend token to cookie value when falling back to cookie', () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content', {
        headers: { Cookie: 'site_token=abc123' },
      });
      daCtx = getDaCtx(req);
      assert.strictEqual(daCtx.siteToken, 'token abc123');
    });

    it('should prefer header over cookie', () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content', {
        headers: {
          'x-site-token': 'token from-header',
          Cookie: 'site_token=from-cookie',
        },
      });
      daCtx = getDaCtx(req);
      assert.strictEqual(daCtx.siteToken, 'token from-header');
    });

    it('should return undefined when no token is present', () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content');
      daCtx = getDaCtx(req);
      assert.strictEqual(daCtx.siteToken, undefined);
    });
  });

  describe('ue-service query parameter', () => {
    it('should set ueService when ue-service query parameter is present as string', () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content?ue-service=local');
      daCtx = getDaCtx(req);
      assert.strictEqual(daCtx.ueService, 'local');
    });

    it('should set ueService with empty string when ue-service is empty', () => {
      const req = new Request('https://main--site--org.ue.da.live/folder/content?ue-service=');
      daCtx = getDaCtx(req);
      assert.strictEqual(daCtx.ueService, '');
    });
  });
});
