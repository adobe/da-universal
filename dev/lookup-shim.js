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

// stands in for config.aem.page, which needs a shared secret. one read of the pipeline scope
// answers whether the site exists, its head.html and which store holds it. a site in SITES exists,
// and one with a source url on api.aem.live is source-bus
const SITES = {
  'org/site': 'https://content.da.live/org/site/',
};

// what the code bus has at {owner}/{repo}/{ref}/head.html, which the pipeline scope answers with
const HEAD_HTML = '<link rel="stylesheet" href="/styles/styles.css"/>\n<script src="/scripts/scripts.js" type="module"></script>\n';

export default {
  async fetch(req) {
    const url = new URL(req.url);

    const [ref, site, org] = (url.pathname.split('/')[1] ?? '').split('--');
    if (!org || !site) {
      return new Response('', { status: 400, headers: { 'x-error': 'invalid rso path parameter.' } });
    }

    const source = SITES[`${org}/${site}`];
    if (!source) {
      return new Response('', { status: 404, headers: { 'x-error': 'config not found.' } });
    }

    // both stores are `type: markup`, so only the url separates them
    const body = JSON.stringify({
      ref,
      site,
      org,
      head: { html: HEAD_HTML },
      contentSource: { type: 'markup', url: source },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  },
};
