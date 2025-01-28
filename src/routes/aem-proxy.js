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
import { getAemCtx } from '../utils/aem.js';

export async function handleAEMProxyRequest({ req, env, daCtx }) {
  const aemCtx = getAemCtx(env, daCtx);
  const { search } = new URL(req.url);
  const aemUrl = new URL(`${daCtx.aemPathname}${search}`, aemCtx.liveUrl);
  // eslint-disable-next-line no-param-reassign
  req = new Request(aemUrl, req);
  req.headers.set('Origin', new URL(aemCtx.liveUrl).origin);
  let response = await fetch(req);
  response = new Response(response.body, response);
  response.headers.set('Access-Control-Allow-Origin', aemUrl.origin);
  return response;
}
