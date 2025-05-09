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
export function daResp({
  body, status, contentType, contentLength,
}) {
  const headers = new Headers();
  headers.append('Access-Control-Allow-Origin', '*');

  if (contentType) {
    headers.append('Content-Type', contentType);
  }
  if (contentLength) {
    headers.append('Content-Length', contentLength);
  } else if (body) {
    headers.append('Content-Length', body.length);
  }

  return new Response(body, { status, headers });
}

export function get404() {
  return daResp({ body: '', status: 404 });
}

export function getRobots() {
  const body = `User-agent: *
Disallow: /`;

  return daResp({ body, status: 200 });
}
