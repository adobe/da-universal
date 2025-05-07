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
import { select } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { daResp } from '../responses/index.js';
import { prepareHtml } from '../ue/ue.js';
import { getAemCtx, getAEMHtml } from '../utils/aemCtx.js';
import { getDaCtx } from '../utils/daCtx.js';

function setHeaders(req, res) {
  const headerNames = req.headers.get('access-control-request-headers');
  res.headers.append('Access-Control-Allow-Credentials', 'true');
  res.headers.append('Access-Control-Allow-Headers', `${headerNames}`);
  return res;
}

function handleHead(req) {
  return setHeaders(req, daResp({ status: 200 }));
}

// function selectFromTree(hast, currentPath, propertyName, propertyValue) {
//   if (hast.properties?.[propertyName] === propertyValue) {
//     return { el: hast, path: currentPath };
//   }
//
//   const elementChildren = hast.children.filter((child) => child.type === 'element');
//
//   for (let i = 0; i < elementChildren.length; i += 1) {
//     const child = elementChildren[i];
//     const selection = selectFromTree(child, `${currentPath} > ${child.tagName}:nth-child(${i + 1})`, propertyName, propertyValue);
//     if (selection) {
//       return selection;
//     }
//   }
//   return null;
// }

function findEditable(hast, editable) {
  const selector = `[data-aue-resource='${editable.resource}']`;
  let subSelector = '';

  if (editable.prop) {
    subSelector += `[data-aue-prop='${editable.prop}']`;
  }

  const element = select(`${selector}${subSelector}`, hast);
  if (element) {
    return element;
  }
  return select(`${selector} ${subSelector}`, hast);
}

function innerHtml(el) {
  return el.children?.map((child) => toHtml(child)?.trim()).join('\n');
}

function getAttributes(el, json, selectors = []) {
  if (el.type !== 'element') return;

  const selector = selectors?.join('>');

  if (selector) {
    // eslint-disable-next-line no-param-reassign
    json[selector] = innerHtml(el);
  } else {
    // eslint-disable-next-line no-param-reassign
    json.root = innerHtml(el);
  }

  // TODO do we need to put the attributes in too? Serialising them is a pain

  el.children.filter((child) => child.type === 'element').forEach((child, i) => {
    getAttributes(child, json, [...selectors, `${child.tagName}:nth-child(${i + 1})`]);
  });
}

function addClassNamesToObj(block, obj) {
  if (block.properties?.className?.length > 1) {
    // handle text field/(multi) select with all classes
    const modifierClasses = block
      .properties?.className
      ?.filter((x) => !!x)
      .slice(1);

    // handle boolean classes
    // eslint-disable-next-line no-param-reassign
    obj.classes = modifierClasses?.join(' ') ?? '';
    modifierClasses?.forEach((className) => {
      // eslint-disable-next-line no-param-reassign
      obj[`classes_${className}`] = true;
    });
  }
  return obj;
}

async function handlePost(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/details') {
    const body = await req.json();

    console.log(body);
    // resource, type, prop
    const editable = body.target;

    const { uri } = body.connections[0];
    const fetchPath = new URL(uri).pathname;

    // load the source
    // TODO use the normal get source method once that uses admin api call
    // TODO handle owner/repo/ref in subdomain instead of path
    const adminUrl = new URL(`/source${fetchPath}.html`, env.DA_ADMIN);
    const adminReq = new Request(adminUrl, { method: 'GET' });
    const res = await env.daadmin.fetch(adminReq);

    if (!res.ok) {
      console.log(res.status);
      throw new Error('failed to fetch source');
    }

    const pageHtml = await res.text();

    // TODO generate da context correctly
    const fakeReq = new Request(new URL(uri));
    const daCtx = getDaCtx(fakeReq);
    const aemCtx = getAemCtx(env, daCtx);

    const headHtml = await getAEMHtml(aemCtx, '/head.html');
    const instrumentedHtml = await prepareHtml(daCtx, aemCtx, pageHtml, headHtml);

    const hast = fromHtml(instrumentedHtml);
    const el = findEditable(hast, editable);

    const json = {};
    getAttributes(el, json);
    addClassNamesToObj(el, json);

    return setHeaders(req, daResp({
      status: 200,
      body: JSON.stringify({ data: json }),
      contentType: 'application/json',
    }));
  }

  throw new Error('not implemented');
}

export default async function handleRequest(req, env) {
  console.log(req.method);
  switch (req.method) {
    case 'OPTIONS':
      return handleHead(req, env);
    case 'POST':
      return handlePost(req, env);
    default:
      throw new Error('not implemented');
  }
}
