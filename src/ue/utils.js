export function prepareHtml(daCtx, aemCtx, originalBody, headHtml) {
  const { org, site } = daCtx;
  const { ueUrl } = aemCtx;

  // static UE head HTML for all pages
  const ueHeadHtml = `<meta name="urn:adobe:aue:system:daconnection" content="da:${ueUrl}"/>
    <meta name="urn:adobe:aue:config:service" content="https://universal-editor-service-dev.adobe.io">
    <script type="application/vnd.adobe.aue.component+json" src="/${org}/${site}/component-definition.json"></script>
    <script type="application/vnd.adobe.aue.model+json" src="/${org}/${site}/component-models.json"></script>
    <script type="application/vnd.adobe.aue.filter+json" src="/${org}/${site}/component-filters.json"></script>
    <script src="https://universal-editor-service.adobe.io/cors.js" async=""></script>`;

  // original head HTML with updated paths
  const preparedHeadHtml = headHtml
    .replace(/<script\s+[^>]*src="\//g, `<script src="/${org}/${site}/`)  
    .replace(/<link\s+([^>]*href=")\//g, `<link $1/${org}/${site}/`);

  return `<html><head>${preparedHeadHtml}${ueHeadHtml}</head>${originalBody}</html>`;
}

export function createEmptyPageResponse(daCtx, aemCtx, headHtml) {

  const bodyHtml = `<body>
    <header></header>
    <main data-aue-type="container" data-aue-resource="urn:daconnection:1234">
    <div data-aue-type="container" data-aue-model="section" data-aue-resource="urn:daconnection:5678">
    <h1>Hello World</h1>
    </div>
    </main>
    <footer></footer>
  </body>`;

  const responseHtml = prepareHtml(daCtx, aemCtx, bodyHtml, headHtml);

  const response = new Response(responseHtml, {
    status: 200
  });    

  return response;
}