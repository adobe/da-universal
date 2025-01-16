import { getDaCtx } from './utils/daCtx';

import getObject from './storage/object';

import { get404, daResp, getRobots } from './responses/index';
import { getAemCtx, getAEMHtml, handleProxyRequest } from './utils/aem';
import { prepareHtml } from './ue/utils';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/favicon.ico') return get404();
    if (url.pathname === '/robots.txt') return getRobots();

    const daCtx = getDaCtx(url.pathname);
    const aemCtx = getAemCtx(env, daCtx);

    const resourceRegex = /\.(css|js|png|jpg|jpeg|webp|gif|svg|ico|json|woff|woff2|\.plain\.)$/i;
    if (resourceRegex.test(url.pathname)) {
      return handleProxyRequest(aemCtx, daCtx.aemPathname, req);
    }

    const headHtml = await getAEMHtml(aemCtx, "/head.html");
    let objResp = await getObject(env, daCtx);

    // enrich content with HTML header and UE attributes
    if (objResp && objResp.status === 200) {
      const originalBodyHtml = await objResp.body.transformToString();
      const responseHtml = prepareHtml(daCtx, aemCtx, originalBodyHtml, headHtml);      
      objResp = new Response(responseHtml, {
        status: objResp.status,
        statusText: objResp.statusText,
        headers: objResp.headers,
      });      
    } else {
      const templateHtml = await getAEMHtml(aemCtx, "/ue-template.html");
      const responseHtml = prepareHtml(daCtx, aemCtx, templateHtml, headHtml);      
      objResp = new Response(responseHtml, {
        status: 200
      });     
    }

    return daResp(objResp);
  },
};
