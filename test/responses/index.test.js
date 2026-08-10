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
import { upstreamFailure } from '../../src/responses/index.js';
import { CONTENT_STORE, PING, UpstreamError } from '../../src/utils/upstream.js';

const probeFailed = () => new UpstreamError(PING, new DOMException('timed out', 'TimeoutError'));
const storeFailed = () => new UpstreamError(CONTENT_STORE, new TypeError('Network connection lost'));
const headFailed = () => new UpstreamError('/head.html', new TypeError('fetch failed'));

describe('upstreamFailure', () => {
  it('is a 503 whichever method asked', () => {
    ['GET', 'HEAD', 'POST', 'OPTIONS'].forEach((method) => {
      assert.strictEqual(upstreamFailure(storeFailed(), method).status, 503);
    });
  });

  it('names the cause in x-error', () => {
    const res = upstreamFailure(storeFailed(), 'GET');
    assert.strictEqual(res.headers.get('x-error'), 'content store failed: TypeError: Network connection lost');
  });

  it('asks the caller to retry', () => {
    assert.ok(Number(upstreamFailure(probeFailed(), 'GET').headers.get('Retry-After')) > 0);
  });

  describe('a read', () => {
    it('renders the store as the system that failed', async () => {
      assert.match(await upstreamFailure(storeFailed(), 'GET').text(), /Content store unreachable/);
    });

    it('renders the store when the probe is what failed', async () => {
      assert.match(await upstreamFailure(probeFailed(), 'GET').text(), /Content store unreachable/);
    });

    // the body is what an author reads in the editor; the header is not
    it('renders the preview host when head.html is what failed', async () => {
      assert.match(await upstreamFailure(headFailed(), 'GET').text(), /AEM unreachable/);
    });
  });

  describe('a HEAD', () => {
    it('has no body', async () => {
      assert.strictEqual(await upstreamFailure(storeFailed(), 'HEAD').text(), '');
    });

    it('still names the cause', () => {
      const res = upstreamFailure(probeFailed(), 'HEAD');
      assert.strictEqual(res.headers.get('x-error'), '/ping failed: TimeoutError: timed out');
    });
  });

  describe('a write', () => {
    // the Universal Editor Service embeds the body verbatim in its problem+json error string
    it('is plain text', () => {
      const res = upstreamFailure(storeFailed(), 'POST');
      assert.strictEqual(res.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    });

    it('says nothing was written when the store did not answer', async () => {
      assert.match(await upstreamFailure(storeFailed(), 'POST').text(), /nothing was written/);
    });

    // which store holds the site was never settled, so the write did not even pick one
    it('says which store was undetermined when the probe did not answer', async () => {
      assert.match(await upstreamFailure(probeFailed(), 'POST').text(), /could not be determined/);
    });
  });
});
