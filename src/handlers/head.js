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

import { getRobots, head404 } from '../responses/index.js';
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

  if (!daCtx.site) return head404();
  if (path.startsWith('/favicon.ico')) return head404();
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
    }
    const aemResponse = aemHeadRes.status === 'fulfilled' ? aemHeadRes.value : null;
    if (aemResponse && aemResponse.status < 500) {
      return aemResponse;
    }
    return head404();
  }

  // all HTML content is composed from the DA source; the preview / quick-edit /
  // UE distinction only affects the GET response body (see daSourceGet) — HEAD
  // has no body, so it always resolves against the DA source directly.
  return daSourceHead({ env, daCtx });
}
