import putHelper from '../helpers/source';
import { fromHtml } from 'hast-util-from-html';
import { select } from 'hast-util-select';
import { toHtml } from 'hast-util-to-html';
import { removeUEAttributes, unwrapParagraphs } from '../ue/attributes';


async function getFileBody(data) {
  const text = await data.text();
  return { body: text, type: data.type };
}

function getTextBody(data) {
  // TODO: This will only handle text data, need to handle other types 
  return { body: data, type: 'text/html' };
}

export async function handleAdminProxyRequest({ req, env, daCtx }) {
  const { path, ext } = daCtx;

  const obj = await putHelper(req, env, daCtx);
  if (obj && obj.data) {

    const isFile = obj.data instanceof File;
    const { body: bodyHtml } = isFile ? await getFileBody(obj.data) : getTextBody(obj.data);
    const documentTree = fromHtml(bodyHtml);
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
