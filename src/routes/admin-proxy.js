export async function handleAdminProxyRequest({ req, env, daCtx }) {
  const { path, ext } = daCtx;
  const adminUrl = new URL(`/source${path}.${ext}`, env.DA_ADMIN);
  req = new Request(adminUrl, req);
  let response = await env.daadmin.fetch(req);
  return response;
}
