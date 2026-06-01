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
import {
  applyQuickEditToScript,
  buildQuickEditCookie,
  findEntryScriptPath,
  getQuickEditCookiePath,
} from '../utils/quick-edit.js';

export async function handleAEMProxyRequest({ req, env, daCtx }) {
  const requestUrl = new URL(req.url);
  const cookieHeader = req.headers.get('Cookie');
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

  // Quick-edit detection is two-phase. On the initial document load
  // (?quick-edit), we discover the project's entry script from the HTML and
  // remember its exact path in a cookie. The follow-up script request carries
  // no param, so we recognize it by matching that cookie — which handles entry
  // scripts in subfolders and ignores unrelated files named scripts.js.
  const wantsQuickEdit = requestUrl.searchParams.has('quick-edit');
  const cookiePath = getQuickEditCookiePath(cookieHeader);
  const isEntryScript = !!cookiePath && cookiePath === daCtx.aemPathname;

  // Request an uncompressed body whenever we are going to read it (to scan the
  // doc for the entry script, or to inject the bootstrap). Otherwise the body
  // comes back gzip/brotli encoded and re-emitting it with the origin's
  // Content-Encoding header yields garbled output.
  if (wantsQuickEdit || isEntryScript) {
    req.headers.delete('Accept-Encoding');
  }

  console.log(`-> ${aemUrl.toString()}`);
  let response = await fetch(req, { cf: { cacheTtl: 0 } });
  console.log(`<- ${aemUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });

  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html');
  const isJs = contentType.includes('javascript');

  if (wantsQuickEdit && isHtml && response.ok) {
    // Initial quick-edit document: remember the entry script location.
    const html = await response.text();
    const entryPath = findEntryScriptPath(html);
    const headers = new Headers(response.headers);
    // Body has been decoded to text; drop headers that describe the encoded form.
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');
    if (entryPath) {
      console.log(`[quick-edit] doc load: entry script ${entryPath} found, setting cookie`);
      headers.append('Set-Cookie', buildQuickEditCookie(entryPath));
    } else {
      console.log('[quick-edit] doc load: no <script src="…/scripts.js"> found in html');
    }
    response = new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } else if (isEntryScript && response.ok && isJs) {
    console.log(`[quick-edit] entry script ${daCtx.aemPathname} matched cookie, attempting bootstrap injection`);
    response = await applyQuickEditToScript(response);
  } else {
    if (isEntryScript) {
      console.log(`[quick-edit] skip injection for ${daCtx.aemPathname} (ok=${response.ok}, content-type=${contentType})`);
    }
    response = new Response(response.body, response);
  }

  response.headers.set('Access-Control-Allow-Origin', aemUrl.origin);
  return response;
}
