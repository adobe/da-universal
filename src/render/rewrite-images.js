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
      return { path: url.slice(prefix.length) || '/', host };
    }
  }
  return null;
}

function addContentPrefix(url, org, site, host = CONTENT_HOSTS[0]) {
  if (!url.startsWith('http') && !url.startsWith('//')) {
    return `https://${host}/${org}/${site}${url}`;
  }
  return url;
}

export function makeImagesRelative(bodyTree, daCtx) {
  const { org, site } = daCtx;
  const elements = selectAll('img, picture > source', bodyTree);
  const propByTag = { img: 'src', source: 'srcSet' };
  elements.forEach((el) => {
    const prop = propByTag[el.tagName];
    if (prop && el.properties[prop]) {
      const result = stripContentPrefix(el.properties[prop], org, site);
      if (result !== null) {
        el.properties[prop] = result.path;
        el.properties.dataDaImgHost = result.host;
      }
    }
  });
}

export function restoreAbsoluteImages(bodyTree, daCtx) {
  const { org, site } = daCtx;
  const elements = selectAll('img, picture > source', bodyTree);
  const propByTag = { img: 'src', source: 'srcSet' };
  elements.forEach((el) => {
    const prop = propByTag[el.tagName];
    if (prop && el.properties[prop]) {
      const host = el.properties.dataDaImgHost;
      el.properties[prop] = addContentPrefix(el.properties[prop], org, site, host);
      delete el.properties.dataDaImgHost;
    }
  });
}
