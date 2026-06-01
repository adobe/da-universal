/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { getAemCtx } from '../utils/aemCtx.js';
import { applyQuickEditToScript, isQuickEditScriptPath } from '../utils/quick-edit.js';

export async function handleAEMProxyRequest({ req, env, daCtx }) {
  const requestUrl = new URL(req.url);
  const aemCtx = getAemCtx(env, daCtx);
  const { search } = requestUrl;
  const aemUrl = new URL(`${daCtx.aemPathname}${search}`, aemCtx.previewUrl);
  // eslint-disable-next-line no-param-reassign
  req = new Request(aemUrl, req);
  req.headers.set('Origin', new URL(aemCtx.previewUrl).origin);

  // Add site token if available
  if (daCtx.siteToken) {
    req.headers.set('Authorization', daCtx.siteToken);
  }

  // We inject the quick-edit bootstrap into scripts/scripts.js as it is served,
  // rather than touching the HTML page (inlining ran scripts.js twice). The JS
  // request carries no quick-edit param, so detect it by path and gate at
  // runtime inside the appended bootstrap.
  const isScript = isQuickEditScriptPath(requestUrl.pathname);

  // Request an uncompressed body when we are going to transform it.
  if (isScript) {
    req.headers.delete('Accept-Encoding');
  }

  console.log(`-> ${aemUrl.toString()}`);
  let response = await fetch(req, { cf: { cacheTtl: 0 } });
  console.log(`<- ${aemUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });

  const contentType = response.headers.get('Content-Type') || '';
  const isJsResponse = contentType.toLowerCase().includes('javascript');
  if (isScript && response.ok && isJsResponse) {
    console.log('[quick-edit] scripts/scripts.js detected, attempting bootstrap injection');
    response = await applyQuickEditToScript(response);
  } else {
    if (isScript) {
      console.log(`[quick-edit] skip scripts.js injection (ok=${response.ok}, content-type=${contentType})`);
    }
    response = new Response(response.body, response);
  }

  response.headers.set('Access-Control-Allow-Origin', aemUrl.origin);
  return response;
}
