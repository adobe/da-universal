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

async function fetchConfig(daCtx, path) {
  const base = 'https://admin.da.live';

  const headers = new Headers();
  if (daCtx.authToken) {
    headers.set('authorization', daCtx.authToken);
  }
  const opts = { headers };

  const res = await fetch(`${base}${path}`, opts);
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  return json?.data;
}

export async function getSiteConfig(daCtx) {
  return fetchConfig(daCtx, `/config/${daCtx.org}/${daCtx.site}`);
}

export async function getOrgConfig(daCtx) {
  return fetchConfig(daCtx, `/config/${daCtx.org}`);
}
