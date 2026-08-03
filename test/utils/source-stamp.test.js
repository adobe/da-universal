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
import { LEGACY, SOURCE_BUS } from '../../src/storage/content-source.js';

const {
  SOURCE_STAMP_PARAM, formatSourceStamp, parseSourceStamp,
} = await import('../../src/utils/source-stamp.js');

const bus = { kind: SOURCE_BUS, base: 'https://api.aem.live/org/sites/site/source' };
const legacy = { kind: LEGACY };

describe('formatSourceStamp', () => {
  it('names the param the connection uri carries', () => {
    assert.strictEqual(SOURCE_STAMP_PARAM, 'ab-src');
  });

  it('stamps a source-bus read that found a document', () => {
    assert.strictEqual(formatSourceStamp(bus, true), 'sb');
  });

  it('stamps a source-bus read that found nothing', () => {
    assert.strictEqual(formatSourceStamp(bus, false), 'sb.new');
  });

  // one page load produces many saves against the same stamp, so a version in it would land the
  // first save and refuse the rest
  it('carries no version, whatever etag the read returned', () => {
    assert.doesNotMatch(formatSourceStamp(bus, true), /[0-9a-f]{8}/);
  });

  it('needs no url encoding', () => {
    ['sb', 'sb.new', 'da'].forEach((v) => assert.strictEqual(encodeURIComponent(v), v));
  });

  it('stamps a legacy read, which has no version to carry either', () => {
    assert.strictEqual(formatSourceStamp(legacy, false), 'da');
  });

  it('stamps a legacy read the same whether or not the document was found', () => {
    assert.strictEqual(formatSourceStamp(legacy, true), 'da');
  });
});

describe('parseSourceStamp', () => {
  describe('a source-bus stamp', () => {
    it('reads the store back', () => {
      assert.strictEqual(parseSourceStamp('sb').kind, SOURCE_BUS);
      assert.strictEqual(parseSourceStamp('sb.new').kind, SOURCE_BUS);
    });

    it('asks that the document still exist, which holds for every save in a session', () => {
      assert.deepStrictEqual(parseSourceStamp('sb').condition, { 'If-Match': '*' });
    });

    // If-None-Match: * would refuse every save after the one that created the document
    it('carries no precondition when the read found nothing, so the save can create it', () => {
      assert.strictEqual(parseSourceStamp('sb.new').condition, undefined);
    });
  });

  describe('a legacy stamp', () => {
    it('reads the store back', () => {
      assert.strictEqual(parseSourceStamp('da').kind, LEGACY);
    });

    // da-admin sets no etag on a source GET or HEAD, only on a POST response, so a read there
    // cannot produce a precondition. Verified live on 2026-08-03.
    it('carries no precondition, since a legacy read yields no etag', () => {
      assert.strictEqual(parseSourceStamp('da').condition, undefined);
    });
  });

  describe('anything else', () => {
    [
      ['no stamp at all', null],
      ['an empty stamp', ''],
      ['an unknown store', 'gcs.abc'],
      ['a stamp shaped like a path', 'sb/abc'],
      ['a version pin, which this no longer emits', 'sb.9e8311043aab12b1'],
      ['a url-unsafe character', 'sb.a"b'],
      ['a slash', 'sb.a/b'],
      ['a trailing dot', 'sb.'],
      ['a header injection attempt', 'sb.abc\r\nX-Evil: 1'],
      ['a case variation', 'SB'],
    ].forEach(([what, value]) => {
      it(`is not trusted: ${what}`, () => {
        assert.strictEqual(parseSourceStamp(value), undefined);
      });
    });
  });

  describe('round trip', () => {
    [[bus, true], [bus, false], [legacy, true], [legacy, false]].forEach(([source, found]) => {
      it(`parses back what a ${source.kind} read stamped, found=${found}`, () => {
        const parsed = parseSourceStamp(formatSourceStamp(source, found));

        assert.ok(parsed, 'a stamp this code emits must parse back');
        assert.strictEqual(parsed.kind, source.kind);
      });
    });
  });
});
