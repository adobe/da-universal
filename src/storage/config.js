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
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  if (!json) return [];
  const data = getFirstSheet(json);
  return data;
}

export async function getSiteConfig(env, daCtx) {
  return fetchConfig(env, daCtx, `/config/${daCtx.org}/${daCtx.site}`);
}

export async function getOrgConfig(env, daCtx) {
  return fetchConfig(env, daCtx, `/config/${daCtx.org}`);
}
