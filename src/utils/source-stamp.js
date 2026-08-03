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
import { LEGACY, SOURCE_BUS } from '../storage/content-source.js';

/**
 * The query param that carries the stamp on the Universal Editor connection uri.
 *
 * A read and its save are two requests, and a fresh probe on the save can disagree with the one
 * that served the read. The Universal Editor Service fetches and posts back to
 * `editable.connection.uri.toString()` verbatim, so a param on that uri is what links them.
 */
export const SOURCE_STAMP_PARAM = 'ab-src';

const SOURCE_BUS_STAMP = 'sb';
const LEGACY_STAMP = 'da';
const NEW_DOCUMENT = 'new';
// what may go in a url and come back meaning the same thing
const ETAG = /^[A-Za-z0-9._~-]+$/;

function bareEtag(etag) {
  return etag?.replace(/^W\//, '').replace(/"/g, '');
}

/**
 * Stamps a read with the store it came from and, where the store gave one, the version it read.
 *
 * Only the source bus sets an etag on a read, and it is the store holding the content a wrong
 * write would destroy, so that is where the version matters.
 *
 * @param {{kind: string}} source the resolved content source
 * @param {string} [etag] the etag the read returned
 * @param {boolean} [found] whether the read found a document
 * @returns {string} the stamp
 */
export function formatSourceStamp(source, etag, found = false) {
  if (source.kind !== SOURCE_BUS) return LEGACY_STAMP;
  const bare = bareEtag(etag);
  if (bare && ETAG.test(bare)) return `${SOURCE_BUS_STAMP}.${bare}`;
  // no usable etag: either the document is not there yet, so the write may only create it, or it
  // is there but unversioned, so the write may only overwrite it
  return found ? SOURCE_BUS_STAMP : `${SOURCE_BUS_STAMP}.${NEW_DOCUMENT}`;
}

/**
 * Reads a stamp back into the store it names and the precondition a write to it carries.
 *
 * The stamp arrives on a client-supplied url, so nothing is taken on trust: an etag that does not
 * look like an etag makes the whole stamp unusable rather than being passed to a store.
 *
 * @param {string} [value] the raw param value
 * @returns {{kind: string, condition?: Object}|undefined} undefined when there is no stamp to
 * trust, which leaves the fresh probe to decide on its own
 */
export function parseSourceStamp(value) {
  if (!value) return undefined;
  if (value === LEGACY_STAMP) return { kind: LEGACY, condition: undefined };
  if (value === SOURCE_BUS_STAMP) return { kind: SOURCE_BUS, condition: { 'If-Match': '*' } };

  const [store, ...rest] = value.split('.');
  const etag = rest.join('.');
  if (store !== SOURCE_BUS_STAMP || !etag) return undefined;
  if (etag === NEW_DOCUMENT) return { kind: SOURCE_BUS, condition: { 'If-None-Match': '*' } };
  if (!ETAG.test(etag)) return undefined;
  return { kind: SOURCE_BUS, condition: { 'If-Match': `"${etag}"` } };
}
