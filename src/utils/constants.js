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

export const AEM_ORIGINS = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];

export const UE_JSON_FILES = [
  'component-definition.json',
  'component-models.json',
  'component-filters.json',
];

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

export const DEFAULT_COMPONENT_DEFINITIONS = {
  groups: [
    {
      title: 'Default Content',
      id: 'default',
      components: [
        {
          title: 'Text',
          id: 'text',
          plugins: {
            da: {
              name: 'text',
              type: 'text',
            },
          },
        },
        {
          title: 'Image',
          id: 'image',
          plugins: {
            da: {
              name: 'image',
              type: 'image',
            },
          },
        },
      ],
    },
    {
      title: 'Sections',
      id: 'sections',
      components: [
        {
          title: 'Section',
          id: 'section',
          plugins: {
            da: {
              unsafeHTML: '<div></div>',
            },
          },
          filter: 'section',
          model: 'section',
        },
      ],
    },
    {
      title: 'Blocks',
      id: 'blocks',
      components: [],
    },
  ],
};
export const DEFAULT_COMPONENT_FILTERS = [
  {
    id: 'main',
    components: [
      'section',
    ],
  },
  {
    id: 'section',
    components: [
      'text',
      'image',
    ],
  },
];
export const DEFAULT_COMPONENT_MODELS = [
  {
    id: 'page-metadata',
    fields: [
      {
        component: 'container',
        label: 'Fieldset',
        fields: [
          {
            component: 'text',
            name: 'title',
            label: 'Title',
          },
          {
            component: 'text',
            name: 'description',
            label: 'Description',
          },
          {
            component: 'text',
            valueType: 'string',
            name: 'robots',
            label: 'Robots',
            description: 'Index control via robots',
          },
        ],
      },
    ],
  },
  {
    id: 'image',
    fields: [
      {
        component: 'reference',
        name: 'image',
        hidden: true,
        multi: false,
      },
      {
        component: 'reference',
        name: 'img:nth-child(3)[src]',
        label: 'Image',
        multi: false,
      },
      {
        component: 'text',
        name: 'img:nth-child(3)[alt]',
        label: 'Alt Text',
      },
    ],
  },
  {
    id: 'section',
    fields: [
      {
        component: 'text',
        name: 'style',
        label: 'Style',
      },
    ],
  },
];

