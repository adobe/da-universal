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
 * The header is the answer, and da-nx checks the same header for presence in `isHlx6`. It is read
 * ahead of the status, since a Fastly edge dictionary sets it in front of an origin that may be
 * rate limited or erroring. A refusal without it is no answer at all. Reading a refusal as legacy
 * would send a source-bus write to da-admin, where nothing serves it back, so the read fails.
 *
 * One answer is ambiguous, and this worker cannot resolve it. helix-admin sets the header from the
 * site's content source and swallows a config service failure, so a 200 with no header is either a
 * legacy site or an origin that could not resolve one.
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

  if (response.headers.get(UPGRADE_HEADER) !== null) return true;
  if (!response.ok) throw new Error(`/ping answered ${response.status}`);
  return false;
}
