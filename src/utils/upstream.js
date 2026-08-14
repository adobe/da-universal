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

/** Names the upstream in the worker log and in `x-error`. */
export const PREVIEW_HOST = 'preview host';
export const CONTENT_STORE = 'content store';
export const EDITOR_CONFIG = 'editor config';
export const SITE_LOOKUP = 'site lookup';

/**
 * Renders a failure for the `x-error` header.
 */
export function causeOf(e) {
  return `${e?.name ?? 'Error'}: ${e?.message ?? e}`
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1024);
}

/**
 * Thrown when a read has no answer to use: the upstream was not reached, or answered a status the
 * reader threw on. A store response is handed back whatever its status, and the route decides.
 *
 * @property {string} upstream one of the names at the top of this file
 */
export class UpstreamError extends Error {
  constructor(upstream, cause) {
    super(`${upstream} failed: ${causeOf(cause)}`, { cause });
    this.name = 'UpstreamError';
    this.upstream = upstream;
  }
}

/**
 * Runs `read` and rethrows anything it throws as an UpstreamError naming `upstream`.
 *
 * @param {string} upstream one of the names at the top of this file
 * @param {() => Promise<T>} read
 * @returns {Promise<T>}
 * @template T
 */
export async function reach(upstream, read) {
  try {
    return await read();
  } catch (e) {
    // keeps the inner upstream name rather than overwriting it
    if (e instanceof UpstreamError) throw e;
    throw new UpstreamError(upstream, e);
  }
}
