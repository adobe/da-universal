export function prepareHtml(daCtx, aemCtx, originalBody, headHtml) {
  const { org, site } = daCtx;
  const { ueUrl } = aemCtx;

  // static UE head HTML for all pages
  const ueHeadHtml = `<meta name="urn:adobe:aue:system:daconnection" content="da:${ueUrl}"/>
    <meta name="urn:adobe:aue:config:service" content="https://universal-editor-service-stage.experiencecloud.live"/>
    <script type="application/vnd.adobe.aue.component+json" src="/${org}/${site}/component-definition.json"></script>
    <script type="application/vnd.adobe.aue.model+json" src="/${org}/${site}/component-models.json"></script>
    <script type="application/vnd.adobe.aue.filter+json" src="/${org}/${site}/component-filters.json"></script>
    <script src="https://universal-editor-service.adobe.io/cors.js" async=""></script>`;

  // original head HTML with updated paths
  const preparedHeadHtml = headHtml
    .replace(/<script\s+[^>]*src="\//g, `<script src="/${org}/${site}/`)
    .replace(/<link\s+[^>]*href="\//g, `<link href="/${org}/${site}/`);

  return `<html><head>${preparedHeadHtml}${ueHeadHtml}</head>${originalBody}</html>`;
}
