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

const SOURCE_BUS_PREFIX = 'https://api.aem.live/';
const LEGACY_PREFIX = 'https://content.da.live/';
const TIMEOUT_MS = 5 * 1000;

export const SOURCE_BUS = 'sourcebus';
export const LEGACY = 'legacy';
export const UNKNOWN = 'unknown';

function unknown(org, site, reason) {
  console.warn(`[source] ${org}/${site} unknown: ${reason}`);
  return { kind: UNKNOWN, reason };
}

/**
 * Asks admin.hlx.page which store holds a site's content.
 *
 * The sidekick config returns the resolved content source url in its body, and answers 404 when
 * config resolution produced nothing (`if (config) { ... } return { status: 404 }` in
 * helix-admin src/sidekick/handler.js). So a failure to resolve is reported as a failure. The
 * `/ping` header cannot do that: it is absent both for a legacy site and for a source-bus site
 * whose config could not be read, which is the case that reads past a page and writes over it.
 *
 * @param {Object} env worker env, `HLX_ADMIN` is the admin host
 * @param {Object} daCtx
 * @returns {Promise<{kind: string, base?: string, reason?: string}>} `sourcebus` with the store
 * base url, `legacy`, or `unknown` with the reason it could not be answered
 */
export default async function resolveContentSource(env, daCtx) {
  const {
    org, site, ref, authToken,
  } = daCtx;

  // an unparseable hostname leaves org, site and ref all undefined together, and there is no
  // site to ask about
  if (!org || !site) {
    return unknown(org, site, 'no org or site in the request');
  }

  const url = new URL(`/sidekick/${org}/${site}/${ref}/config.json`, env.HLX_ADMIN);
  const headers = new Headers();
  if (authToken) headers.set('Authorization', authToken);

  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    return unknown(org, site, `${url} failed with ${e.name}: ${e.message}`);
  }

  if (response.status !== 200) {
    return unknown(org, site, `${url} answered ${response.status}`);
  }

  let config;
  try {
    config = await response.json();
  } catch (e) {
    return unknown(org, site, `${url} did not answer json: ${e.message}`);
  }

  const sourceUrl = config?.contentSourceUrl;
  if (typeof sourceUrl !== 'string') {
    return unknown(org, site, `${url} named no content source`);
  }
  if (sourceUrl.startsWith(SOURCE_BUS_PREFIX)) {
    return { kind: SOURCE_BUS, base: sourceUrl.replace(/\/$/, '') };
  }
  if (sourceUrl.startsWith(LEGACY_PREFIX)) {
    return { kind: LEGACY };
  }
  return unknown(org, site, `content source ${sourceUrl} is neither store`);
}
