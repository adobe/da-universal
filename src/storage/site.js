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
const NO_SITE = { exists: false, head: undefined };

/**
 * Asks the config service whether a site exists, and reads its head.html from the same answer.
 *
 * The pipeline scope has the code bus object the delivery pipeline renders into every page of the
 * site. A site behind Helix authentication refuses `{ref}--{site}--{org}.aem.page/head.html` to a
 * request with no site token, and the config service does not. The admin scope answers existence
 * too, and its answer has the site's CDN token and API key metadata.
 *
 * Throws on any refusal but a 404, which is the only status that means there is no such site. A
 * ref that was never built exists and has no head.html, which is a 200 with an empty head.
 *
 * @param {Object} env worker env. `HLX_CONFIG_SERVICE` is where the lookup goes and
 * `HLX_CONFIG_SERVICE_TOKEN` authorizes it
 * @param {Object} daCtx
 * @returns {Promise<{exists: boolean, head: string|undefined}>}
 */
export default async function getSite(env, daCtx) {
  const {
    org, site, ref,
  } = daCtx;
  // an unparseable hostname leaves org and site undefined, and there is no site to ask about
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

  const { head } = await response.json();
  return { exists: true, head: head?.html };
}
