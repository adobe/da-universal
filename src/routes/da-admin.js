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
  daResp, get401, get404, get415, get503, head401, head503, post503,
} from '../responses/index.js';
import {
  BRANCH_NOT_FOUND_HTML_MESSAGE,
  DEFAULT_HTML_TEMPLATE,
  SOURCE_UNREACHABLE_HTML_MESSAGE,
  SOURCE_UNREACHABLE_MESSAGE,
  SOURCE_UNRESOLVED_HTML_MESSAGE,
  SOURCE_UNRESOLVED_MESSAGE,
  UNAUTHORIZED_HTML_MESSAGE,
} from '../utils/constants.js';
import { getSiteConfig } from '../storage/config.js';
import resolveContentSource, { UNAUTHORIZED, UNKNOWN } from '../storage/content-source.js';
import getStore from '../storage/store.js';
import { restoreAbsoluteImages } from '../render/rewrite-images.js';

const HTML_POST_TYPE = 'text/html';

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

/**
 * Sends a request to a store and answers 503 when it could not be reached at all.
 *
 * A throw escaping a handler reaches withCorsHeaders, which reads `response.headers` and throws
 * again, so the caller gets an opaque 500 with no CORS headers on it.
 */
async function reachStore(store, input, init) {
  try {
    return await store.fetch(input, init);
  } catch (e) {
    console.warn(`503 ${store.url}, the store could not be reached: ${e.name}: ${e.message}`);
    return undefined;
  }
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
    // for non-HTML files, simply proxy the request without processing
    const source = await resolveContentSource(env, daCtx);
    if (source.kind === UNAUTHORIZED) {
      return daResp({ body: UNAUTHORIZED_HTML_MESSAGE, status: source.status, contentType: 'text/html' });
    }
    if (source.kind === UNKNOWN) {
      console.warn(`503 GET ${daCtx.sourcePath}, content source unresolved: ${source.reason}`);
      return get503(SOURCE_UNRESOLVED_HTML_MESSAGE);
    }
    const store = getStore(env, daCtx, source);
    console.log(`-> ${store.url.toString()}`);
    const response = await reachStore(store, store.url, { method: 'GET', headers });
    if (!response) return get503(SOURCE_UNREACHABLE_HTML_MESSAGE);
    console.log(`<- ${store.url.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  // the store lookup costs a round trip, so it runs alongside head.html rather than after it
  const aemCtx = getAemCtx(env, daCtx);
  const [headHtml, source] = await Promise.all([
    getAEMHtml(aemCtx, '/head.html'),
    resolveContentSource(env, daCtx),
  ]);
  if (!headHtml) {
    // quick-edit still needs a working shell (with the import map) so the editor
    // can load into this page, even when the AEM branch doesn't exist yet.
    if (isQuickEdit) {
      return buildQuickEditNotFoundResponse();
    }
    return get404(BRANCH_NOT_FOUND_HTML_MESSAGE);
  }
  if (source.kind === UNAUTHORIZED) {
    return daResp({ body: UNAUTHORIZED_HTML_MESSAGE, status: source.status, contentType: 'text/html' });
  }
  if (source.kind === UNKNOWN) {
    console.warn(`503 GET ${daCtx.sourcePath}, content source unresolved: ${source.reason}`);
    return get503(SOURCE_UNRESOLVED_HTML_MESSAGE);
  }

  // get the content from the store that holds it
  const store = getStore(env, daCtx, source);

  // eslint-disable-next-line no-param-reassign
  req = new Request(store.url, {
    method: 'GET',
    headers,
  });
  console.log(`-> ${store.url.toString()}`);
  const sourceResp = await reachStore(store, req);
  if (!sourceResp) return get503(SOURCE_UNREACHABLE_HTML_MESSAGE);
  console.log(`<- ${store.url.toString()}. ${sourceResp.status} ${sourceResp.statusText}`, { status: sourceResp.status, statusText: sourceResp.statusText });

  // only a 404 means "this document is not here". Composing the starter template over anything
  // else hands the author a blank page to save over a document that exists.
  if (sourceResp.status !== 200 && sourceResp.status !== 404) {
    return sourceResp;
  }

  // use the stored content when available, otherwise fall back to a template
  const bodyHtml = sourceResp.status === 200
    ? await sourceResp.text()
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
  const { authToken } = daCtx;

  if (!authToken) {
    return head401();
  }

  const headers = new Headers();
  headers.set('Authorization', authToken);

  const source = await resolveContentSource(env, daCtx);
  if (source.kind === UNAUTHORIZED) {
    return new Response(null, { status: source.status });
  }
  if (source.kind === UNKNOWN) {
    console.warn(`503 HEAD ${daCtx.sourcePath}, content source unresolved: ${source.reason}`);
    return head503();
  }

  const store = getStore(env, daCtx, source);
  console.log(`-> HEAD ${store.url.toString()}`);
  const response = await reachStore(store, store.url, { method: 'HEAD', headers });
  if (!response) return head503();
  console.log(`<- HEAD ${store.url.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
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

    // the payload is settled, so the only question left is where it goes. A write is the one
    // operation a wrong guess cannot be walked back from.
    const source = await resolveContentSource(env, daCtx);
    if (source.kind === UNAUTHORIZED) {
      return daResp({ body: '', status: source.status, contentType: 'text/plain; charset=utf-8' });
    }
    if (source.kind === UNKNOWN) {
      console.warn(`503 POST ${sourcePath}, content source unresolved: ${source.reason}`);
      return post503(SOURCE_UNRESOLVED_MESSAGE);
    }

    // the two stores take the document in different shapes, so the store builds its own request
    const store = getStore(env, daCtx, source);
    // eslint-disable-next-line no-param-reassign
    req = new Request(store.url, store.writeInit(bodyContent, authToken));
    console.log(`-> ${store.url.toString()}`);
    const response = await reachStore(store, req);
    if (!response) return post503(SOURCE_UNREACHABLE_MESSAGE);
    console.log(`<- ${store.url.toString()}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  return get415();
}
