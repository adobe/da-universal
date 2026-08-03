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

  it('stamps a source-bus read with the etag it read', () => {
    assert.strictEqual(formatSourceStamp(bus, '"9e8311043aab12b1"'), 'sb.9e8311043aab12b1');
  });

  it('strips the quotes, so the stamp needs no url encoding', () => {
    assert.doesNotMatch(formatSourceStamp(bus, '"abc123"'), /["%]/);
  });

  it('unwraps a weak etag', () => {
    assert.strictEqual(formatSourceStamp(bus, 'W/"abc123"'), 'sb.abc123');
  });

  it('keeps a multipart etag suffix', () => {
    assert.strictEqual(formatSourceStamp(bus, '"abc123-7"'), 'sb.abc123-7');
  });

  it('stamps a source-bus read that found nothing, so the write can only create', () => {
    assert.strictEqual(formatSourceStamp(bus, undefined), 'sb.new');
  });

  it('stamps a source-bus read with no etag as a bare source-bus read', () => {
    assert.strictEqual(formatSourceStamp(bus, null, true), 'sb');
  });

  it('falls back to a bare source-bus read for an etag it cannot put in a url', () => {
    assert.strictEqual(formatSourceStamp(bus, '"has spaces and /"', true), 'sb');
  });

  it('stamps a legacy read, which has no etag to carry', () => {
    assert.strictEqual(formatSourceStamp(legacy, undefined), 'da');
  });

  it('stamps a legacy read the same whether or not the document was found', () => {
    assert.strictEqual(formatSourceStamp(legacy, undefined, true), 'da');
  });
});

describe('parseSourceStamp', () => {
  describe('a source-bus stamp', () => {
    it('reads the store back', () => {
      assert.strictEqual(parseSourceStamp('sb.abc123').kind, SOURCE_BUS);
    });

    it('turns the etag into an If-Match, so a changed page is refused', () => {
      assert.deepStrictEqual(parseSourceStamp('sb.abc123').condition, { 'If-Match': '"abc123"' });
    });

    it('turns a new-page stamp into If-None-Match, so an existing page is refused', () => {
      assert.deepStrictEqual(parseSourceStamp('sb.new').condition, { 'If-None-Match': '*' });
    });

    it('turns a bare stamp into If-Match: *, so it can overwrite but not create', () => {
      assert.deepStrictEqual(parseSourceStamp('sb').condition, { 'If-Match': '*' });
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
      ['an etag with a url-unsafe character', 'sb.a"b'],
      ['an etag with a slash', 'sb.a/b'],
      ['a stamp with an empty etag', 'sb.'],
      ['a stamp trying to inject a header', 'sb.abc\r\nX-Evil: 1'],
    ].forEach(([what, value]) => {
      it(`is not trusted: ${what}`, () => {
        assert.strictEqual(parseSourceStamp(value), undefined);
      });
    });
  });

  describe('round trip', () => {
    it('parses back what a source-bus read stamped', () => {
      const stamp = formatSourceStamp(bus, '"9e8311043aab12b156073d30f8bb3710"');

      assert.deepStrictEqual(parseSourceStamp(stamp), {
        kind: SOURCE_BUS,
        condition: { 'If-Match': '"9e8311043aab12b156073d30f8bb3710"' },
      });
    });

    it('parses back what a legacy read stamped', () => {
      assert.deepStrictEqual(parseSourceStamp(formatSourceStamp(legacy)), {
        kind: LEGACY,
        condition: undefined,
      });
    });
  });
});
