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

  if (path.startsWith('/gimme_cookie')) return getCookie({ req, daCtx });

  const resourceRegex = /\.(css|js|js\.map|json|xml|woff|woff2|plain\.html)$/i;
  if (resourceRegex.test(path)) {
    return handleAEMProxyRequest({ req, env, daCtx });
  }

  const assetRegex = /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i;
  if (assetRegex.test(path)) {
    const [daSourceGetRes, aemProxyRes] = await Promise.allSettled([
      daSourceGet({ req, env, daCtx }),
      handleAEMProxyRequest({ req, env, daCtx }),
    ]);

    if (daSourceGetRes.status === 'fulfilled' && daSourceGetRes.value.status === 200) {
      return daSourceGetRes.value;
    }

    if (aemProxyRes.status === 'fulfilled') {
      return aemProxyRes.value;
    }

    return get404();
  }

  if (new URL(req.url).searchParams.get('dapreview') === 'on') {
    return handleAEMProxyRequest({ req, env, daCtx });
  }

  // default route to DA admin for all the content requests
  return daSourceGet({ req, env, daCtx });
}
