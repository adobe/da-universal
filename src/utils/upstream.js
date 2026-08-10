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

export const PING = '/ping';
export const CONTENT_STORE = 'content store';
export const AEM_PAGE = 'aem.page';

/**
 * Makes a string safe to append as a header value. A header value cannot span lines, so a
 * message carrying a stack, or a template path out of the site config sheet, would throw
 * where the response is built.
 *
 * @param {*} text
 * @returns {string}
 */
function headerSafe(text) {
  return String(text)
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1024);
}

/**
 * Renders a failure for the `x-error` header.
 *
 * @param {*} e the thrown value, which need not be an Error
 * @returns {string}
 */
export function causeOf(e) {
  return headerSafe(`${e?.name ?? 'Error'}: ${e?.message ?? e}`);
}

/**
 * An upstream did not answer. A status, even a 404, is an answer. The worker boundary puts
 * `error` in the `x-error` header.
 *
 * @param {string} upstream what did not answer
 * @param {*} cause the thrown value
 */
export class UpstreamError extends Error {
  constructor(upstream, cause) {
    const error = headerSafe(`${upstream} failed: ${causeOf(cause)}`);
    super(error);
    this.name = 'UpstreamError';
    this.upstream = upstream;
    this.error = error;
  }
}

/**
 * Sends a request to an upstream and reports a failure to reach it as an UpstreamError.
 * An UpstreamError from a nested call is passed on, so the innermost upstream is the one named.
 *
 * @param {string} upstream what is being reached
 * @param {function(): Promise<*>} send
 * @returns {Promise<*>} whatever `send` resolved to
 */
export async function reach(upstream, send) {
  try {
    return await send();
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(upstream, e);
  }
}
