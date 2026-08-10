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
import {
  CONTENT_STORE, PING, UpstreamError, causeOf, reach,
} from '../../src/utils/upstream.js';

describe('causeOf', () => {
  it('renders an error as name and message', () => {
    assert.strictEqual(causeOf(new TypeError('fetch failed')), 'TypeError: fetch failed');
  });

  it('keeps the DOMException name a timeout arrives under', () => {
    assert.strictEqual(causeOf(new DOMException('timed out', 'TimeoutError')), 'TimeoutError: timed out');
  });

  // a thrown string has no name, and "undefined: undefined" would leave the 503 saying nothing
  it('renders a thrown non-Error', () => {
    assert.strictEqual(causeOf('boom'), 'Error: boom');
  });

  // the value reaches a response header, where a newline would split it into a second header
  it('collapses whitespace and control characters', () => {
    assert.strictEqual(causeOf(new Error('lost\r\n at\tfetch')), 'Error: lost at fetch');
  });

  it('caps the rendered cause at 1024 characters', () => {
    assert.strictEqual(causeOf(new Error('x'.repeat(2000))).length, 1024);
  });
});

describe('UpstreamError', () => {
  it('names the upstream that did not answer', () => {
    const e = new UpstreamError(PING, new TypeError('fetch failed'));
    assert.strictEqual(e.upstream, PING);
  });

  it('renders the header value as the upstream and the cause', () => {
    const e = new UpstreamError(PING, new DOMException('timed out', 'TimeoutError'));
    assert.strictEqual(e.error, '/ping failed: TimeoutError: timed out');
  });

  it('is an Error', () => {
    assert.ok(new UpstreamError(CONTENT_STORE, new Error('x')) instanceof Error);
  });

  // one upstream names itself by a path out of the site config sheet, and a newline in that cell
  // would throw where the header is appended, turning the 503 back into a bodyless 500
  it('collapses whitespace in the upstream name too', () => {
    const e = new UpstreamError('/templates/a\nx-injected: 1', new TypeError('x'));
    assert.strictEqual(e.error, '/templates/a x-injected: 1 failed: TypeError: x');
  });

  it('caps the whole header value at 1024 characters', () => {
    const e = new UpstreamError('/'.padEnd(900, 'a'), new Error('y'.repeat(900)));
    assert.strictEqual(e.error.length, 1024);
  });

  it('renders a header value a Response accepts', () => {
    const e = new UpstreamError('/t\r\n\u0000', new Error('boom'));
    assert.doesNotThrow(() => new Response('', { headers: { 'x-error': e.error } }));
  });
});

describe('reach', () => {
  it('passes the value through when the upstream answers', async () => {
    assert.strictEqual(await reach(CONTENT_STORE, async () => 'answer'), 'answer');
  });

  it('turns a rejection into an UpstreamError naming the upstream', async () => {
    await assert.rejects(
      () => reach(CONTENT_STORE, async () => { throw new TypeError('Network connection lost'); }),
      (e) => e instanceof UpstreamError
        && e.error === 'content store failed: TypeError: Network connection lost',
    );
  });

  // /ping is reached through isSourceBus, which already wraps its own fetch, so a second wrap
  // would render the header as "content store failed: UpstreamError: /ping failed: ..."
  it('leaves an UpstreamError from a nested reach alone', async () => {
    const inner = new UpstreamError(PING, new TypeError('fetch failed'));
    await assert.rejects(
      () => reach(CONTENT_STORE, async () => { throw inner; }),
      (e) => e === inner,
    );
  });
});
