/**
 * @typedef {Object} DaCtx
 * @property {String} api - The API being requested.
 * @property {String} org - The organization or owner of the content.
 * @property {String} site - The site context.
 * @property {String} path - The path to the resource relative to the site.
 * @property {String} name - The name of the resource being requested.
 * @property {String} ext - The name of the extension.
 */

/**
 * Gets Dark Alley Context
 * @param {pathname} pathname
 * @returns {DaCtx} The Dark Alley Context.
 */
export function getDaCtx(req) {
  let { pathname, hostname } = new URL(req.url);

  // TODO this requires some improvements to be more robust
  const { org, site, path, ref } = getRefSiteOrgPath(hostname, pathname);

  // Santitize the string
  const lower = path.slice(1).toLowerCase();
  const sanitized = (lower === '' || lower.endsWith('/')) ? `${lower}index` : lower;

  // Get base details
  const [...parts] = sanitized.split('/');

  // Set base details
  const daCtx = { path, org, site, ref, isLocal: hostname === 'localhost' };

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
  daCtx.aemPathname = path;
  const daPathBase = [...pathParts, daCtx.name].join('/');

  if (!daCtx.ext || (!daCtx.name.includes('plain') && daCtx.ext === 'html')) {
    daCtx.pathname = `/${daPathBase}`;
  } else {
    daCtx.pathname = `/${daPathBase}.${daCtx.ext}`;
  }

  return daCtx;
}

function getRefSiteOrgPath(hostname, pathname) {
  if (hostname === 'localhost') {
    const [org, site, ...parts] = pathname.substring(1).split('/');
    return {
      ref: 'main',
      site,
      org,
      path: `/${parts.join('/')}`,
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
      };
    }
  }

  return undefined;
}
