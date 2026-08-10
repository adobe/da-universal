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
import reqs from '../mocks/req.js';

const { getDaCtx } = await import('../../src/utils/daCtx.js');
const { daSourceHead, daSourcePost, isHtmlPostType } = await import('../../src/routes/da-admin.js');

const authedReq = (url) => new Request(url, { headers: { Authorization: 'Bearer t' } });

const formReq = (url, data) => {
  const body = new FormData();
  body.set('data', data);
  return new Request(url, { method: 'POST', body, headers: { Authorization: 'Bearer t' } });
};

// records every URL handed to env.daadmin.fetch, whether it is called with a
// URL (GET non-HTML, HEAD) or with a Request (GET HTML, POST)
const recorder = () => {
  const fetched = [];
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    AEM_API: 'https://api.aem.live',
    HLX_ADMIN: 'https://admin.hlx.page',
    daadmin: {
      fetch: async (input) => {
        fetched.push(input instanceof Request ? input.url : input.href);
        return new Response('<body>stored</body>', { status: 200 });
      },
    },
  };
  return { env, fetched };
};

// answers the real /ping, which is the only lookup the routes make. `upgraded` is the set of
// `org/site` keys the probe reports as enrolled.
const stubPing = (upgraded = []) => {
  const asked = [];
  globalThis.fetch = async (input) => {
    const url = input.toString();
    asked.push(url);
    const key = url.slice(url.indexOf('/ping/') + '/ping/'.length);
    const headers = upgraded.includes(key) ? { 'x-api-upgrade-available': 'true' } : {};
    return new Response('', { status: 200, headers });
  };
  return asked;
};

const mockRoutes = async () => esmock('../../src/routes/da-admin.js', {
  '../../src/storage/source-bus.js': {
    default: async () => false,
  },
  '../../src/utils/aemCtx.js': {
    getAemCtx: () => ({}),
    getAEMHtml: async () => ({ status: 200, html: '<meta name="from" content="aem" />' }),
  },
  '../../src/render/compose.js': {
    composeHtml: async () => ({ tree: true }),
    serializeHtml: () => '<html>composed</html>',
  },
  '../../src/ue/ue.js': {
    applyUEInstrumentation: async () => {},
  },
});

describe('daSourceHead', () => {
  describe('when no authToken is present', () => {
    it('returns 401 with no body', async () => {
      const daCtx = getDaCtx(reqs.content); // no Authorization header → no authToken

      const res = await daSourceHead({ env: {}, daCtx });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(await res.text(), '');
    });

    it('returns no Content-Type in the 401 response', async () => {
      const daCtx = getDaCtx(reqs.content);

      const res = await daSourceHead({ env: {}, daCtx });

      assert.strictEqual(res.headers.get('Content-Type'), null);
    });
  });
});

