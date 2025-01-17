import putHelper from '../helpers/source';

async function getFileBody(data) {
  await data.text();
  return { body: data, type: data.type };
}

export async function handleAdminProxyRequest({ req, env, daCtx }) {
  const { path, ext } = daCtx;

  const obj = await putHelper(req, env, daCtx);
  if (obj) {
    if (obj.data) {
      const { body: postBody } = await getFileBody(obj.data);

      // clean up the POST HTML
      const postHTML = await postBody.text();
      const bodyMatch = postHTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const bodyContent = bodyMatch ? `<body>${bodyMatch[1]}</body>` : postHTML;

      // create new POST request with the body content
      const body = new FormData();
      const data = new Blob([bodyContent], { type: 'text/html' });
      body.set('data', data);     
      const headers = { Authorization: req.headers.get('Authorization') };
      const adminUrl = new URL(`/source${path}.${ext}`, env.DA_ADMIN);
      req = new Request(adminUrl, {
        method: 'POST',
        body,   
        headers     
      });
      let response = await env.daadmin.fetch(req);
      return response;
    }
  }

  return undefined;
}
