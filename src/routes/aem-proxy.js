import { getAemCtx } from "../utils/aem";

export async function handleAEMProxyRequest({ req, env, daCtx }) {
  const aemCtx = getAemCtx(env, daCtx);
  const aemUrl = new URL(daCtx.aemPathname, aemCtx.liveUrl);
  req = new Request(aemUrl, req);
  req.headers.set('Origin', new URL(aemCtx.liveUrl).origin);
  let response = await fetch(req);
  response = new Response(response.body, response);
  response.headers.set('Access-Control-Allow-Origin', aemUrl.origin);
  return response;
}
