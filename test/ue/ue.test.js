/*
 * Copyright 2025 Adobe. All rights reserved.
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
import esmock from 'esmock';
import { fromHtml } from 'hast-util-from-html';
import { select } from 'hast-util-select';
import { h } from 'hastscript';

describe('applyUEInstrumentation', () => {
  it('adds UE head entries and UE body attributes to a composed tree', async () => {
    let ueConfigArg;
    let injectedBody;
    const { applyUEInstrumentation } = await esmock('../../src/ue/ue.js', {
      '../../src/ue/scaffold.js': {
        getUEHtmlHeadEntries: () => [h('meta', { name: 'urn:adobe:aue:system:ab', content: 'x' })],
        getUEConfig: async () => {
          ueConfigArg = 'config';
          return { ok: true };
        },
      },
      '../../src/ue/attributes.js': {
        injectUEAttributes: (bodyNode) => { injectedBody = bodyNode; },
      },
    });

    const tree = fromHtml('<html><head></head><body><div>content</div></body></html>');
    await applyUEInstrumentation(tree, { org: 'o', site: 's' }, {});

    // UE head entry was pushed into the head node
    const head = select('head', tree);
    assert.ok(head.children.some(
      (c) => c.tagName === 'meta' && c.properties.name === 'urn:adobe:aue:system:ab',
    ));
    // UE attributes were applied to the body node, using the fetched config
    assert.strictEqual(ueConfigArg, 'config');
    assert.strictEqual(injectedBody, select('body', tree));
  });
});
