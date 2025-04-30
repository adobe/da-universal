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

export function getCookie({ req }) {
  const { headers } = req;

  if (!TRUSTED_ORIGINS.includes(headers.get('Origin'))) return daResp({ body: '403 Forbidden', status: 403, contentType: 'text/plain' });

  const authToken = headers.get('Authorization');
  if (authToken) {
    const cookieValue = authToken.split(' ')[1];

    if (cookieValue) {
      const respHeaders = { ...DEFAULT_CORS_HEADERS };
      respHeaders['Content-Type'] = 'text/plain';
      respHeaders['Set-Cookie'] = `auth_token=${cookieValue}; Secure; Path=/; HttpOnly; SameSite=None; Partitioned; Max-Age=84600`;
      return new Response('cookie set', { headers: respHeaders });
    }
  }
  return daResp({ body: '401 Unauthorized', status: 401, contentType: 'text/plain' });
}
