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

const TIMEOUT_MS = 5 * 1000;
const NO_SITE = { exists: false, onSourceBus: false };

/** One read of the config service, at the scope the caller needs. */
function askConfigService(env, daCtx, scope) {
  const { org, site, ref } = daCtx;
  const url = new URL(`/${ref}--${site}--${org}/config.json?scope=${scope}`, env.HLX_CONFIG_SERVICE);
  return fetch(url, {
    headers: {
      'x-access-token': env.HLX_CONFIG_SERVICE_TOKEN,
      'x-backend-type': 'aws',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Asks the config service whether a site exists and which store holds its content.
 *
 * `content.source.url` decides the store, and helix-admin sets `x-api-upgrade-available` from
 * the same field, so a request to /ping would say the same thing.
 *
 * Throws on any refusal but a 404, which is the only status that means there is no such site.
 * Reads the status and the source url only, since the response also has admin roles and
 * resolved secrets.
 *
 * @param {Object} env worker env. `HLX_CONFIG_SERVICE` is where the lookup goes,
 * `HLX_CONFIG_SERVICE_TOKEN` authorizes it, `AEM_API` is the source bus the source url is
 * compared against
 * @param {Object} daCtx
 * @returns {Promise<{exists: boolean, onSourceBus: boolean}>}
 */
export default async function getSite(env, daCtx) {
  const { org, site } = daCtx;
  // an unparseable hostname leaves org and site undefined, and there is no site to ask about
  if (!org || !site) return NO_SITE;

  const response = await askConfigService(env, daCtx, 'admin');

  if (response.status === 404) return NO_SITE;
  if (!response.ok) throw new Error(`the config service answered ${response.status}`);

  const { content } = await response.json();
  // the bare prefix would also match a host like api.aem.live.evil.example
  const sourceBus = new URL('/', env.AEM_API).href;
  return { exists: true, onSourceBus: !!content?.source?.url?.startsWith(sourceBus) };
}

/**
 * Reads the site's head.html from the config service.
 *
 * The pipeline scope carries the code bus object the delivery pipeline renders into every page of
 * the site, and the admin scope does not carry it at all. Reading it here rather than from
 * `{ref}--{site}--{org}.aem.page/head.html` answers for a ref the preview host never built and
 * for a site behind Helix authentication, which refuses that path without a site token.
 *
 * Throws on any refusal but a 404. The token is the worker's own, so a refusal is a deploy
 * without it rather than a site that has no head.html.
 *
 * @param {Object} env worker env. `HLX_CONFIG_SERVICE` is where the read goes and
 * `HLX_CONFIG_SERVICE_TOKEN` authorizes it
 * @param {Object} daCtx
 * @returns {Promise<string|undefined>} undefined when the ref has no head.html
 */
export async function getSiteHead(env, daCtx) {
  const { org, site } = daCtx;
  if (!org || !site) return undefined;

  const response = await askConfigService(env, daCtx, 'pipeline');

  // getSite answers the missing site, and one 404 for the page is enough
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`the config service answered ${response.status}`);

  const { head } = await response.json();
  return head?.html;
}
