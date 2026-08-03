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
 * A read and its save are two requests, and a fresh lookup on the save can disagree with the one
 * that served the read. The Universal Editor Service fetches and posts back to
 * `editable.connection.uri.toString()` verbatim, so a param on that uri is what links them.
 */
export const SOURCE_STAMP_PARAM = 'ab-src';

const SOURCE_BUS_STAMP = 'sb';
const LEGACY_STAMP = 'da';
const NEW_DOCUMENT = 'new';

/**
 * Stamps a read with the store it came from, and whether it found a document there.
 *
 * The stamp says nothing about which version was read. One page load produces many saves: the
 * editor keeps the connection uri it was served and posts back to it for every edit, so a
 * precondition pinned to a version would land the first save and refuse the rest. Nothing on the
 * write path can refresh it either, because the source bus sets no etag on a write response.
 *
 * @param {{kind: string}} source the resolved content source
 * @param {boolean} [found] whether the read found a document
 * @returns {string} the stamp
 */
export function formatSourceStamp(source, found = false) {
  if (source.kind !== SOURCE_BUS) return LEGACY_STAMP;
  return found ? SOURCE_BUS_STAMP : `${SOURCE_BUS_STAMP}.${NEW_DOCUMENT}`;
}

/**
 * Reads a stamp back into the store it names and the precondition a write to it carries.
 *
 * Each precondition holds for every save in a session, not only the first. `If-Match: *` asks the
 * source bus that the document exist, which it does once created; a read that found nothing
 * carries no precondition, so the save creates the document and the next one overwrites it.
 *
 * The stamp arrives on a client-supplied url, so a value that is not one of the three forms makes
 * the whole stamp unusable rather than being passed to a store.
 *
 * @param {string} [value] the raw param value
 * @returns {{kind: string, condition?: Object}|undefined} undefined when there is no stamp to
 * trust, which leaves the fresh lookup to decide on its own
 */
export function parseSourceStamp(value) {
  if (value === LEGACY_STAMP) return { kind: LEGACY, condition: undefined };
  if (value === SOURCE_BUS_STAMP) return { kind: SOURCE_BUS, condition: { 'If-Match': '*' } };
  if (value === `${SOURCE_BUS_STAMP}.${NEW_DOCUMENT}`) {
    return { kind: SOURCE_BUS, condition: undefined };
  }
  return undefined;
}
