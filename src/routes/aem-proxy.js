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
import { getAemCtx } from '../utils/aemCtx.js';
import { makeImagesRelative } from '../ue/rewrite-images.js';
import { removeMetadataBlock } from '../ue/metadata.js';
import rewriteIcons from '../ue/rewrite-icons.js';
import { daResp, get401 } from '../responses/index.js';
import { UNAUTHORIZED_HTML_MESSAGE } from '../utils/constants.js';

export async function handleAEMProxyRequest({ req, env, daCtx }) {
  const aemCtx = getAemCtx(env, daCtx);
  const { search } = new URL(req.url);
  const aemUrl = new URL(`${daCtx.aemPathname}${search}`, aemCtx.previewUrl);
  // eslint-disable-next-line no-param-reassign
  req = new Request(aemUrl, req);
  req.headers.set('Origin', new URL(aemCtx.previewUrl).origin);

  // Add site token if available
  if (daCtx.siteToken) {
    req.headers.set('Authorization', `token ${daCtx.siteToken}`);
  }

  console.log(`-> ${aemUrl.toString()}`);
  let response = await fetch(req);
  console.log(`<- ${aemUrl.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
  response = new Response(response.body, response);
  response.headers.set('Access-Control-Allow-Origin', aemUrl.origin);
  return response;
}

export async function handlePreviewProxyRequest({ req, env, daCtx }) {
  const {
    org, site, path, ext, authToken,
  } = daCtx;

  if (!authToken) {
    return get401(UNAUTHORIZED_HTML_MESSAGE);
  }

  // Fetch full page from AEM preview
  const aemCtx = getAemCtx(env, daCtx);
  const { search } = new URL(req.url);
  const aemUrl = new URL(`${daCtx.aemPathname}${search}`, aemCtx.previewUrl);
  const aemReq = new Request(aemUrl, req);
  aemReq.headers.set('Origin', new URL(aemCtx.previewUrl).origin);
  if (daCtx.siteToken) {
    aemReq.headers.set('Authorization', `token ${daCtx.siteToken}`);
  }

  console.log(`-> ${aemUrl.toString()}`);
  const aemResponse = await fetch(aemReq);
  console.log(`<- ${aemUrl.toString()}. ${aemResponse.status} ${aemResponse.statusText}`);

  const contentType = aemResponse.headers.get('Content-Type') || '';
  if (!aemResponse.ok || !contentType.includes('text/html')) {
    const resp = new Response(aemResponse.body, aemResponse);
    resp.headers.set('Access-Control-Allow-Origin', '*');
    return resp;
  }

  // Fetch body content from DA admin
  const adminUrl = new URL(`/source/${org}/${site}${path}.${ext}`, env.DA_ADMIN);
  const daHeaders = new Headers();
  daHeaders.set('Authorization', authToken);

  console.log(`-> ${adminUrl.toString()}`);
  const daResponse = await env.daadmin.fetch(adminUrl, { method: 'GET', headers: daHeaders });
  console.log(`<- ${adminUrl.toString()}. ${daResponse.status} ${daResponse.statusText}`);

  if (!daResponse.ok) {
    return new Response(daResponse.body, daResponse);
  }

  // Parse AEM page and replace body with DA admin content
  const aemHtml = await aemResponse.text();
  const daBodyHtml = await daResponse.text();

  const documentTree = fromHtml(aemHtml);
  const bodyNode = select('body', documentTree);
  const daBodyTree = fromHtml(daBodyHtml, { fragment: true });
  bodyNode.children = daBodyTree.children;

  // Make images relative
  makeImagesRelative(bodyNode, daCtx);

  // Rewrite icons
  rewriteIcons(bodyNode);

  // Remove metadata block
  removeMetadataBlock(bodyNode);

  // Serialize and return
  const finalHtml = toHtml(documentTree, {
    allowDangerousHtml: true,
    upperDoctype: true,
  });

  return daResp({
    status: 200,
    body: finalHtml,
    contentLength: new TextEncoder().encode(finalHtml).byteLength,
    contentType: 'text/html; charset=utf-8',
  });
}
