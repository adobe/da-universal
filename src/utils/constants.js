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

export const TRUSTED_ORIGINS = ['https://experience.adobe.com', 'https://localhost.corp.adobe.com:8080'];

export const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Credentials': 'true',
};

export const UNAUTHORIZED_HTML_MESSAGE = `
<html>
<head>
  <meta name="urn:adobe:aue:system:ab" content="da:401">
  <meta name="urn:adobe:aue:config:extensions" content="https://experience.adobe.com/solutions/CQ-universal-editor-extensions/static-assets/resources/authorbus-handler.html"/>
  <script src="https://universal-editor-service.adobe.io/cors.js" async></script>
</head>
<body></body>
</html>`;

export const DEFAULT_HTML_TEMPLATE = '<body><header></header><main><div></div></main><footer></footer></body>';

export const BRANCH_NOT_FOUND_HTML_MESSAGE = '<html><body><h1>Not found: Unable to retrieve AEM branch</h1></body></html>';

export const DEFAULT_UNAUTHORIZED_HTML_MESSAGE = '<html><body><h1>401: Unauthorized</h1></body></html>';
