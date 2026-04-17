/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

export function getAemCtx(env, daCtx) {
  const {
    org, site, ref, siteToken,
  } = daCtx;

  const obj = {
    previewHostname: `${ref}--${site}--${org}.aem.page`,
    previewUrl: `https://${ref}--${site}--${org}.aem.page`,
    liveHostname: `${ref}--${site}--${org}.aem.live`,
    liveUrl: `https://${ref}--${site}--${org}.aem.live`,
    ueHostname: env.UE_HOST,
    ueService: env.UE_SERVICE,
    siteToken,
  };

  return obj;
}

/**
 * Merges AEM authentication (site token as Authorization header) into the
 * given fetch init options. Required when the AEM site is behind auth.
 * @param {Object} aemCtx The AEM context
 * @param {RequestInit} [init] Additional fetch init options to merge
 * @returns {RequestInit}
 */
export function withAemAuth(aemCtx, init = {}) {
  const headers = new Headers(init.headers);
  if (aemCtx?.siteToken) {
    headers.set('Authorization', aemCtx.siteToken);
  }
  return { ...init, headers };
}

export async function getAEMHtml(aemCtx, path) {
  const { liveUrl } = aemCtx;
  const resp = await fetch(`${liveUrl}${path}`, withAemAuth(aemCtx));
  if (!resp.ok) return undefined;
  const headHtml = await resp.text();
  return headHtml;
}
