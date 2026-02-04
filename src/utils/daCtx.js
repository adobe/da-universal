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

function getRefSiteOrgPath(hostname, pathname) {
  if (hostname === 'localhost') {
    const [org, site, ...parts] = pathname.substring(1).split('/');
    return {
      ref: 'main',
      site,
      org,
      path: `/${parts.join('/')}`,
      orgSiteInPath: true,
    };
  }
  const parts = hostname.split('.');
  if (parts.length > 2) {
    const subdomainParts = parts[0].split('--');
    if (subdomainParts.length === 3) {
      return {
        ref: subdomainParts[0],
        site: subdomainParts[1],
        org: subdomainParts[2],
        path: pathname,
        orgSiteInPath: false,
      };
    }
  }

  return {
    ref: undefined, site: undefined, org: undefined, path: pathname, orgSiteInPath: false,
  };
}

function getAuthToken(req) {
  if (req.headers.get('Authorization')) {
    return req.headers.get('Authorization');
  }

  const cookies = req.headers.get('Cookie');
  if (cookies) {
    const authTokenMatch = cookies.match(/auth_token=([^;]+)/);
    if (authTokenMatch && authTokenMatch[1]) {
      return `Bearer ${authTokenMatch[1]}`;
    }
  }
  return undefined;
}

function getSiteToken(req) {
  const cookies = req.headers.get('Cookie');
  if (cookies) {
    const siteTokenMatch = cookies.match(/site_token=([^;]+)/);
    if (siteTokenMatch && siteTokenMatch[1]) {
      return siteTokenMatch[1];
    }
  }
  return undefined;
}

/**
 * Gets Dark Alley Context
 * @param {pathname} pathname
 * @returns {DaCtx} The Dark Alley Context.
 */
export function getDaCtx(req) {
  const { pathname, hostname, searchParams } = new URL(req.url);

  // TODO this requires some improvements to be more robust
  const {
    org, site, path, ref, orgSiteInPath,
  } = getRefSiteOrgPath(hostname, pathname);

  // Santitize the string
  const lower = path.slice(1).toLowerCase();
  const sanitized = (lower === '' || lower.endsWith('/')) ? `${lower}index` : lower;

  // Get base details
  const [...parts] = sanitized.split('/');

  // Set base details
  const daCtx = {
    path, org, site, ref, isLocal: hostname.endsWith('localhost'), orgSiteInPath,
  };

  // Sanitize the remaining path parts
  const pathParts = parts.filter((part) => part !== '');
  const keyBase = `${site}/${pathParts.join('/')}`;

  // Get the final source name
  daCtx.filename = pathParts.pop() || '';

  // Handle folders and files under a site
  const split = daCtx.filename.split('.');

  // DA Content - Add HTML if there is only one part to the split
  if (split.length === 1) split.push('html');
  daCtx.isFile = split.length > 1;
  if (daCtx.isFile) daCtx.ext = split.pop();
  daCtx.name = split.join('.');

  // Set keys
  daCtx.key = daCtx?.ext === 'html' ? `${keyBase}.html` : keyBase;
  daCtx.propsKey = `${daCtx.key}.props`;

  // Set paths for API consumption
  daCtx.aemPathname = path.endsWith('/index') ? path.substring(0, path.length - 5) : path;
  const daPathBase = [...pathParts, daCtx.name].join('/');

  if (!daCtx.ext || (!daCtx.name.includes('plain') && daCtx.ext === 'html')) {
    daCtx.pathname = `/${daPathBase}`;
  } else {
    daCtx.pathname = `/${daPathBase}.${daCtx.ext}`;
  }

  const query = Object.fromEntries(searchParams.entries());
  if (typeof query['ue-service'] === 'string') {
    daCtx.ueService = query['ue-service'];
  }

  daCtx.authToken = getAuthToken(req);
  daCtx.siteToken = getSiteToken(req);
  return daCtx;
}
