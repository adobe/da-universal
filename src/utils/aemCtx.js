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
import { fromHtml } from 'hast-util-from-html';
import { selectAll } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';

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
  const { previewUrl } = aemCtx;
  const url = `${previewUrl}${path}`;
  const resp = await fetch(url, withAemAuth(aemCtx));
  // a ref that was never previewed answers 404, and a host behind Helix auth refuses without a
  // site token. both answered, so the page is built without the fragment
  if (resp.status === 404 || resp.status === 401 || resp.status === 403) {
    if (resp.status !== 404) console.warn(`${url} answered ${resp.status}, using no fragment`);
    return undefined;
  }
  if (!resp.ok) throw new Error(`${url} answered ${resp.status}`);
  const headHtml = await resp.text();
  return headHtml;
}

/**
 * Prefix AEM head.html script/link URLs with /{org}/{site} on localhost dev.
 * No-op on hosted UE hosts where the site already lives at the URL root.
 * TODO: reuse with injectAEMHtmlHeadEntries in ue.js (same localhost rewrite).
 * @param {string} headHtml
 * @param {object} daCtx
 * @returns {string}
 */
export function fixUrlsWhenLocalDev(headHtml, daCtx) {
  if (!headHtml) return '';
  const { org, site, orgSiteInPath } = daCtx;
  if (!orgSiteInPath) return headHtml;

  const tree = fromHtml(headHtml, { fragment: true });
  selectAll('script[src], link[href]', tree).forEach((node) => {
    const attrName = node.tagName === 'script' ? 'src' : 'href';
    const url = node.properties[attrName];
    if (!url.startsWith('http') && !url.startsWith(`/${org}/${site}`)) {
      // eslint-disable-next-line no-param-reassign
      node.properties[attrName] = `/${org}/${site}${url}`;
    }
  });
  return toHtml(tree, { allowDangerousHtml: true });
}
