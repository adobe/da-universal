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
import { getUEHtmlHeadEntries } from '../../src/ue/scaffold.js';
import { getAemCtx } from '../../src/utils/aemCtx.js';
import { UNAUTHORIZED_HTML_MESSAGE } from '../../src/utils/constants.js';

const env = { UE_HOST: 'test-ue-host', UE_SERVICE: 'test-ue-service' };

const connectionContent = (daCtx, stamp) => {
  const entries = getUEHtmlHeadEntries(daCtx, getAemCtx(env, daCtx), stamp);
  return entries.find((e) => e.properties?.name === 'urn:adobe:aue:system:ab').properties.content;
};

const hosted = {
  org: 'org', site: 'site', ref: 'ref', path: '/some-path', aemPathname: '/some-path',
};
const local = { ...hosted, isLocal: true, orgSiteInPath: true };

describe('the stamp on the UE connection uri', () => {
  it('is absent when the read left none', () => {
    assert.strictEqual(
      connectionContent(hosted, undefined),
      'da:https://ref--site--org.test-ue-host/some-path',
    );
  });

  it('is carried as a query param the Universal Editor Service posts back', () => {
    assert.strictEqual(
      connectionContent(hosted, 'sb.abc123'),
      'da:https://ref--site--org.test-ue-host/some-path?ab-src=sb.abc123',
    );
  });

  it('is carried on the localhost form too', () => {
    assert.strictEqual(
      connectionContent(local, 'da'),
      'da:https://test-ue-host/org/site/some-path?ab-src=da',
    );
  });

  it('keeps the uri parseable, so new URL() round-trips it', () => {
    const content = connectionContent(hosted, 'sb.abc123');
    const uri = content.replace(/^da:/, '');

    assert.strictEqual(new URL(uri).toString(), uri);
    assert.strictEqual(new URL(uri).searchParams.get('ab-src'), 'sb.abc123');
  });

  it('leaves the path and host untouched, so gimme_cookie still resolves', () => {
    const uri = new URL(connectionContent(hosted, 'sb.abc123').replace(/^da:/, ''));

    assert.strictEqual(uri.pathname, '/some-path');
    assert.strictEqual(uri.hostname, 'ref--site--org.test-ue-host');
    assert.strictEqual(new URL('/gimme_cookie', uri).toString(), 'https://ref--site--org.test-ue-host/gimme_cookie');
  });

  it('is not added to the 401 sentinel, which the authorbus extension matches exactly', () => {
    // the shipped extension compares the endpoint to the literal '401' and 'da://401' and on a
    // match refetches /gimme_cookie and refreshes the page; a stamp would stop that firing
    assert.ok(UNAUTHORIZED_HTML_MESSAGE.includes('content="da:401"'));
    assert.ok(!UNAUTHORIZED_HTML_MESSAGE.includes('ab-src'));
  });
});
