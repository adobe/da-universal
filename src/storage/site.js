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
const NO_SITE = { exists: false, head: undefined, onSourceBus: false };

/**
 * Asks the config service whether a site exists, what its head.html is and which store holds it.
 *
 * A site behind Helix authentication refuses `{ref}--{site}--{org}.aem.page/head.html` without a
 * site token, and the config service does not. `contentSource.url` names the store, since both
 * stores are `type: markup`.
 *
 * Throws on any refusal but a 404, which is the only status that means there is no such site. A ref
 * that was never built exists and has no head.html, which is a 200 with an empty head.
 *
 * @param {Object} env worker env. `HLX_CONFIG_SERVICE` is where the lookup goes,
 * `HLX_CONFIG_SERVICE_TOKEN` authorizes it and `AEM_API` is the source bus
 * @param {Object} daCtx
 * @returns {Promise<{exists: boolean, head: string|undefined, onSourceBus: boolean}>}
 */
export default async function getSiteConfig(env, daCtx) {
  const { org, site, ref } = daCtx;
  if (!org || !site) return NO_SITE;

  const url = new URL(`/${ref}--${site}--${org}/config.json?scope=pipeline`, env.HLX_CONFIG_SERVICE);
  const response = await fetch(url, {
    headers: {
      'x-access-token': env.HLX_CONFIG_SERVICE_TOKEN,
      'x-backend-type': 'aws',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 404) return NO_SITE;
  if (!response.ok) throw new Error(`the config service answered ${response.status}`);

  const { head, contentSource } = await response.json();
  // a config that names no store is read as legacy
  if (!contentSource?.url) {
    console.warn(`${url} named no content source, reading ${org}/${site} as legacy`);
  }

  return {
    exists: true,
    head: head?.html,
    onSourceBus: Boolean(contentSource?.url?.startsWith(`${env.AEM_API}/`)),
  };
}
