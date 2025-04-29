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

async function getFileBody(data) {
  const text = await data.text();
  return { body: text, type: data.type };
}

function getTextBody(data) {
  // TODO: This will only handle text data, need to handle other types
  return { body: data, type: 'text/html' };
}

function getAuthToken(req, headers) {
  if (req.headers.get('Authorization')) {
    headers.set('Authorization', req.headers.get('Authorization'));
  } else {
    const cookies = req.headers.get('Cookie');
    if (cookies) {
      const authTokenMatch = cookies.match(/auth_token=([^;]+)/);
      if (authTokenMatch && authTokenMatch[1]) {
        headers.set('Authorization', `Bearer ${authTokenMatch[1]}`);
      }
    }
  }
}

export async function daSourceGet({ req, env, daCtx }) {
  const {
    org, site, path, ext,
  } = daCtx;

  const response = {
    status: 200,
    contentType: 'text/html; charset=utf-8',
  };

  // get auth token from cookie or Authorization header
  const headers = new Headers();
  getAuthToken(req, headers);
  // check if Authorization header is present
  if (!headers.has('Authorization')) {
    const message = '<html><body></body></html>';
    response.body = message;
    response.status = 401;
    response.contentLength = message.length;
    return daResp(response);
  }

  // get the AEM parts (head.html)
  const aemCtx = getAemCtx(env, daCtx);
  const headHtml = await getAEMHtml(aemCtx, '/head.html');
  if (!headHtml) {
    const message = '<html><body><h1>Not found: Unable to retrieve AEM branch</h1></body></html>';
    response.body = message;
    response.status = 404;
    response.contentLength = message.length;
    return daResp(response);
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
  const daAdminResp = await env.daadmin.fetch(req);
  if (daAdminResp && daAdminResp.status === 200) {
    // enrich content with HTML header and UE attributes
    const originalBodyHtml = await daAdminResp.text();

    const responseHtml = await prepareHtml(
      daCtx,
      aemCtx,
      originalBodyHtml,
      headHtml,
    );
    response.body = responseHtml;
    response.contentLength = responseHtml.length;
  } else {
    // return a template for new page if no content found
    const templateHtml = await getAEMHtml(aemCtx, '/ue-template.html');
    const responseHtml = await prepareHtml(
      daCtx,
      aemCtx,
      templateHtml,
      headHtml,
    );
    response.body = responseHtml;
    response.contentLength = responseHtml.length;
  }
  return daResp(response);
}

export async function daSourcePost({ req, env, daCtx }) {
  const {
    org, site, path, ext,
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
    const headers = { Authorization: req.headers.get('Authorization') };
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
