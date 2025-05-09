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

import getHandler from './handlers/get.js';
import { get404, getRobots } from './responses/index.js';
import headHandler from './handlers/head.js';
import postHandlers from './handlers/post.js';
import unknownHandler from './handlers/unknown.js';
import optionsHandler from './handlers/options.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/favicon.ico') return get404();
    if (url.pathname === '/robots.txt') return getRobots();

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
    return resp;
  },
};
