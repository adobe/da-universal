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
import { DEFAULT_UNAUTHORIZED_HTML_MESSAGE } from '../utils/constants.js';

const RETRY_AFTER_SECONDS = '5';

export function daResp({
  body, status, contentType, contentLength, headers: extraHeaders,
}) {
  const headers = new Headers();

  if (contentType) {
    headers.append('Content-Type', contentType);
  }
  if (contentLength) {
    headers.append('Content-Length', contentLength);
  } else if (body) {
    headers.append('Content-Length', body.length);
  }

  if (extraHeaders) {
    const entries = Array.isArray(extraHeaders)
      ? extraHeaders
      : Object.entries(extraHeaders);
    entries.forEach(([name, value]) => headers.append(name, value));
  }

  return new Response(body, { status, headers });
}

export function get404(message = '') {
  return daResp({ body: message, status: 404, contentType: 'text/html' });
}

export function get401(message = DEFAULT_UNAUTHORIZED_HTML_MESSAGE) {
  return daResp({ body: message, status: 401, contentType: 'text/html' });
}

export function get415(message = '') {
  return daResp({ body: message, status: 415, contentType: 'text/html' });
}

export function get503(message = '') {
  return daResp({
    body: message,
    status: 503,
    contentType: 'text/html',
    headers: [['Retry-After', RETRY_AFTER_SECONDS]],
  });
}

// a refused write is never rendered. The Universal Editor Service embeds the body verbatim in
// its problem+json error string, so plain text is what an author is shown.
export function post409(message = '') {
  return daResp({ body: message, status: 409, contentType: 'text/plain; charset=utf-8' });
}

export function post503(message = '') {
  return daResp({
    body: message,
    status: 503,
    contentType: 'text/plain; charset=utf-8',
    headers: [['Retry-After', RETRY_AFTER_SECONDS]],
  });
}

export function head401() {
  return new Response(null, { status: 401 });
}

export function head503() {
  return new Response(null, { status: 503, headers: { 'Retry-After': RETRY_AFTER_SECONDS } });
}

export function head404() {
  return new Response(null, { status: 404 });
}

export function getRobots() {
  const body = `User-agent: *
Disallow: /`;

  return daResp({ body, status: 200 });
}
