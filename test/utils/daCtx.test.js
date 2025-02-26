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
      assert.strictEqual(daCtx.pathname, '/folder/content');
      assert.strictEqual(daCtx.aemPathname, '/folder/content');
    });

    it('should return isLocal as true', () => {
      assert.ok(daCtx.isLocal)
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
      assert.strictEqual(daCtx.pathname, '/folder/content');
      assert.strictEqual(daCtx.aemPathname, '/folder/content');
    });

    it('should return isLocal as false', () => {
      assert.equal(daCtx.isLocal, false);
    });
  });

  describe('Index content URL context from localhost', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.localhostIndex);
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.pathname, '/index');
      assert.strictEqual(daCtx.aemPathname, '/');
    });
  });

  describe('Index content URL context', async () => {
    beforeEach(async () => {
      daCtx = getDaCtx(reqs.contentIndex);
    });

    it('should return the correct path names', () => {
      assert.strictEqual(daCtx.pathname, '/index');
      assert.strictEqual(daCtx.aemPathname, '/');
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
});
