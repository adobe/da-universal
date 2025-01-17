import { getDaCtx } from './utils/daCtx';

import getHandler from './handlers/get';
import { get404, getRobots } from './responses/index';
import headHandler from './handlers/head';
import postHandlers from './handlers/post';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/favicon.ico') return get404();
    if (url.pathname === '/robots.txt') return getRobots();

    const daCtx = getDaCtx(req);

    let resp;
    switch (req.method) {
      case 'HEAD':
        resp = await headHandler({ env, daCtx });
        break;
      case 'GET':
        resp = await getHandler({ req, env, daCtx });
        break;
      case 'POST':
        resp = await postHandlers({ req, env, daCtx });
        break;
      default:
        resp = unknownHandler();
    }
    return resp;
  },
};
