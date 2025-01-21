import putHelper from '../helpers/source';
import { fromHtml } from 'hast-util-from-html';
import { select } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { removeUEAttributes, unwrapParagraphs } from '../ue/attributes';

export async function handleAdminProxyRequest({ req, env, daCtx }) {
  const { path, ext } = daCtx;

  const obj = await putHelper(req, env, daCtx);
  if (obj && obj.data) {
    const postHTML = obj.data;
    const documentTree = fromHtml(postHTML);
    const bodyNode = select('body', documentTree);

    // unwrap rich text elements
    // clean up UE data attributes
    const cleanedBodyNode = unwrapParagraphs(
      removeUEAttributes(bodyNode)
    );
    
    // create new POST request with the body content
    const body = new FormData();
    const bodyContent = toHtml(cleanedBodyNode);
    const data = new Blob([bodyContent], { type: 'text/html' });
    body.set('data', data);
    const headers = { Authorization: req.headers.get('Authorization') };
    const adminUrl = new URL(`/source${path}.${ext}`, env.DA_ADMIN);
    req = new Request(adminUrl, {
      method: 'POST',
      body,
      headers,
    });
    let response = await env.daadmin.fetch(req);
    return response;
  }

  return undefined;
}