describe('daSourceGet', () => {
  const env = {
    DA_ADMIN: 'https://admin.da.live',
    AEM_API: 'https://api.aem.live',
    daadmin: { fetch: async () => new Response('<body>stored</body>', { status: 200 }) },
  };

  // a store that holds nothing at this path, which is both a new document and a site that is
  // not there; head.html is what tells the two apart
  const emptyStore = {
    ...env,
    daadmin: { fetch: async () => new Response('not found', { status: 404 }) },
  };

  // record which composition / instrumentation calls happen and with what
  let calls;

  const mockDaSourceGet = async (overrides = {}) => {
    // `head` is a function so a test can make head.html answer a status or fail outright
    const head = overrides.head
      ?? (() => ({ status: 200, html: '<meta name="from" content="aem" />' }));
    calls = { compose: [], ue: 0, quickEdit: 0 };
    return (await esmock('../../src/routes/da-admin.js', {
      '../../src/storage/source-bus.js': {
        default: async () => false,
      },
      '../../src/utils/aemCtx.js': {
        getAemCtx: () => ({}),
        getAEMHtml: async () => head(),
      },
      '../../src/render/compose.js': {
        composeHtml: async (daCtx, aemCtx, bodyHtml) => {
          calls.compose.push(bodyHtml);
          return { tree: true };
        },
        serializeHtml: () => '<html>composed</html>',
      },
      '../../src/ue/ue.js': {
        applyUEInstrumentation: async () => { calls.ue += 1; },
      },
      '../../src/utils/quick-edit.js': {
        applyQuickEditToDocument: () => {
          calls.quickEdit += 1;
          return '/scripts/scripts.js';
        },
        buildQuickEditCookie: (p) => `da-quick-edit=${encodeURIComponent(p)}; Path=/`,
      },
      '../../src/storage/config.js': {
        getSiteConfig: async () => { throw new Error('no config'); },
      },
    })).daSourceGet;
  };

  it('applies UE instrumentation by default (ue.da.live)', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.ue, 1);
    assert.strictEqual(calls.quickEdit, 0);
    assert.strictEqual(res.headers.get('Set-Cookie'), null);
  });

  it('returns the composed page as-is for a preview host', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://main--site--org.preview.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.ue, 0);
    assert.strictEqual(calls.quickEdit, 0);
    assert.strictEqual(await res.text(), '<html>composed</html>');
  });

  it('returns the composed page as-is on localhost (no UE)', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://localhost:4712/org/site/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.ue, 0);
    assert.strictEqual(calls.quickEdit, 0);
  });

  it('applies quick-edit injection and sets the cookie when quick-edit is requested', async () => {
    const daSourceGet = await mockDaSourceGet();
    const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.quickEdit, 1);
    assert.strictEqual(calls.ue, 0);
    assert.ok(res.headers.get('Set-Cookie')?.includes('da-quick-edit=%2Fscripts%2Fscripts.js'));
  });

  it('composes a template when the stored content is missing', async () => {
    const daSourceGet = await mockDaSourceGet();
    const missingEnv = {
      ...env,
      daadmin: { fetch: async () => new Response('not found', { status: 404 }) },
    };
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env: missingEnv, daCtx });

    assert.strictEqual(res.status, 200);
    // composeHtml still ran (once), but with the template body, not stored content
    assert.strictEqual(calls.compose.length, 1);
    assert.ok(!calls.compose[0].includes('stored'));
  });

  it('returns a working quick-edit shell when the DA source document is missing', async () => {
    const daSourceGet = await mockDaSourceGet();
    const missingEnv = {
      ...env,
      daadmin: { fetch: async () => new Response('not found', { status: 404 }) },
    };
    const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env: missingEnv, daCtx });

    // status doesn't matter here — what matters is a working shell: the full
    // compose pipeline (real head.html, template body) ran, quick-edit
    // instrumentation applied, and the cookie got set from the real head.html
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.compose.length, 1);
    assert.ok(!calls.compose[0].includes('stored'));
    assert.strictEqual(calls.quickEdit, 1);
    assert.ok(res.headers.get('Set-Cookie')?.includes('da-quick-edit=%2Fscripts%2Fscripts.js'));
    assert.strictEqual(await res.text(), '<html>composed</html>');
  });

  it('returns a working 404 shell for quick-edit when the branch has nothing at all', async () => {
    const daSourceGet = await mockDaSourceGet({ head: () => ({ status: 404 }) });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env: emptyStore, daCtx });

    assert.strictEqual(res.status, 404);
    // the heavy compose pipeline is skipped entirely for this degraded path
    assert.strictEqual(calls.compose.length, 0);
    const html = await res.text();
    assert.ok(html.includes('importmap'));
    assert.ok(!html.includes('Unable to retrieve AEM branch'));
  });

  it('still returns branch-not-found for non-quick-edit when the branch has nothing at all', async () => {
    const daSourceGet = await mockDaSourceGet({ head: () => ({ status: 404 }) });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env: emptyStore, daCtx });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(calls.compose.length, 0);
    assert.strictEqual(calls.ue, 0);
    const html = await res.text();
    assert.ok(html.includes('Unable to retrieve AEM branch'));
  });

  // the shell is an empty page, so an author whose document exists is better served by the
  // document, unstyled, than by a scaffold that hides it
  it('composes the stored document for quick-edit when only head.html is missing', async () => {
    const daSourceGet = await mockDaSourceGet({ head: () => ({ status: 404 }) });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');
    const daCtx = getDaCtx(req);

    const res = await daSourceGet({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(calls.compose.length, 1);
    assert.ok(calls.compose[0].includes('stored'));
  });

  it('still injects the quick-edit import map when only head.html is missing', async () => {
    const daSourceGet = await mockDaSourceGet({ head: () => ({ status: 404 }) });
    const req = authedReq('https://main--site--org.ue.da.live/folder/content?quick-edit');
    const daCtx = getDaCtx(req);

    await daSourceGet({ req, env, daCtx });

    assert.strictEqual(calls.quickEdit, 1);
  });
});

