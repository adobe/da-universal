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

import { daResp } from '../responses/index.js';
import { DEFAULT_CORS_HEADERS, TRUSTED_ORIGINS } from '../utils/constants.js';

export default async function optionsHandler({ req }) {
  const { headers } = req;

  if (!TRUSTED_ORIGINS.includes(headers.get('Origin'))) return daResp({ body: '403 Forbidden', status: 403, contentType: 'text/plain' });

  if (
    headers.get('Origin') !== null
    && headers.get('Access-Control-Request-Method') !== null
    && headers.get('Access-Control-Request-Headers') !== null
  ) {
    const respHeaders = { ...DEFAULT_CORS_HEADERS };
    respHeaders['Access-Control-Allow-Origin'] = req.headers.get('Origin');

    return new Response(null, {
      status: 204,
      headers: respHeaders,
    });
  } else {
    return new Response(null, {
      headers: {
        'Access-Control-Request-Method': 'GET, HEAD, POST, OPTIONS',
      },
    });
  }
}
