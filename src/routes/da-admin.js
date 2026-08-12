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
  daResp, get401, get404, get415, get503, head401, head404, head503, post405, post503,
} from '../responses/index.js';
import {
  DEFAULT_HTML_TEMPLATE,
  SITE_UNREACHABLE_HTML_MESSAGE,
  PREVIEW_UNREACHABLE_HTML_MESSAGE,
  SITE_NOT_FOUND_HTML_MESSAGE,
  SOURCE_BUS_READ_ONLY_MESSAGE,
  SOURCE_UNDETERMINED_HTML_MESSAGE,
  SOURCE_UNDETERMINED_MESSAGE,
  SOURCE_UNREACHABLE_HTML_MESSAGE,
  SOURCE_UNREACHABLE_MESSAGE,
  UNAUTHORIZED_HTML_MESSAGE,
} from '../utils/constants.js';
import { getSiteConfig } from '../storage/config.js';
import getSite from '../storage/site.js';
import isSourceBus from '../storage/source-bus.js';
import getStore from '../storage/store.js';
import { restoreAbsoluteImages } from '../render/rewrite-images.js';
import {
  CONTENT_STORE,
  PREVIEW_HOST,
  SITE_CONFIG,
  SITE_LOOKUP,
  STORE_LOOKUP,
  UpstreamError,
  reach,
} from '../utils/upstream.js';

const HTML_POST_TYPE = 'text/html';

/**
 * Overrides the store's body for the upstreams that need their own. SITE_CONFIG is read off
 * da-admin, so it takes the default body and `x-error` is what tells the two reads apart.
 */
const UNREACHABLE_HTML = {
  [PREVIEW_HOST]: PREVIEW_UNREACHABLE_HTML_MESSAGE,
  [SITE_LOOKUP]: SITE_UNREACHABLE_HTML_MESSAGE,
  [STORE_LOOKUP]: SOURCE_UNDETERMINED_HTML_MESSAGE,
};
const UNREACHABLE_TEXT = { [STORE_LOOKUP]: SOURCE_UNDETERMINED_MESSAGE };

/**
 * Only an upstream that could not be reached is retryable. Anything else reaches the worker
 * boundary in src/index.js, which logs it and answers 500.
 */
function refuseUnreachable(e, method, sourcePath) {
  if (!(e instanceof UpstreamError)) throw e;
  console.warn(`503 ${method} ${sourcePath}, ${e.message}`);
  if (method === 'HEAD') return head503(e.message);
  if (method === 'POST') {
    return post503(UNREACHABLE_TEXT[e.upstream] ?? SOURCE_UNREACHABLE_MESSAGE, e.message);
  }
  return get503(UNREACHABLE_HTML[e.upstream] ?? SOURCE_UNREACHABLE_HTML_MESSAGE, e.message);
}

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
  // answers null for a site with no config, so a store that refuses or is unreachable throws
  const config = await reach(SITE_CONFIG, () => getSiteConfig(env, daCtx));

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
  const templateHtml = await reach(PREVIEW_HOST, () => getAEMHtml(aemCtx, templatePath));
  if (templateHtml) {
    return templateHtml;
  }

  return DEFAULT_HTML_TEMPLATE;
}

/**
 * Reads the document from the store that holds the site.
 *
 * Sets `noSuchSite` when there is no such site, `response` otherwise.
 *
 * @returns {Promise<{response?: Response, noSuchSite?: boolean}>}
 * @throws {UpstreamError} when the lookup or the store could not be reached
 */
async function readSource(env, daCtx, init) {
  // both lookups go out together: config.aem.page says whether the site exists and what its
  // head.html is, /ping says which store holds it
  const [site, onSourceBus] = await Promise.allSettled([
    reach(SITE_LOOKUP, () => getSite(env, daCtx)),
    reach(STORE_LOOKUP, () => isSourceBus(env, daCtx)),
  ]);

  // answers no-such-site ahead of either 503, which would ask for a retry that cannot help.
  // drops a failed probe on purpose: a site that does not exist needs no store
  if (site.status === 'fulfilled' && !site.value.exists) {
    console.log(`404 ${init.method} ${daCtx.sourcePath}, there is no site ${daCtx.org}/${daCtx.site}`);
    return { noSuchSite: true };
  }
  // the site lookup first, since the store answer is no use on its own
  if (site.status === 'rejected') throw site.reason;
  if (onSourceBus.status === 'rejected') throw onSourceBus.reason;

  const store = getStore(env, daCtx, onSourceBus.value);
  console.log(`-> ${init.method} ${store.url.toString()}`);
  return {
    response: await reach(CONTENT_STORE, () => store.fetch(store.url, init)),
    head: site.value.head,
  };
}

