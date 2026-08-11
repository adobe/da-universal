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

// stands in for config.aem.page, which needs a shared secret
// answers 200 for a site in SITES, 404 for anything else
const SITES = {
  'org/site': 'https://content.da.live/org/site/',
};

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

    const body = JSON.stringify({
      ref, site, org, content: { source: { type: 'markup', url: source } },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  },
};
