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
import { getDaCtx } from '../../src/utils/daCtx.js';

describe('AEM proxy quick-edit', () => {
  let handleAEMProxyRequest;
  const env = { UE_HOST: 'test-host', UE_SERVICE: 'test-service' };

  beforeEach(async () => {
    const mod = await esmock('../../src/routes/aem-proxy.js');
    handleAEMProxyRequest = mod.handleAEMProxyRequest;
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('appends the bootstrap to the entry script matched by the cookie', async () => {
    const req = new Request('https://main--site--org.ue.da.live/scripts/scripts.js', {
      headers: { Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js' },
    });
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => new Response('function loadPage() {}', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    const code = await res.text();
    assert.ok(code.includes('function loadPage() {}'));
    assert.ok(code.includes('quick-edit'));
  });

  it('does not inject for a script that does not match the cookie path', async () => {
    const req = new Request('https://main--site--org.ue.da.live/scripts/other.js', {
      headers: { Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js' },
    });
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => new Response('function loadPage() {}', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), 'function loadPage() {}');
  });

  it('does not synthesize HTML for a 404 entry script request', async () => {
    const req = new Request('https://main--site--org.ue.da.live/scripts/scripts.js', {
      headers: { Cookie: 'da-quick-edit=%2Fscripts%2Fscripts.js' },
    });
    const daCtx = getDaCtx(req);

    globalThis.fetch = async () => new Response('missing script', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const res = await handleAEMProxyRequest({ req, env, daCtx });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(await res.text(), 'missing script');
    assert.strictEqual(res.headers.get('Set-Cookie'), null);
  });
});
