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
import { describe, it } from 'mocha';
import { causeOf } from '../../src/utils/upstream.js';

describe('causeOf', () => {
  it('names the error and its message', () => {
    assert.strictEqual(causeOf(new TypeError('Network lost')), 'TypeError: Network lost');
  });

  it('keeps latin-1 characters, which a header value can carry', () => {
    assert.strictEqual(causeOf(new Error('café ÿ')), 'Error: café ÿ');
  });

  it('replaces a character a header value cannot carry', () => {
    assert.strictEqual(causeOf(new Error('a ’ b')), 'Error: a b');
  });

  it('replaces the controls that are not a header value character', () => {
    // tab, newline, carriage return, NUL, DEL and a C1 control
    const controls = [0x09, 0x0a, 0x0d, 0x00, 0x7f, 0x85]
      .map((c) => String.fromCharCode(c))
      .join('');
    assert.strictEqual(causeOf(new Error(`a${controls}b`)), 'Error: a b');
  });

  it('caps the length', () => {
    assert.strictEqual(causeOf(new Error('x'.repeat(2000))).length, 1024);
  });

  it('renders what is thrown when it is not an Error', () => {
    assert.strictEqual(causeOf('boom'), 'Error: boom');
    assert.strictEqual(causeOf(undefined), 'Error: undefined');
  });

  // the point of the sanitizing: whatever comes back is settable, so no failure path throws while
  // reporting a failure
  it('answers a string that Headers accepts, for any code point', () => {
    for (let i = 0; i <= 0x2fff; i += 1) {
      const value = causeOf(new Error(`a${String.fromCharCode(i)}b`));
      assert.doesNotThrow(() => new Headers({ 'x-error': value }), `code point 0x${i.toString(16)}`);
    }
  });
});
