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
import { SOURCE_BUS } from './content-source.js';

/**
 * Restores the case the source bus stores a file under.
 *
 * helix-api-service sanitizes the basename and nothing else: `computePaths` pops the filename,
 * runs `sanitizeName` on it and recombines the directory segments untouched. The extension comes
 * back verbatim too. `daCtx.sourcePath` lowercases the whole path, which is what da-admin wants
 * and what the source bus 404s on.
 *
 * @param {Object} daCtx
 * @returns {string} the store path, directory and extension in the case they were requested
 */
export function sourceBusPath({ path, sourcePath }) {
  const dirEnd = path.lastIndexOf('/');
  const base = sourcePath.slice(sourcePath.lastIndexOf('/') + 1);
  const baseDot = base.lastIndexOf('.');
  const requestedDot = path.lastIndexOf('.');
  // an extension the request carried keeps its case; the `.html` we appended does not have one
  const ext = requestedDot > dirEnd ? path.slice(requestedDot) : base.slice(baseDot);
  return `${path.slice(0, dirEnd)}/${base.slice(0, baseDot)}${ext}`;
}

/**
 * Picks the store for a request, the way to reach it, and the shape it takes a write in.
 *
 * da-admin answers over a service binding and the source bus over the public network, so one
 * fetch cannot serve both. They also differ on the write body: helix-api-service reads the raw
 * request body and types it from the path extension, parsing no form data anywhere, while
 * da-admin takes the document as a `data` form part. Handing either the other's shape stores
 * something other than the document and answers 201.
 *
 * @param {Object} env worker env
 * @param {Object} daCtx
 * @param {{kind: string, base?: string}} source the resolved content source
 */
export default function getStore(env, daCtx, source) {
  const { org, site, sourcePath } = daCtx;

  if (source.kind === SOURCE_BUS) {
    return {
      url: new URL(`${source.base}${sourceBusPath(daCtx)}`),
      fetch: (input, init) => fetch(input, init),
      writeInit: (html, authToken) => ({
        method: 'POST',
        body: html,
        headers: { Authorization: authToken, 'Content-Type': 'text/html' },
      }),
    };
  }

  return {
    url: new URL(`/source/${org}/${site}${sourcePath}`, env.DA_ADMIN),
    fetch: (input, init) => env.daadmin.fetch(input, init),
    writeInit: (html, authToken) => {
      const body = new FormData();
      body.set('data', new Blob([html], { type: 'text/html' }));
      return { method: 'POST', body, headers: { Authorization: authToken } };
    },
  };
}
