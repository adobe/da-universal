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
import { getDaCtx } from './utils/daCtx.js';
import { isTrustedOrigin } from './utils/constants.js';

import getHandler from './handlers/get.js';
import { get404, getRobots } from './responses/index.js';
import headHandler from './handlers/head.js';
import postHandlers from './handlers/post.js';
import unknownHandler from './handlers/unknown.js';
import optionsHandler from './handlers/options.js';

function withCorsHeaders(response, req) {
  const origin = req.headers.get('Origin');
  const headers = new Headers(response.headers);
  if (isTrustedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.delete('Access-Control-Allow-Credentials');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-site-token');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/favicon.ico') return get404();
    if (url.pathname === '/robots.txt') return getRobots();
    if (url.pathname.startsWith('/.rum/')) return new Response(null, { status: 200 });

    const daCtx = getDaCtx(req);

    let resp;
    switch (req.method) {
      case 'OPTIONS':
        resp = await optionsHandler({ req });
        break;
      case 'HEAD':
        resp = await headHandler({ env, daCtx });
        break;
      case 'GET':
        resp = await getHandler({ req, env, daCtx });
        break;
      case 'POST':
        resp = await postHandlers({ req, env, daCtx });
        break;
      default:
        resp = unknownHandler();
    }
    return withCorsHeaders(resp, req);
  },
};
