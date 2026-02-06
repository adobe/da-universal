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

export default function rewrite(bodyTree, daCtx) {
  const { org, site } = daCtx;
  const prefix = `https://content.da.live/${org}/${site}`;
  const images = selectAll('img', bodyTree);
  images.forEach((img) => {
    const { src } = img.properties;
    if (src.startsWith(prefix)) {
      img.properties.src = src.slice(prefix.length) || '/';
    }
  });

  const pictures = selectAll('picture', bodyTree);
  pictures.forEach((picture) => {
    const sources = selectAll('source', picture);
    sources.forEach((source) => {
      const { srcset } = source.properties;
      if (!srcset) return;
      if (srcset.startsWith(prefix)) {
        source.properties.srcset = srcset.slice(prefix.length) || '/';
      }
    });
  });
}
