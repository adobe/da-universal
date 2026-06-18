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
import { daSourceHead } from '../routes/da-admin.js';

// for AEM we reuse the handleAEMProxyRequest for now as GETs are cheap here
// TODO refine and review for later for a full HEAD requests on AEM
async function aemHead({ req, env, daCtx }) {
  const getReq = new Request(req, { method: 'GET' });
  const resp = await handleAEMProxyRequest({ req: getReq, env, daCtx });
  return new Response(null, { status: resp.status, headers: resp.headers });
}

export default async function headHandler({ req, env, daCtx }) {
  const { path } = daCtx;

  if (!daCtx.site) return get404();
  if (path.startsWith('/favicon.ico')) return get404();
  if (path.startsWith('/robots.txt')) return getRobots();

  const resourceRegex = /\.(css|js|js\.map|json|xml|woff|woff2|otf|ttf|plain\.html)$/i;
  if (resourceRegex.test(path)) {
    return aemHead({ req, env, daCtx });
  }

  const assetRegex = /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i;
  if (assetRegex.test(path)) {
    const [daSourceHeadRes, aemHeadRes] = await Promise.allSettled([
      daSourceHead({ env, daCtx }),
      aemHead({ req, env, daCtx }),
    ]);

    if (daSourceHeadRes.status === 'fulfilled' && daSourceHeadRes.value.status === 200) {
      return daSourceHeadRes.value;
    } else if (aemHeadRes.status === 'fulfilled') {
      return aemHeadRes.value;
    } else {
      return get404();
    }
  }

  const url = new URL(req.url);
  const isPreviewHost = url.hostname.endsWith('.preview.da.live') || url.hostname.endsWith('.stage-preview.da.live');

  if (
    url.searchParams.get('dapreview') === 'on'
    || isPreviewHost
    || url.searchParams.has('quick-edit')
  ) {
    return aemHead({ req, env, daCtx });
  }

  return daSourceHead({ env, daCtx });
}
