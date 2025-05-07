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

async function getFileBody(data) {
  const text = await data.text();
  return { body: text, type: data.type };
}

function getTextBody(data) {
  // TODO: This will only handle text data, need to handle other types
  return { body: data, type: 'text/html' };
}

export async function handleAdminProxyRequest({ req, env, daCtx }) {
  const {
    org,
    site,
    path,
    ext,
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
    // const headers = { Authorization: req.headers.get('Authorization') };
    const adminUrl = new URL(`/source/${org}/${site}${path}.${ext}`, env.DA_ADMIN);
    // eslint-disable-next-line no-param-reassign
    req = new Request(adminUrl, {
      method: 'POST',
      body,
      // headers,
    });
    const response = await env.daadmin.fetch(req);
    return response;
  }

  return undefined;
}
