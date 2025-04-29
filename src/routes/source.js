/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { getAemCtx, getAEMHtml } from '../utils/aemCtx.js';
import { prepareHtml } from '../ue/ue.js';
import getObject from '../storage/object.js';

export async function getSource({ env, daCtx }) {
  // get the AEM parts (head.html)
  const aemCtx = getAemCtx(env, daCtx);
  const headHtml = await getAEMHtml(aemCtx, '/head.html');
  if (!headHtml) {
    const message = 'Not found: Unable to retrieve AEM branch';
    return {
      body: message,
      status: 404,
      contentType: 'text/html; charset=utf-8',
      contentLength: message.length,
    };
  }

  let objResp = await getObject(env, daCtx);
  if (objResp && objResp.status === 200) {
    // enrich content with HTML header and UE attributes
    const originalBodyHtml = await objResp.body.transformToString();

    const responseHtml = await prepareHtml(daCtx, aemCtx, originalBodyHtml, headHtml);
    objResp.body = responseHtml;
    objResp.contentType = 'text/html; charset=utf-8';
    objResp.contentLength = responseHtml.length;
  } else {
    // return a template for new page if no content found
    const templateHtml = await getAEMHtml(aemCtx, '/ue-template.html');
    const responseHtml = await prepareHtml(daCtx, aemCtx, templateHtml, headHtml);
    objResp = {
      body: responseHtml,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      contentLength: responseHtml.length,
    };
  }
  return objResp;
}
