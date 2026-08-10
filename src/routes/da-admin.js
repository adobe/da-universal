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
import {
  applyQuickEditToDocument, buildQuickEditCookie, buildQuickEditNotFoundResponse,
} from '../utils/quick-edit.js';
import {
  daResp, get401, get404, get415, head401, post405,
} from '../responses/index.js';
import {
  BRANCH_NOT_FOUND_HTML_MESSAGE,
  BRANCH_UNAVAILABLE_HTML_MESSAGE,
  DEFAULT_HTML_TEMPLATE,
  SOURCE_BUS_READ_ONLY_MESSAGE,
  UNAUTHORIZED_HTML_MESSAGE,
} from '../utils/constants.js';
import {
  CONTENT_STORE, PING, causeOf, reach,
} from '../utils/upstream.js';
import { getSiteConfig } from '../storage/config.js';
import isSourceBus from '../storage/source-bus.js';
import getStore from '../storage/store.js';
import { restoreAbsoluteImages } from '../render/rewrite-images.js';

const HTML_POST_TYPE = 'text/html';
const HEAD_PATH = '/head.html';
const NO_BODY_STATUSES = new Set([204, 205, 304]);

export function isHtmlPostType(type) {
  if (!type) return true;
  return type.split(';')[0].trim().toLowerCase() === HTML_POST_TYPE;
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
    console.warn(`no site config for ${daCtx.org}/${daCtx.site}: ${causeOf(e)}`);
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
  const { html } = await getAEMHtml(aemCtx, templatePath);
  if (html) {
    return html;
  }

  return DEFAULT_HTML_TEMPLATE;
}

/**
 * Reads from the store that holds the site. Throws an UpstreamError when either the probe that
 * picks the store or the store itself did not answer.
 *
 * @returns {Promise<Response>}
 */
async function readSource(env, daCtx, init) {
  const onSourceBus = await reach(PING, () => isSourceBus(env, daCtx));

  const store = getStore(env, daCtx, onSourceBus);
  console.log(`-> ${init.method} ${store.url.toString()}`);
  return reach(CONTENT_STORE, () => store.fetch(store.url, init));
}

export async function daSourceGet({ req, env, daCtx }) {
  const { ext, authToken } = daCtx;

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
    // for non-HTML files, simply proxy the request without processing. A refusal is passed on as
    // itself: nothing renders an image, so the da:401 shell would only corrupt it.
    const response = await readSource(env, daCtx, { method: 'GET', headers });
    console.log(`<- ${daCtx.sourcePath}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  // the store lookup costs a round trip, so it runs alongside head.html rather than after it.
  // allSettled rather than all, so which of the two is reported does not depend on which
  // rejected first
  const aemCtx = getAemCtx(env, daCtx);
  const [headResult, sourceResult] = await Promise.allSettled([
    getAEMHtml(aemCtx, HEAD_PATH),
    readSource(env, daCtx, { method: 'GET', headers }),
  ]);
  // the store holds the document, so a store that did not answer is the thing to report
  if (sourceResult.status === 'rejected') throw sourceResult.reason;
  if (headResult.status === 'rejected') throw headResult.reason;
  const head = headResult.value;
  const sourceResp = sourceResult.value;
  console.log(`<- ${daCtx.sourcePath}. ${sourceResp.status} ${sourceResp.statusText}`, { status: sourceResp.status, statusText: sourceResp.statusText });

  // the store is the only thing to see the token, and the authorbus extension recovers off the
  // da:401 meta rather than the status, so a refusal from the store gets that shell
  if (sourceResp.status === 401 || sourceResp.status === 403) {
    return daResp({ body: UNAUTHORIZED_HTML_MESSAGE, status: sourceResp.status, contentType: 'text/html' });
  }

  // only a 404 means "this document is not here". Composing the starter template over anything
  // else hands the author a blank page to save over a document that exists.
  if (sourceResp.status !== 200 && sourceResp.status !== 404) {
    return sourceResp;
  }

  // head.html carries the project's scripts and styles, not the answer to whether the document
  // is there, so only a 404 is read as "this branch has no head". Anything else is passed on.
  if (head.status === 401 || head.status === 403) {
    return daResp({ body: UNAUTHORIZED_HTML_MESSAGE, status: head.status, contentType: 'text/html' });
  }
  if (head.status !== 200 && head.status !== 404) {
    // 204, 205 and 304 forbid a body, and handing one to the Response constructor throws
    const bodied = !NO_BODY_STATUSES.has(head.status);
    return daResp({
      body: bodied ? BRANCH_UNAVAILABLE_HTML_MESSAGE : null,
      status: head.status,
      contentType: bodied ? 'text/html' : undefined,
      headers: [['x-error', `${HEAD_PATH} answered ${head.status}`]],
    });
  }

  // with no head.html, head.html is the only thing on this path that knows the site is there at
  // all, so a store with nothing either is the branch being absent rather than a new document
  if (sourceResp.status === 404 && head.status === 404) {
    // quick-edit still needs a working shell (with the import map) so the editor
    // can load into this page, even when the AEM branch doesn't exist yet.
    if (isQuickEdit) {
      return buildQuickEditNotFoundResponse();
    }
    return get404(BRANCH_NOT_FOUND_HTML_MESSAGE);
  }

  // use the stored content when available, otherwise fall back to a template
  const bodyHtml = sourceResp.status === 200
    ? await sourceResp.text()
    : await getPageTemplate(env, daCtx, aemCtx);

  // compose the page the same way for every request type
  const documentTree = await composeHtml(daCtx, aemCtx, bodyHtml, head.html);

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
  const { authToken } = daCtx;

  if (!authToken) {
    return head401();
  }

  const headers = new Headers();
  headers.set('Authorization', authToken);

  const response = await readSource(env, daCtx, { method: 'HEAD', headers });
  console.log(`<- HEAD ${daCtx.sourcePath}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
  return new Response(null, { status: response.status, headers: response.headers });
}

export async function daSourcePost({ req, env, daCtx }) {
  const { sourcePath, ext, authToken } = daCtx;

  // the body is rewritten as HTML below, so anything but an HTML document would be
  // written back mangled onto the key GET reads
  if (ext !== 'html') {
    console.log(`415 POST ${sourcePath}, not an HTML document`);
    return get415();
  }

  const obj = await putHelper(req, env, daCtx);
  if (obj && obj.data) {
    const isFile = obj.data instanceof File;
    if (isFile && !isHtmlPostType(obj.data.type)) {
      return get415();
    }
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

    // the payload is settled, so the only question left is where it goes
    const onSourceBus = await reach(PING, () => isSourceBus(env, daCtx));

    if (onSourceBus) {
      console.log(`405 POST ${sourcePath}, writes to the source bus are refused through the preview proxy. write directly to the source bus instead.`);
      return post405(SOURCE_BUS_READ_ONLY_MESSAGE);
    }

    // da-admin takes the document as a `data` form part
    const store = getStore(env, daCtx, onSourceBus);
    const body = new FormData();
    body.set('data', new Blob([bodyContent], { type: 'text/html' }));
    console.log(`-> ${store.url.toString()}`);
    const response = await reach(CONTENT_STORE, () => store.fetch(new Request(store.url, {
      method: 'POST',
      body,
      headers: { Authorization: authToken },
    })));
    console.log(`<- ${store.url.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  return get415();
}