async function sourceGet({ req, env, daCtx }) {
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
    const { response, noSuchSite } = await readSource(env, daCtx, { method: 'GET', headers });
    if (noSuchSite) return get404();
    console.log(`<- ${daCtx.sourcePath}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
    return response;
  }

  const aemCtx = getAemCtx(env, daCtx);
  const { response: sourceResp, noSuchSite, head: headHtml } = await readSource(
    env,
    daCtx,
    { method: 'GET', headers },
  );

  if (noSuchSite) {
    // quick-edit still needs a working shell (with the import map) so the editor
    // can load into this page, even when the site does not exist.
    if (isQuickEdit) {
      return buildQuickEditNotFoundResponse();
    }
    return get404(SITE_NOT_FOUND_HTML_MESSAGE);
  }

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

  // use the stored content when available, otherwise fall back to a template
  const bodyHtml = sourceResp.status === 200
    ? await sourceResp.text()
    : await getPageTemplate(env, daCtx, aemCtx);

  // builds the page without head.html, which a ref that was never built does not have
  const documentTree = await composeHtml(daCtx, aemCtx, bodyHtml, headHtml ?? '');

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

/** Wraps sourceGet, turning an unreachable upstream into a 503 in HTML the editor renders. */
export async function daSourceGet({ req, env, daCtx }) {
  try {
    return await sourceGet({ req, env, daCtx });
  } catch (e) {
    return refuseUnreachable(e, 'GET', daCtx.sourcePath);
  }
}

async function sourceHead({ env, daCtx }) {
  const { authToken } = daCtx;

  if (!authToken) {
    return head401();
  }

  const headers = new Headers();
  headers.set('Authorization', authToken);

  const { response, noSuchSite } = await readSource(env, daCtx, { method: 'HEAD', headers });
  if (noSuchSite) return head404();
  console.log(`<- HEAD ${daCtx.sourcePath}. ${response.status} ${response.statusText}`, { status: response.status, statusText: response.statusText });
  return new Response(null, { status: response.status, headers: response.headers });
}

/** Wraps sourceHead, turning an unreachable upstream into a bodyless 503. */
export async function daSourceHead({ env, daCtx }) {
  try {
    return await sourceHead({ env, daCtx });
  } catch (e) {
    return refuseUnreachable(e, 'HEAD', daCtx.sourcePath);
  }
}

async function sourcePost({ req, env, daCtx }) {
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

    // the payload is settled, so the only question left is where it goes. /ping answers that, and
    // the config service is read alongside it because helix-admin sets the /ping header off the
    // same config and swallows a failure reading it: while the config service is down, a
    // source-bus site answers 200 with no header and reads as legacy. so a config service that
    // cannot answer refuses the save rather than misplacing it in da-admin, where nothing serves
    // it back. a 404 is an answer, and it means no AEM site config rather than no DA site
    const [site, onSourceBus] = await Promise.allSettled([
      reach(SITE_LOOKUP, () => getSite(env, daCtx)),
      reach(STORE_LOOKUP, () => isSourceBus(env, daCtx)),
    ]);
    if (site.status === 'rejected') throw site.reason;
    if (onSourceBus.status === 'rejected') throw onSourceBus.reason;

    if (onSourceBus.value) {
      console.log(`405 POST ${sourcePath}, writes to the source bus are refused through the preview proxy. write directly to the source bus instead.`);
      return post405(SOURCE_BUS_READ_ONLY_MESSAGE);
    }

    // da-admin takes the document as a `data` form part
    const store = getStore(env, daCtx, onSourceBus.value);
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

/**
 * Wraps sourcePost, turning an unreachable upstream into the plain text the editor shows the
 * author.
 */
export async function daSourcePost({ req, env, daCtx }) {
  try {
    return await sourcePost({ req, env, daCtx });
  } catch (e) {
    return refuseUnreachable(e, 'POST', daCtx.sourcePath);
  }
}
