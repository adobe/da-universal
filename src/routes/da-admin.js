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
import { applyUEInstrumentation } from '../ue/ue.js';
import { composeHtml, serializeHtml } from '../render/compose.js';
import { getAemCtx, getAEMHtml } from '../utils/aemCtx.js';
import { applyQuickEditToDocument, buildQuickEditCookie } from '../utils/quick-edit.js';
import {
  daResp, get401, get404, head401,
} from '../responses/index.js';
import { BRANCH_NOT_FOUND_HTML_MESSAGE, DEFAULT_HTML_TEMPLATE, UNAUTHORIZED_HTML_MESSAGE } from '../utils/constants.js';
import { getSiteConfig } from '../storage/config.js';
import { restoreAbsoluteImages } from '../render/rewrite-images.js';

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

  // check if Authorization header is present
  if (!authToken) {
    return get401(UNAUTHORIZED_HTML_MESSAGE);
  }

  // determine the request type before `req` is reassigned to the admin request.
  // quick-edit takes precedence; UE is gated on the hostname; everything else
  // (preview hosts, local dev) renders the composed page as-is.
  const url = new URL(req.url);
  const isQuickEdit = url.searchParams.has('quick-edit');
  const isUE = url.hostname.endsWith('.ue.da.live')
    || url.hostname.endsWith('.stage-ue.da.live');

  const headers = new Headers();
  headers.set('Authorization', authToken);

  if (ext !== 'html') {
    /*
     for non-HTML files, simply proxy the request without processing
     and ensure that extensions are not duplicated
    */
    const adminUrl = new URL(`/source/${org}/${site}${path}`, env.DA_ADMIN);
    console.log(`-> ${adminUrl.toString()}`);
    const response = await env.daadmin.fetch(adminUrl, { method: 'GET', headers });
    console.log(`<- ${adminUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  // get the AEM parts (head.html)
  const aemCtx = getAemCtx(env, daCtx);
  const headHtml = await getAEMHtml(aemCtx, '/head.html');
  if (!headHtml) {
    return get404(BRANCH_NOT_FOUND_HTML_MESSAGE);
  }

  // get the content from DA admin
  const adminUrl = new URL(
    `/source/${org}/${site}${path}.${ext}`,
    env.DA_ADMIN,
  );

  // eslint-disable-next-line no-param-reassign
  req = new Request(adminUrl, {
    method: 'GET',
    headers,
  });
  console.log(`-> ${adminUrl.toString()}`);
  const daAdminResp = await env.daadmin.fetch(req);
  console.log(`<- ${adminUrl.toString()}. ${daAdminResp.status} ${daAdminResp.statusText}`, { status: daAdminResp.status, statusText: daAdminResp.statusText });

  // use the stored content when available, otherwise fall back to a template
  const bodyHtml = daAdminResp && daAdminResp.status === 200
    ? await daAdminResp.text()
    : await getPageTemplate(env, daCtx, aemCtx, headHtml);

  // compose the page the same way for every request type
  const documentTree = await composeHtml(daCtx, aemCtx, bodyHtml, headHtml);

  // layer the request-specific instrumentation on top of the composed page
  const extraHeaders = [];
  if (isQuickEdit) {
    // no upstream AEM CSP to satisfy here, so no nonce is applied
    const entryPath = applyQuickEditToDocument(documentTree, undefined);
    if (entryPath) {
      console.log(`[quick-edit] doc compose: entry script ${entryPath} found, setting cookie`);
      extraHeaders.push(['Set-Cookie', buildQuickEditCookie(entryPath)]);
    }
  } else if (isUE) {
    await applyUEInstrumentation(documentTree, daCtx, aemCtx);
  }

  const body = serializeHtml(documentTree);

  return daResp({
    status: 200,
    body,
    contentLength: body.length,
    contentType: 'text/html; charset=utf-8',
    headers: extraHeaders,
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
  const adminUrl = new URL(`/source/${org}/${site}${adminPath}`, env.DA_ADMIN);
  console.log(`-> HEAD ${adminUrl.toString()}`);
  const response = await env.daadmin.fetch(adminUrl, { method: 'HEAD', headers });
  console.log(`<- HEAD ${adminUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
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
    console.log(`-> ${adminUrl.toString()}`);
    const response = await env.daadmin.fetch(req);
    console.log(`<- ${adminUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  return undefined;
}
