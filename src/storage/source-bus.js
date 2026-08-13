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

/**
 * Asks the config service which store holds a site's content based on `content.source`
 * A 404 means there is no such site, which the site lookup reports. Any other refusal is no
 * answer at all: reading it as legacy would send a source-bus write to da-admin
 *
 * @param {Object} env worker env. `HLX_CONFIG_SERVICE` is where the lookup goes,
 * `HLX_CONFIG_SERVICE_TOKEN` authorizes it and `AEM_API` is the source bus
 * @param {Object} daCtx
 * @returns {Promise<boolean>}
 */
export default async function isSourceBus(env, daCtx) {
  const { org, site, ref } = daCtx;
  if (!org || !site) return false;

  const url = new URL(`/${ref}--${site}--${org}/config.json?scope=admin`, env.HLX_CONFIG_SERVICE);
  const response = await fetch(url, {
    headers: {
      'x-access-token': env.HLX_CONFIG_SERVICE_TOKEN,
      'x-backend-type': 'aws',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`the config service answered ${response.status}`);

  const { content } = await response.json();
  const source = content?.source?.url;
  if (!source) throw new Error('the config service named no content source');
  return source.startsWith(`${env.AEM_API}/`);
}
