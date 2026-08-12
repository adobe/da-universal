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
const UPGRADE_HEADER = 'x-api-upgrade-available';

/**
 * Asks `/ping` whether a site is on the source bus.
 *
 * An answer without the header is legacy: helix-admin sets it when config resolution succeeded and
 * named the API, and a Fastly edge dictionary sets it for a site being moved onto the new API
 * ahead of its content. A probe that cannot answer throws, so the caller refuses with the cause
 * rather than picking a store.
 *
 * @param {Object} env worker env, `HLX_ADMIN` is where the probe goes
 * @param {Object} daCtx
 * @returns {Promise<boolean>}
 */
export default async function isSourceBus(env, daCtx) {
  const { org, site } = daCtx;
  // an unparseable hostname leaves org and site undefined, and there is no site to ask about
  if (!org || !site) return false;

  const url = new URL(`/ping/${org}/${site}`, env.HLX_ADMIN);
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return response.headers.get(UPGRADE_HEADER) !== null;
}
