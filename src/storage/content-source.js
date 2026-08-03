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
const UPGRADE_HEADER = 'x-api-upgrade-available';

export const SOURCE_BUS = 'sourcebus';
export const LEGACY = 'legacy';
export const UNKNOWN = 'unknown';
export const UNAUTHORIZED = 'unauthorized';

function sourceBusBase(env, org, site) {
  return `${env.AEM_API?.replace(/\/$/, '')}/${org}/sites/${site}/source`;
}

/**
 * Asks `/ping` whether a site is on the source bus, for a read.
 *
 * The Fastly edge answers an enrolled site from a dictionary in ~37ms without reaching an origin,
 * against ~529ms for the config read. Only the yes is usable: helix-admin sets the header when
 * config resolution succeeded and named the API, so its absence covers a legacy site, a config
 * that would not resolve, and a site that does not exist alike.
 *
 * The base is built rather than read, because `/ping` returns a header and no url.
 * helix-api-service parses org and site out of a source url and refuses one that names another
 * site (`src/contentproxy/source/utils.js`, "only allow source bus from the same org and site"),
 * so this is the only base the site can legally have.
 *
 * @returns {Promise<{kind: string, base: string}|undefined>} undefined whenever `/ping` did not
 * say yes, which leaves the config read to answer
 */
export async function fastSourceBus(env, daCtx) {
  const { org, site } = daCtx;
  if (!org || !site) return undefined;

  let url;
  try {
    url = new URL(`/ping/${org}/${site}`, env.HLX_ADMIN);
  } catch (e) {
    return undefined;
  }

  try {
    // no token: /ping is exempt from authorize() and answers the same either way
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status !== 200) return undefined;
    if (response.headers.get(UPGRADE_HEADER) !== 'true') return undefined;
  } catch (e) {
    return undefined;
  }
  return { kind: SOURCE_BUS, base: sourceBusBase(env, org, site) };
}

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
 * @returns {Promise<{kind: string, base?: string, status?: number, reason?: string}>} `sourcebus`
 * with the store base url, `legacy`, `unauthorized` with the status the API gave, or `unknown`
 * with the reason it could not be answered
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

  // an expired or insufficient session is a definite answer, not an unresolved one. Reporting it
  // as unresolved answers a retryable 503, and the caller re-tries a session that cannot recover.
  if (response.status === 401 || response.status === 403) {
    console.warn(`[source] ${org}/${site} not authorized: ${url} answered ${response.status}`);
    return { kind: UNAUTHORIZED, status: response.status };
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
