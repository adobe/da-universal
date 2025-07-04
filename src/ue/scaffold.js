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

import { fromHtml } from 'hast-util-from-html';
import { h } from 'hastscript';

export function getHtmlDoc() {
  const htmlDocStr = '<!DOCTYPE html><html><head></head><body></body></html>';
  return fromHtml(htmlDocStr);
}

export function getUEHtmlHeadEntries(daCtx, aemCtx) {
  const {
    org,
    site,
    ref,
    path,
    aemPathname,
    isLocal,
    orgSiteInPath,
  } = daCtx;
  const { ueHostname, ueService } = aemCtx;
  const children = [];

  children.push(h('meta', {
    name: 'urn:adobe:aue:system:ab',
    content: isLocal ? `da:https://${ueHostname}/${org}/${site}${path}` : `da:https://${ref}--${site}--${org}.${ueHostname}${path}`,
  }));

  if (ueService) {
    children.push(
      h('meta', {
        name: 'urn:adobe:aue:config:service',
        content: ueService,
      }),
    );
  }
  children.push(
    h('script', {
      src: 'https://universal-editor-service.adobe.io/cors.js',
      async: '',
    }),
  );
  children.push(
    h('script', {
      type: 'application/vnd.adobe.aue.component+json',
      src: orgSiteInPath
        ? `/${org}/${site}/component-definition.json`
        : '/component-definition.json',
    }),
  );
  children.push(
    h('script', {
      type: 'application/vnd.adobe.aue.model+json',
      src: orgSiteInPath
        ? `/${org}/${site}/component-models.json`
        : '/component-models.json',
    }),
  );
  children.push(
    h('script', {
      type: 'application/vnd.adobe.aue.filter+json',
      src: orgSiteInPath
        ? `/${org}/${site}/component-filters.json`
        : '/component-filters.json',
    }),
  );

  children.push(
    h('meta', {
      name: 'urn:adobe:aue:config:preview',
      content: `https://${ref}--${site}--${org}.aem.page${aemPathname}`,
    }),
  );

  return children;
}

export async function getUEConfig(aemCtx) {
  const { liveUrl: host } = aemCtx;
  const jsonUrls = [
    {
      type: 'component-definition',
      url: `${host}/component-definition.json`,
    },
    {
      type: 'component-model',
      url: `${host}/component-models.json`,
    },
    {
      type: 'component-filter',
      url: `${host}/component-filters.json`,
    },
  ];

  const responses = await Promise.all(
    jsonUrls.map(({ type, url }) => fetch(url)
      .then((response) => response
        .json()
        .then((data) => ({ type, data }))
        .catch(() => ({ type, undefined })))
      .catch((error) => console.error(`Error fetching ${url}: ${error}`))),
  );
  const ueConfig = responses.reduce((acc, response) => {
    if (response) {
      const { type, data } = response;
      acc[type] = data;
    } else {
      // if response is undefined, ensure we have default values
      jsonUrls.forEach(({ type }) => {
        if (!acc[type]) {
          acc[type] = undefined;
        }
      });
    }
    return acc;
  }, {});

  return ueConfig;
}
