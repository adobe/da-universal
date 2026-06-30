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
import {
  daResp, get401, get404, head401,
} from '../responses/index.js';
import { BRANCH_NOT_FOUND_HTML_MESSAGE, DEFAULT_HTML_TEMPLATE, UNAUTHORIZED_HTML_MESSAGE } from '../utils/constants.js';
import { getSiteConfig } from '../storage/config.js';
import { restoreAbsoluteImages } from '../ue/rewrite-images.js';

const AEM_API = 'https://api.aem.live';

// Worker-lifetime cache: `org/site` → boolean (true = hlx6).
// Populated lazily by GET requests; consumed by HEAD and POST.
// Resets on cold start, which is acceptable.
const hlx6Cache = new Map();

function aemApiSourceUrl(org, site, path) {
  return `${AEM_API}/${org}/sites/${site}/source${path}`;
}

// On cache miss, probes api.aem.live source root to detect hlx6.
// Used by HEAD and POST where parallel GET-based detection isn't possible.
async function resolveHlx6(org, site, authToken) {
  const key = `${org}/${site}`;
  const cached = hlx6Cache.get(key);
  if (cached !== undefined) return cached;

  const resp = await fetch(aemApiSourceUrl(org, site, '/'), {
    method: 'HEAD',
    headers: { Authorization: authToken },
  });
  const result = resp.ok;
  hlx6Cache.set(key, result);
  return result;
}

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

export async function daSourceGet({ env, daCtx }) {
  const {
    org, site, path, ext, authToken,
  } = daCtx;

  // check if Authorization header is present
  if (!authToken) {
    return get401(UNAUTHORIZED_HTML_MESSAGE);
  }

  const headers = new Headers();
  headers.set('Authorization', authToken);

  const hlx6 = await resolveHlx6(org, site, authToken);

  if (ext !== 'html') {
    const sourceUrl = hlx6
      ? aemApiSourceUrl(org, site, path)
      : new URL(`/source/${org}/${site}${path}`, env.DA_ADMIN);

    console.log(`-> GET ${sourceUrl}`);
    const response = hlx6
      ? await fetch(String(sourceUrl), { method: 'GET', headers })
      : await env.daadmin.fetch(sourceUrl, { method: 'GET', headers });
    console.log(`<- GET ${response.status}: ${sourceUrl}`);
    return response;
  }

  const aemCtx = getAemCtx(env, daCtx);
  const sourceUrl = hlx6
    ? aemApiSourceUrl(org, site, `${path}.${ext}`)
    : new URL(`/source/${org}/${site}${path}.${ext}`, env.DA_ADMIN);

  console.log(`-> GET html ${sourceUrl}`);
  const [headHtml, sourceResp] = await Promise.all([
    getAEMHtml(aemCtx, '/head.html'),
    hlx6
      ? fetch(String(sourceUrl), { method: 'GET', headers })
      : env.daadmin.fetch(new Request(String(sourceUrl), { method: 'GET', headers })),
  ]);

  if (!headHtml) {
    return get404(BRANCH_NOT_FOUND_HTML_MESSAGE);
  }

  let body;
  if (sourceResp.status === 200) {
    // enrich stored content with HTML header and UE attributes
    const originalBodyHtml = await sourceResp.text();
    body = await prepareHtml(daCtx, aemCtx, originalBodyHtml, headHtml);
  } else {
    // enrich default template with HTML header and UE attributes
    const templateHtml = await getPageTemplate(env, daCtx, aemCtx);
    body = await prepareHtml(daCtx, aemCtx, templateHtml, headHtml);
  }

  return daResp({
    status: 200,
    body,
    contentLength: body.length,
    contentType: 'text/html; charset=utf-8',
  });
}

export async function daSourceHead({ env, daCtx }) {
  const {
    org, site, path, ext, authToken,
  } = daCtx;

  if (!authToken) {
    return head401();
  }

  const headers = new Headers();
  headers.set('Authorization', authToken);

  const adminPath = ext !== 'html' ? path : `${path}.${ext}`;
  const hlx6 = await resolveHlx6(org, site, authToken);

  if (hlx6) {
    const hlx6Url = aemApiSourceUrl(org, site, adminPath);
    console.log(`-> HEAD hlx6: ${hlx6Url}`);
    const response = await fetch(hlx6Url, { method: 'HEAD', headers });
    console.log(`<- HEAD hlx6 ${response.status}: ${hlx6Url}`);
    return new Response(null, { status: response.status, headers: response.headers });
  }

  const adminUrl = new URL(`/source/${org}/${site}${adminPath}`, env.DA_ADMIN);
  console.log(`-> HEAD da-admin: ${adminUrl}`);
  const response = await env.daadmin.fetch(adminUrl, { method: 'HEAD', headers });
  console.log(`<- HEAD da-admin ${response.status}: ${adminUrl}`);
  return new Response(null, { status: response.status, headers: response.headers });
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

    // restore absolute image URLs for content.da.live
    restoreAbsoluteImages(bodyNode, daCtx);

    minifyWhitespace(bodyNode);

    const bodyContent = toHtml(bodyNode);

    const hlx6 = await resolveHlx6(org, site, authToken);

    if (hlx6) {
      // hlx6 accepts raw body with Content-Type header (no FormData wrapping)
      const hlx6Url = aemApiSourceUrl(org, site, ext !== 'html' ? path : `${path}.${ext}`);
      console.log(`-> POST hlx6: ${hlx6Url}`);
      const response = await fetch(hlx6Url, {
        method: 'POST',
        body: bodyContent,
        headers: { Authorization: authToken, 'Content-Type': 'text/html' },
      });
      console.log(`<- POST hlx6 ${response.status}: ${hlx6Url}`);
      return response;
    }

    // create new POST request with the body content (da-admin expects FormData)
    const body = new FormData();
    const data = new Blob([bodyContent], { type: 'text/html' });
    body.set('data', data);
    const headers = { Authorization: authToken };
    const adminUrl = new URL(
      `/source/${org}/${site}${ext !== 'html' ? path : `${path}.${ext}`}`,
      env.DA_ADMIN,
    );
    // eslint-disable-next-line no-param-reassign
    req = new Request(adminUrl, {
      method: 'POST',
      body,
      headers,
    });
    console.log(`-> POST da-admin: ${adminUrl}`);
    const response = await env.daadmin.fetch(req);
    console.log(`<- POST da-admin ${response.status}: ${adminUrl}`);
    return response;
  }

  return undefined;
}
