export function getAemCtx(env, daCtx) {
  const { org, site } = daCtx;

  const obj = {
    previewHostname: `main--${site}--${org}.aem.page`,
    previewUrl: `https://main--${site}--${org}.aem.page`,
    liveHostname: `main--${site}--${org}.aem.live`,
    liveUrl: `https://main--${site}--${org}.aem.live`,
    ueUrl: env.UE_CONNECTION,
    ueService: env.UE_SERVICE,
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
