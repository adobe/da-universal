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
import { selectAll } from 'hast-util-select';

const CONTENT_HOSTS = ['content.da.live', 'stage-content.da.live'];
const PROP_BY_TAG = { img: 'src', source: 'srcSet' };

function stripContentPrefix(url, org, site) {
  for (const host of CONTENT_HOSTS) {
    const prefix = `https://${host}/${org}/${site}`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length) || '/';
    }
  }
  return null;
}

export function rewriteToRelative(bodyTree, daCtx) {
  const { org, site } = daCtx;
  const elements = selectAll('img, picture > source', bodyTree);
  elements.forEach((el) => {
    const prop = PROP_BY_TAG[el.tagName];
    if (prop && el.properties[prop]) {
      const rewritten = stripContentPrefix(el.properties[prop], org, site);
      if (rewritten !== null) {
        el.properties[prop] = rewritten;
      }
    }
  });
}

export function rewriteToAbsolute(bodyTree, daCtx) {
  const { org, site } = daCtx;
  const base = `https://${CONTENT_HOSTS[0]}/${org}/${site}`;
  const toAbsolute = (url) => (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
    ? base + (url === '/' ? '' : url) : null);
  const elements = selectAll('img, picture > source', bodyTree);
  elements.forEach((el) => {
    const prop = PROP_BY_TAG[el.tagName];
    if (!prop || !el.properties[prop]) return;
    const rewritten = toAbsolute(el.properties[prop]);
    if (rewritten !== null) {
      el.properties[prop] = rewritten;
    }
  });
}
