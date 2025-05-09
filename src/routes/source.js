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


import { getAemCtx, getAEMHtml } from '../utils/aemCtx.js';
import { prepareHtml } from '../ue/ue.js';
import getObject from '../storage/object.js';
import { getSiteConfig } from '../storage/config.js';

async function getDefaultSource(daCtx, aemCtx, headHtml) {
  const defaultSource = '<body><header></header><main><div></div></main><footer></footer></body>';
  const responseHtml = await prepareHtml(daCtx, aemCtx, defaultSource, headHtml);

  return {
    body: responseHtml,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    contentLength: responseHtml.length,
  };
}

async function getPageTemplate(daCtx, aemCtx, headHtml) {
  let config;
  try {
    config = await getSiteConfig(daCtx);
  } catch (e) {
    return getDefaultSource(daCtx, aemCtx, headHtml);
  }

  // Search whether a template is configured for this path
  const matchingTemplates = config
    ?.filter((conf) => conf.key === 'editor.ue.template')
    .map((conf) => {
      const [prefix, template] = conf.value.split('=');
      return { prefix, template };
    })
    .filter(({ prefix, template }) => prefix && template && daCtx.path.startsWith(prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  if (matchingTemplates?.length <= 0) {
    return getDefaultSource(daCtx, aemCtx, headHtml);
  }

  const templatePath = matchingTemplates[0].template;

  // return a template for new page if no content found
  const templateHtml = await getAEMHtml(aemCtx, templatePath);

  if (!templateHtml) {
    return getDefaultSource(daCtx, aemCtx, headHtml);
  }

  const responseHtml = await prepareHtml(daCtx, aemCtx, templateHtml, headHtml);
  return {
    body: responseHtml,
    status: 200,
    contentType: 'text/html; charset=utf-8',
    contentLength: responseHtml.length,
  };
}

export async function getSource({ env, daCtx }) {
  // get the AEM parts (head.html)
  const aemCtx = getAemCtx(env, daCtx);
  const headHtml = await getAEMHtml(aemCtx, '/head.html');
  if (!headHtml) {
    const message = '<html><body><h1>Not found: Unable to retrieve AEM branch</h1></body></html>';
    return {
      body: message,
      status: 404,
      contentType: 'text/html; charset=utf-8',
      contentLength: message.length,
    };
  }

  const objResp = await getObject(env, daCtx);
  if (objResp && objResp.status === 200) {
    // enrich content with HTML header and UE attributes
    const originalBodyHtml = await objResp.body.transformToString();

    const responseHtml = await prepareHtml(daCtx, aemCtx, originalBodyHtml, headHtml);
    objResp.body = responseHtml;
    objResp.contentType = 'text/html; charset=utf-8';
    objResp.contentLength = responseHtml.length;
    return objResp;
  }
  // if object not found, return a new page from template
  return getPageTemplate(daCtx, aemCtx, headHtml);
}

// TODO: delete this file

