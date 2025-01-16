export function prepareHtml(daCtx, aemCtx, originalBody, headHtml) {
  const { org, site, pathname, ext } = daCtx;
  const { ueUrl, ueService } = aemCtx;

  // static UE head HTML for all pages
  let ueHeadHtml = `
    <meta name="urn:adobe:aue:system:ab" content="${ueUrl}/${org}${pathname}.${ext}"/>
    <script type="application/vnd.adobe.aue.component+json" src="/${org}/${site}/component-definition.json"></script>
    <script type="application/vnd.adobe.aue.model+json" src="/${org}/${site}/component-models.json"></script>
    <script type="application/vnd.adobe.aue.filter+json" src="/${org}/${site}/component-filters.json"></script>
    <script src="https://universal-editor-service.adobe.io/cors.js" async=""></script>`;

  if (ueService) {
    ueHeadHtml += `
    <meta name="urn:adobe:aue:config:service" content="${ueService}">`;
  }

  // original head HTML with updated paths
  const preparedHeadHtml = headHtml
    .replace(/<script\s+[^>]*src="\//g, `<script src="/${org}/${site}/`)  
    .replace(/<link\s+([^>]*href=")\//g, `<link $1/${org}/${site}/`);

  return `<!DOCTYPE html>\n<html>\n<head>\n${preparedHeadHtml}${ueHeadHtml}\n</head>${originalBody}\n</html>`;
}
