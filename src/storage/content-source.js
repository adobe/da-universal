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
 * Asks the AEM API which store holds a site's content.
 *
 * `GET {AEM_API}/{org}/sites/{site}/sidekick` returns the resolved content source url in its body
 * and needs only `code:read`, the permission every authoring role already has. It answers for
 * legacy sites too, because both stores read the same config service. A config that could not be
 * resolved is a 404 rather than a wrong answer, which is what lets an unresolved source be
 * refused instead of guessed at.
 *
 * The prefix test is the same one the platform applies to itself:
 * `helix-api-service/src/contentproxy/index.js` reads the source as the source bus when its url
 * starts with the API host.
 *
 * @param {Object} env worker env, `AEM_API` is the API host and the source-bus prefix
 * @param {Object} daCtx
 * @returns {Promise<{kind: string, base?: string, reason?: string}>} `sourcebus` with the store
 * base url, `legacy`, or `unknown` with the reason it could not be answered
 */
export default async function resolveContentSource(env, daCtx) {
  const { org, site, authToken } = daCtx;

  // an unparseable hostname leaves org and site undefined, and there is no site to ask about
  if (!org || !site) {
    return unknown(org, site, 'no org or site in the request');
  }

  const api = env.AEM_API?.replace(/\/$/, '');
  let url;
  try {
    url = new URL(`/${org}/sites/${site}/sidekick`, api);
  } catch (e) {
    return unknown(org, site, `AEM_API is not a url: ${e.message}`);
  }

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
  if (sourceUrl.startsWith(`${api}/`)) {
    return { kind: SOURCE_BUS, base: sourceUrl.replace(/\/$/, '') };
  }
  if (sourceUrl.startsWith(LEGACY_PREFIX)) {
    return { kind: LEGACY };
  }
  return unknown(org, site, `content source ${sourceUrl} is neither store`);
}
