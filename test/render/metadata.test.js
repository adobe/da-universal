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
import { Modifiers, fetchBulkMetadata } from '../../src/render/metadata.js';

const aemCtx = { previewUrl: 'https://main--site--org.aem.page' };

describe('fetchBulkMetadata', () => {
  afterEach(() => {
    delete globalThis.fetch;
  });

  it('reads the modifier sheet', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: [{ url: '/**', key: 'Title', value: 'From the sheet' }],
    }), { status: 200 });

    const modifiers = await fetchBulkMetadata(aemCtx);

    assert.strictEqual(modifiers.getModifiers('/page').title, 'From the sheet');
  });

  it('has no modifiers when the sheet is not there', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });

    const modifiers = await fetchBulkMetadata(aemCtx);

    assert.deepStrictEqual({ ...modifiers.getModifiers('/page') }, {});
  });

  // the sheet is optional and the page composes without it, so an origin that cannot be reached
  // degrades the same way a 404 does rather than taking the whole read down
  it('has no modifiers when the origin does not answer', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Network connection lost');
    };

    const modifiers = await fetchBulkMetadata(aemCtx);

    assert.deepStrictEqual({ ...modifiers.getModifiers('/page') }, {});
  });

  it('has no modifiers when a 200 carries no JSON', async () => {
    globalThis.fetch = async () => new Response('<html>login</html>', { status: 200 });

    const modifiers = await fetchBulkMetadata(aemCtx);

    assert.deepStrictEqual({ ...modifiers.getModifiers('/page') }, {});
  });

  // `null` is the one JSON body that reaches `json.default` as a non-object
  it('has no modifiers when a 200 carries a null body', async () => {
    globalThis.fetch = async () => new Response('null', { status: 200 });

    const modifiers = await fetchBulkMetadata(aemCtx);

    assert.deepStrictEqual({ ...modifiers.getModifiers('/page') }, {});
  });

  it('is the empty modifiers that never match', () => {
    assert.deepStrictEqual({ ...Modifiers.EMPTY.getModifiers('/page') }, {});
  });
});
