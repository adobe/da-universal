/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/**
 * Picks the store that holds a site's content, the url the document has in it, and the way to
 * reach it.
 *
 * da-admin answers over a service binding and the source bus over the public network, so one
 * fetch cannot serve both and the caller cannot pick the transport for itself.
 *
 * @param {Object} env worker env
 * @param {Object} daCtx
 * @param {boolean} onSourceBus whether the site is enrolled on the source bus
 */
export default function getStore(env, daCtx, onSourceBus) {
  const { org, site, sourcePath } = daCtx;

  if (onSourceBus) {
    return {
      url: new URL(`/${org}/sites/${site}/source${sourcePath}`, env.AEM_API),
      fetch: (input, init) => fetch(input, init),
    };
  }

  return {
    url: new URL(`/source/${org}/${site}${sourcePath}`, env.DA_ADMIN),
    fetch: (input, init) => env.daadmin.fetch(input, init),
  };
}
