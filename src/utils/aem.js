export function getAemCtx(env, daCtx) {
  const { org, site } = daCtx;

  const obj = {
    previewHostname: `main--${site}--${org}.aem.page`,
    previewUrl: `https://main--${site}--${org}.aem.page`,
    liveHostname: `main--${site}--${org}.aem.live`,
    liveUrl: `https://main--${site}--${org}.aem.live`,
    ueUrl: env.UE_CONNECTION,
    ueService: env.UE_SERVICE
  };

  return obj;
}

export async function getAEMHtml(aemCtx, path) {
  const { liveUrl } = aemCtx;
  const resp = await fetch(`${liveUrl}${path}`);
  if (!resp.ok) return undefined;
  const headHtml = await resp.text();
  return headHtml;
}

export async function handleProxyRequest(aemCtx, pathname, request) {
  const aemUrl = new URL(pathname, aemCtx.liveUrl);
  request = new Request(aemUrl, request);
  request.headers.set("Origin", new URL(aemCtx.liveUrl).origin);
  let response = await fetch(request);
  response = new Response(response.body, response);
  response.headers.set("Access-Control-Allow-Origin", aemUrl.origin);
  return response;
}