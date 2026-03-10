/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const QUICK_EDIT_IMPORT_MAP = {
  imports: {
    'da-lit': 'https://da.live/deps/lit/dist/index.js',
    'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
  },
};

export function shouldApplyQuickEdit(requestUrl, response) {
  if (!requestUrl.searchParams.has('quick-edit') || !response.ok) return false;
  const contentType = response.headers.get('Content-Type') || '';
  return contentType.toLowerCase().includes('text/html');
}

const QUICK_EDIT_SCRIPT = `import { loadPage } from '/scripts/scripts.js';
const payload = (() => { try { const q = new URL(document.location.href).searchParams.get('quick-edit'); return q ? JSON.parse(decodeURIComponent(q)) : {}; } catch { return {}; } })();
document.body.classList.add('quick-edit');
const { default: loadQuickEdit } = await import(\`https://da.live/nx/public/plugins/quick-edit/quick-edit.js\`);
loadQuickEdit(payload, loadPage);
`;

function mergeImportMapIntoHtml(html) {
  const importMapRegex = /<script\s+type\s*=\s*["']importmap["']\s*>([\s\S]*?)<\/script>/i;
  const match = html.match(importMapRegex);
  if (match) {
    try {
      const existing = JSON.parse(match[1].trim());
      const imports = { ...(existing.imports || {}) };
      for (const [k, v] of Object.entries(QUICK_EDIT_IMPORT_MAP.imports)) {
        if (!(k in imports)) imports[k] = v;
      }
      const merged = { ...existing, imports };
      const replacement = `<script type="importmap">\n${JSON.stringify(merged)}\n</script>`;
      return html.replace(importMapRegex, replacement);
    } catch {
      // leave html unchanged if JSON parse fails
    }
  } else {
    // No import map: insert one before </head>
    const importMapTag = `<script type="importmap">\n${JSON.stringify(QUICK_EDIT_IMPORT_MAP)}\n</script>`;
    return html.replace(/<\/head>/i, `${importMapTag}\n</head>`);
  }
  return html;
}

function injectQuickEditScript(html) {
  const scriptTag = `<script type="module">\n${QUICK_EDIT_SCRIPT}\n</script>`;
  return html.replace(/<\/head>/i, `${scriptTag}\n</head>`);
}

function transformHtmlForQuickEdit(html) {
  let out = mergeImportMapIntoHtml(html);
  out = injectQuickEditScript(out);
  return out;
}

export async function applyQuickEditTransform(response) {
  const html = await response.text();
  const transformed = transformHtmlForQuickEdit(html);
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
