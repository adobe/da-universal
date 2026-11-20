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
import { PREVIEW_HOST, withUpstream } from '../utils/upstream.js';

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

  console.log(`-> ${aemUrl.toString()}`);
  const response = await withUpstream(PREVIEW_HOST, () => fetch(req, { cf: { cacheTtl: 0 } }));
  console.log(`<- ${aemUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });

  return new Response(response.body, response);
}
