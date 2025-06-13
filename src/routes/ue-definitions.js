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

import { UE_JSON_FILES } from '../utils/constants.js';
import { get404 } from '../responses/index.js';
import { fetchBlockLibrary, getComponentDefinitions, getComponentFilters, getComponentModels } from '../ue/definitions.js';

/**
 * Main handler for the DA block library route
 */
export async function handleUEJsonRequest({ req, env, daCtx }) {
  // request routing, we only support component-definition.json, component-models.json
  // and component-filters.json

  // TODO get JSON from KW store, if not found render from block library
  const path = new URL(req.url).pathname;
  const jsonPath = path.replace('/.da-ue/', '');
  if (!UE_JSON_FILES.includes(jsonPath)) {
    return get404();
  }

  const blocks = await fetchBlockLibrary(env, daCtx);

  if (path === '/.da-ue/component-definition.json') {
    const componentDefinitions = getComponentDefinitions(blocks);
    return new Response(
      JSON.stringify(componentDefinitions, null, 2),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } else if (path === '/.da-ue/component-models.json') {
    const componentModels = getComponentModels(blocks);
    return new Response(JSON.stringify(componentModels, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } else if (path === '/.da-ue/component-filters.json') {
    const componentFilters = getComponentFilters(blocks);
    return new Response(JSON.stringify(componentFilters, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return get404();
}
