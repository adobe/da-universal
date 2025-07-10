/*
 * Copyright 2024 Adobe. All rights reserved.
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
import { select } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { minifyWhitespace } from 'hast-util-minify-whitespace';
import putHelper from '../helpers/source.js';
import { removeUEAttributes, unwrapParagraphs } from '../ue/attributes.js';
import { prepareHtml } from '../ue/ue.js';
import { getAemCtx, getAEMHtml } from '../utils/aemCtx.js';
import { daResp } from '../responses/index.js';
import { BRANCH_NOT_FOUND_HTML_MESSAGE, DEFAULT_HTML_TEMPLATE, UNAUTHORIZED_HTML_MESSAGE } from '../utils/constants.js';
import { getSiteConfig } from '../storage/config.js';

async function getFileBody(data) {
  const text = await data.text();
  return { body: text, type: data.type };
}

function getTextBody(data) {
  // TODO: This will only handle text data, need to handle other types
  return { body: data, type: 'text/html' };
}

async function getPageTemplate(env, daCtx, aemCtx) {
  let config;
  try {
    config = await getSiteConfig(env, daCtx);
  } catch (e) {
    return DEFAULT_HTML_TEMPLATE;
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

  if (!matchingTemplates || matchingTemplates.length <= 0) {
    return DEFAULT_HTML_TEMPLATE;
  }

  const templatePath = matchingTemplates[0].template;
  const templateHtml = await getAEMHtml(aemCtx, templatePath);
  if (templateHtml) {
    return templateHtml;
  }

  return DEFAULT_HTML_TEMPLATE;
}

export async function daSourceGet({ req, env, daCtx }) {
  const {
    org, site, path, ext, authToken,
  } = daCtx;

  const response = {
    status: 200,
    contentType: 'text/html; charset=utf-8',
  };

  // check if Authorization header is present
  if (!authToken) {
    response.body = UNAUTHORIZED_HTML_MESSAGE;
    response.status = 401;
    return daResp(response);
  }

  // get the AEM parts (head.html)
  const aemCtx = getAemCtx(env, daCtx);
  const headHtml = await getAEMHtml(aemCtx, '/head.html');
  if (!headHtml) {
    response.body = BRANCH_NOT_FOUND_HTML_MESSAGE;
    response.status = 404;
    return daResp(response);
  }

  // get the content from DA admin
  const adminUrl = new URL(
    `/source/${org}/${site}${path}` + (ext === 'html' ? `.${ext}` : ''),
    env.DA_ADMIN,
  );

  const headers = new Headers();
  headers.set('Authorization', authToken);

  // eslint-disable-next-line no-param-reassign
  req = new Request(adminUrl, {
    method: 'GET',
    headers,
  });
  console.log('daAdmin ->', adminUrl);
  const daAdminResp = await env.daadmin.fetch(req);
  console.log('daAdminResp <-', adminUrl, daAdminResp.status);
  if (daAdminResp && ext !== 'html') {
    return daAdminResp;
  }

  if (daAdminResp && daAdminResp.status === 200) {
    // enrich stored content with HTML header and UE attributes
    const originalBodyHtml = await daAdminResp.text();
    const responseHtml = await prepareHtml(daCtx, aemCtx, originalBodyHtml, headHtml);
    response.body = responseHtml;
  } else {
    // enrich default template with HTML header and UE attributes
    const templateHtml = await getPageTemplate(env, daCtx, aemCtx, headHtml);
    const responseHtml = await prepareHtml(daCtx, aemCtx, templateHtml, headHtml);
    response.body = responseHtml;
  }

  response.contentLength = response.body.length;
  return daResp(response);
}

export async function daSourcePost({ req, env, daCtx }) {
  const {
    org, site, path, ext, authToken,
  } = daCtx;

  const obj = await putHelper(req, env, daCtx);
  if (obj && obj.data) {
    const isFile = obj.data instanceof File;
    const { body: bodyHtml } = isFile
      ? await getFileBody(obj.data)
      : getTextBody(obj.data);
    const documentTree = fromHtml(bodyHtml);
    let bodyNode = select('body', documentTree);

    // unwrap rich text elements
    // clean up UE data attributes
    bodyNode = unwrapParagraphs(bodyNode);
    bodyNode = removeUEAttributes(bodyNode);

    minifyWhitespace(bodyNode);

    // create new POST request with the body content
    const body = new FormData();
    const bodyContent = toHtml(bodyNode);
    const data = new Blob([bodyContent], { type: 'text/html' });
    body.set('data', data);
    const headers = { Authorization: authToken };
    const adminUrl = new URL(
      `/source/${org}/${site}${path}.${ext}`,
      env.DA_ADMIN,
    );
    // eslint-disable-next-line no-param-reassign
    req = new Request(adminUrl, {
      method: 'POST',
      body,
      headers,
    });
    const response = await env.daadmin.fetch(req);
    return response;
  }

  return undefined;
}