describe('source URLs', () => {
  // these drive the unmocked module, so the /ping lookup really does reach out; answer it
  // without the upgrade header, which is the legacy store these tests describe
  beforeEach(() => {
    stubPing();
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  it('GET / reads /index.html', async () => {
    const { daSourceGet } = await mockRoutes();
    const { env, fetched } = recorder();
    const req = authedReq('https://main--site--org.ue.da.live/');
    const daCtx = getDaCtx(req);

    await daSourceGet({ req, env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/index.html']);
  });

  it('GET /page.html reads /page.html', async () => {
    const { daSourceGet } = await mockRoutes();
    const { env, fetched } = recorder();
    const req = authedReq('https://main--site--org.ue.da.live/page.html');
    const daCtx = getDaCtx(req);

    await daSourceGet({ req, env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/page.html']);
  });

  it('GET /Media/Logo.PNG reads /media/logo.png', async () => {
    const { daSourceGet } = await mockRoutes();
    const { env, fetched } = recorder();
    const req = authedReq('https://main--site--org.ue.da.live/Media/Logo.PNG');
    const daCtx = getDaCtx(req);

    await daSourceGet({ req, env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/media/logo.png']);
  });

  it('HEAD / reads /index.html', async () => {
    const { env, fetched } = recorder();
    const daCtx = getDaCtx(authedReq('https://main--site--org.ue.da.live/'));

    await daSourceHead({ env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/index.html']);
  });

  it('HEAD /page.html reads /page.html', async () => {
    const { env, fetched } = recorder();
    const daCtx = getDaCtx(authedReq('https://main--site--org.ue.da.live/page.html'));

    await daSourceHead({ env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/page.html']);
  });

  it('HEAD /Media/Logo.PNG reads /media/logo.png', async () => {
    const { env, fetched } = recorder();
    const daCtx = getDaCtx(authedReq('https://main--site--org.ue.da.live/Media/Logo.PNG'));

    await daSourceHead({ env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/media/logo.png']);
  });

  it('POST / writes /index.html', async () => {
    const { env, fetched } = recorder();
    const html = new File(['<body>hello</body>'], 'index.html', { type: 'text/html' });
    const req = formReq('https://main--site--org.ue.da.live/', html);
    const daCtx = getDaCtx(req);

    await daSourcePost({ req, env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/index.html']);
  });

  it('POST /page.html writes /page.html', async () => {
    const { env, fetched } = recorder();
    const html = new File(['<body>hello</body>'], 'page.html', { type: 'text/html' });
    const req = formReq('https://main--site--org.ue.da.live/page.html', html);
    const daCtx = getDaCtx(req);

    await daSourcePost({ req, env, daCtx });

    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/page.html']);
  });
});

// the HTML serializer would rewrite whatever it is given, so a POST is refused
// unless it addresses an HTML document. sourcePath ends `.html` iff ext is html,
// so this covers every non-HTML target.
describe('daSourcePost to a non-HTML path', () => {
  it('refuses an HTML File and does not write', async () => {
    const { env, fetched } = recorder();
    const html = new File(['<body>hello</body>'], 'logo.html', { type: 'text/html' });
    const req = formReq('https://main--site--org.ue.da.live/Media/Logo.PNG', html);
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 415);
    assert.deepStrictEqual(fetched, []);
  });

  // an untyped part is the case the part-type check cannot cover in node, since
  // undici substitutes application/octet-stream where workerd reports ''. The path
  // check catches it either way, so this is asserted on a string part, which
  // carries no type in either runtime.
  it('refuses a string part, which carries no type at all, and does not write', async () => {
    const { env, fetched } = recorder();
    const req = formReq('https://main--site--org.ue.da.live/media/logo.png', '<body>hello</body>');
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 415);
    assert.deepStrictEqual(fetched, []);
  });

  it('refuses a POST to a json path', async () => {
    const { env, fetched } = recorder();
    const html = new File(['<body>hello</body>'], 'sheet.html', { type: 'text/html' });
    const req = formReq('https://main--site--org.ue.da.live/sheet.json', html);
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 415);
    assert.deepStrictEqual(fetched, []);
  });
});

describe('daSourcePost', () => {
  // these drive the unmocked module, so the /ping lookup really does reach out; answer it
  // without the upgrade header, which is the legacy store these tests describe
  beforeEach(() => {
    stubPing();
  });

  afterEach(() => {
    delete globalThis.fetch;
  });

  describe('on a site /ping reports as enrolled', () => {
    const write = async (site, env) => {
      const html = new File(['<body>hello</body>'], 'page.html', { type: 'text/html' });
      const req = formReq(`https://main--${site}--org.ue.da.live/page`, html);
      return daSourcePost({ req, env, daCtx: getDaCtx(req) });
    };

    it('is refused with 405 and nothing is written', async () => {
      stubPing(['org/refused']);
      const { env, fetched } = recorder();

      const res = await write('refused', env);

      assert.strictEqual(res.status, 405);
      assert.strictEqual(res.headers.get('Allow'), 'GET, HEAD, OPTIONS');
      assert.deepStrictEqual(fetched, []);
    });

    // nothing is remembered between requests, so a site enrolled or un-enrolled mid-session takes
    // effect on the next one
    it('probes once per write', async () => {
      const asked = stubPing(['org/probedeach']);
      const { env } = recorder();

      await write('probedeach', env);
      await write('probedeach', env);

      assert.deepStrictEqual(asked, [
        'https://admin.hlx.page/ping/org/probedeach',
        'https://admin.hlx.page/ping/org/probedeach',
      ]);
    });
  });

  // on an HTML path, so the path check does not answer first and this exercises
  // the part-type check
  it('refuses a binary File with 415 and does not write', async () => {
    const { env, fetched } = recorder();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const png = new File([bytes], 'logo.png', { type: 'image/png' });
    const req = formReq('https://main--site--org.ue.da.live/page', png);
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 415);
    assert.deepStrictEqual(fetched, []);
  });

  it('writes an HTML File', async () => {
    const { env, fetched } = recorder();
    const html = new File(['<body>hello</body>'], 'page.html', { type: 'text/html' });
    const req = formReq('https://main--site--org.ue.da.live/Page', html);
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/page.html']);
  });

  it('writes a string part', async () => {
    const { env, fetched } = recorder();
    const req = new Request('https://main--site--org.ue.da.live/page', {
      method: 'POST',
      body: new URLSearchParams({ data: '<body>hello</body>' }),
      headers: { Authorization: 'Bearer t' },
    });
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/page.html']);
  });

  it('refuses 415 with an empty body when the request content type is not a form type', async () => {
    const { env, fetched } = recorder();
    const req = new Request('https://main--site--org.ue.da.live/page', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    });
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 415);
    assert.strictEqual(await res.text(), '');
    assert.deepStrictEqual(fetched, []);
  });

  // the full normalization matrix is under isHtmlPostType; these two prove it is
  // wired into the route. the charset form is what da-admin itself sends back.
  it('writes an HTML File declared with a charset', async () => {
    const { env, fetched } = recorder();
    const html = new File(['<body>hello</body>'], 'page.html', { type: 'text/html; charset=utf-8' });
    const req = formReq('https://main--site--org.ue.da.live/page', html);
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(fetched, ['https://admin.da.live/source/org/site/page.html']);
  });

  it('refuses a File declared as application/octet-stream on an HTML path', async () => {
    const { env, fetched } = recorder();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'application/octet-stream' });
    const req = formReq('https://main--site--org.ue.da.live/page', file);
    const daCtx = getDaCtx(req);

    const res = await daSourcePost({ req, env, daCtx });

    assert.strictEqual(res.status, 415);
    assert.deepStrictEqual(fetched, []);
  });
});

// workerd and undici disagree on File.type for a multipart part, so the rule is
// asserted directly. measured in workerd 4.118.0: an absent part Content-Type
// reports '', and a declared one is preserved verbatim including its case and
// parameters. undici substitutes application/octet-stream and lowercases.
describe('isHtmlPostType', () => {
  ['', 'text/html', 'text/html; charset=utf-8', 'text/html;charset=UTF-8', 'TEXT/HTML', 'text/HTML '].forEach((type) => {
    it(`accepts ${JSON.stringify(type)}`, () => {
      assert.strictEqual(isHtmlPostType(type), true);
    });
  });

  ['application/octet-stream', 'text/plain', 'image/png', 'image/svg+xml', 'application/pdf', 'application/json'].forEach((type) => {
    it(`rejects ${JSON.stringify(type)}`, () => {
      assert.strictEqual(isHtmlPostType(type), false);
    });
  });
});
