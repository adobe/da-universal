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

import { getFirstSheet } from '../utils/sheet.js';

async function fetchConfig(env, daCtx, path) {
  const headers = new Headers();
  if (daCtx.authToken) {
    headers.set('Authorization', daCtx.authToken);
  }
  const opts = { headers };
  const configUrl = new URL(path, env.DA_ADMIN);

  const res = await env.daadmin.fetch(configUrl, opts);
  // a site with no config answers 404, and an author who may not read it is refused 403. both
  // answered, so the starter template is used rather than refusing the request
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    if (res.status !== 404) console.warn(`${configUrl} answered ${res.status}, using no config`);
    return null;
  }
  if (!res.ok) throw new Error(`${configUrl} answered ${res.status}`);
  const json = await res.json();
  if (!json) return [];
  const data = getFirstSheet(json);
  return data;
}

export async function getEditorConfig(env, daCtx) {
  return fetchConfig(env, daCtx, `/config/${daCtx.org}/${daCtx.site}`);
}
