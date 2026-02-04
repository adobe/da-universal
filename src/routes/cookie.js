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
import { daResp, get401 } from '../responses/index.js';
import { DEFAULT_CORS_HEADERS, isTrustedOrigin } from '../utils/constants.js';

async function exchangeSiteToken(org, site, accessToken) {
  try {
    const response = await fetch('https://admin.hlx.page/auth/adobe/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        org,
        site,
        accessToken,
      }),
    });

    if (!response.ok) {
      // 401/403 error cases
      return null;
    }

    const data = await response.json();

    // If site doesn't require auth, data will be empty object
    if (!data.siteToken) {
      return null;
    }

    return {
      siteToken: data.siteToken,
      siteTokenExpiry: data.siteTokenExpiry,
    };
  } catch (error) {
    console.error('Error exchanging site token:', error);
    return null;
  }
}

export async function getCookie({ req, daCtx }) {
  const { headers } = req;

  if (!isTrustedOrigin(headers.get('Origin'))) return daResp({ body: '403 Forbidden', status: 403, contentType: 'text/plain' });

  const authToken = headers.get('Authorization');
  if (authToken) {
    const cookieValue = authToken.split(' ')[1];

    if (cookieValue) {
      const { org, site } = daCtx;

      const respHeaders = new Headers();
      respHeaders.append('Content-Type', 'text/plain');
      respHeaders.append('Set-Cookie', `auth_token=${cookieValue}; Secure; Path=/; HttpOnly; SameSite=None; Partitioned; Max-Age=84600`);

      // Try to exchange for site token
      if (org && site) {
        const siteTokenData = await exchangeSiteToken(org, site, cookieValue);
        if (siteTokenData) {
          // Calculate Max-Age based on token expiry time (siteTokenExpiry is in milliseconds)
          const now = Date.now();
          const maxAge = Math.floor((siteTokenData.siteTokenExpiry - now) / 1000);
          respHeaders.append('Set-Cookie', `site_token=${siteTokenData.siteToken}; Secure; Path=/; HttpOnly; SameSite=None; Partitioned; Max-Age=${maxAge}`);
        }
      }

      respHeaders.append('Access-Control-Allow-Origin', req.headers.get('Origin'));
      Object.entries(DEFAULT_CORS_HEADERS).forEach(([key, value]) => {
        respHeaders.append(key, value);
      });

      return new Response('cookie set', { headers: respHeaders });
    }
  }
  return get401();
}
