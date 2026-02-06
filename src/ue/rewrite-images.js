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

function stripContentPrefix(url, org, site) {
  for (const host of CONTENT_HOSTS) {
    const prefix = `https://${host}/${org}/${site}`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length) || '/';
    }
  }
  return null;
}

export default function rewrite(bodyTree, daCtx) {
  const { org, site } = daCtx;
  const elements = selectAll('img, picture > source', bodyTree);
  elements.forEach((el) => {
    if (el.tagName === 'img') {
      const { src } = el.properties;
      const rewritten = stripContentPrefix(src, org, site);
      if (rewritten !== null) {
        el.properties.src = rewritten;
      }
    } else if (el.tagName === 'source') {
      const { srcSet } = el.properties;
      if (!srcSet) return;
      const rewritten = stripContentPrefix(srcSet, org, site);
      if (rewritten !== null) {
        el.properties.srcSet = rewritten;
      }
    }
  });
}
