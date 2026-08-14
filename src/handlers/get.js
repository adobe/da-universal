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
import { get404, getRobots } from '../responses/index.js';
import { handleAEMProxyRequest } from '../routes/aem-proxy.js';
import { getCookie } from '../routes/cookie.js';
import { daSourceGet } from '../routes/da-admin.js';

export default async function getHandler({ req, env, daCtx }) {
  const { path } = daCtx;

  if (!daCtx.site) return get404();
  if (path.startsWith('/favicon.ico')) return get404();
  if (path.startsWith('/robots.txt')) return getRobots();

  if (path.startsWith('/gimme_cookie')) return getCookie({ req, env, daCtx });

  const resourceRegex = /\.(css|js|js\.map|json|xml|woff|woff2|otf|ttf|plain\.html|html)$/i;
  if (resourceRegex.test(path)) {
    return handleAEMProxyRequest({ req, env, daCtx });
  }

  const assetRegex = /\.(png|jpg|jpeg|webp|gif|svg|ico|avif)$/i;
  if (assetRegex.test(path)) {
    const [daSourceGetRes, aemProxyRes] = await Promise.allSettled([
      daSourceGet({ req, env, daCtx }),
      handleAEMProxyRequest({ req, env, daCtx }),
    ]);

    // logs a rejection rather than rethrowing it, since the other read may still answer
    const settled = (result, read) => {
      if (result.status === 'fulfilled') return result.value;
      console.error(`${read} threw on ${path}`, result.reason);
      return undefined;
    };
    const storeRes = settled(daSourceGetRes, 'the store read');
    const aemRes = settled(aemProxyRes, 'the aem proxy');

    let response;
    if (storeRes?.status === 200) {
      response = storeRes;
    } else if (aemRes?.status === 200) {
      response = aemRes;
    } else if (storeRes && storeRes.status >= 500) {
      response = storeRes;
    } else if (aemRes) {
      response = aemRes;
    } else {
      return get404();
    }

    if (/\.svg$/i.test(path)) {
      // deliver SVGs as attachments
      const headers = new Headers(response.headers);
      headers.set('Content-Disposition', 'attachment');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  }

  // all HTML content is composed from the DA source; the preview / quick-edit /
  // UE distinction is applied as a layer on top of that composition inside
  // daSourceGet.
  return daSourceGet({ req, env, daCtx });
}
