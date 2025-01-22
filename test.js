const DA_API = 'https://localhost:4712';
const ORG = 'mhaack';
const REPO = 'special-project';

const MOCK_PAGE = `

<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="/mhaack/special-project/scripts/aem.js" type="module"></script>
    <script src="/mhaack/special-project/scripts/scripts.js" type="module"></script>
    <link rel="stylesheet" href="/mhaack/special-project/styles/styles.css">
    <meta name="urn:adobe:aue:system:ab" content="da:https://ue.da.live/mhaack/special-project/mh-text">
    <meta name="urn:adobe:aue:config:service" content="https://universal-editor-service-dev.adobe.io">
    <script src="https://universal-editor-service.adobe.io/cors.js"></script>
    <script type="application/vnd.adobe.aue.component+json" src="/mhaack/special-project/component-definition.json"></script>
    <script type="application/vnd.adobe.aue.model+json" src="/mhaack/special-project/component-models.json"></script>
    <script type="application/vnd.adobe.aue.filter+json" src="/mhaack/special-project/component-filters.json"></script>
  </head>
  <body>
    <header></header>
    <main data-aue-resource="urn:ab:main" data-aue-type="container" data-aue-label="Main Content" data-aue-filter="main">
      <div data-aue-resource="urn:ab:section-0" data-aue-type="container" data-aue-label="Section" data-aue-model="section" data-aue-behavior="component" data-aue-filter="section">
        <div class="">Hello world</div>
        <div class="">
          <p>Hello world</p>
          <p></p>
        </div>
        <div class="">
          <p>Hello world</p>
          <p></p>
        </div>
        <div class="">
          <p>Hello world</p>
        </div>
        <div data-aue-resource="urn:ab:section-0/text-4" data-aue-type="richtext" data-aue-label="Text" data-aue-prop="text" data-aue-behavior="component">
          <p>Hello world</p>
        </div>
      </div>
    </main>
    <footer></footer>
  </body>
</html>
`;

(async () => {
  const body = new FormData();
  const data = new Blob([MOCK_PAGE], { type: 'text/html' });
  body.set('data', data);
  
  const headers = { Authorization: `Bearer eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5LWF0LTEuY2VyIiwia2lkIjoiaW1zX25hMS1rZXktYXQtMSIsIml0dCI6ImF0In0.eyJpZCI6IjE3MzcxMTExOTQ4NDlfMWFiNDlhMGYtZTE2YS00NjdmLTk3MDAtYzI0MTlhNjkzNzdjX3ZhNmMyIiwidHlwZSI6ImFjY2Vzc190b2tlbiIsImNsaWVudF9pZCI6ImV4Y19hcHAiLCJ1c2VyX2lkIjoiODQzNjFGODQ2MzFDMzNENjBBNDk1QzExQDdlZWIyMGY4NjMxYzBjYjc0OTVjMDYuZSIsInN0YXRlIjoie1wic2Vzc2lvblwiOlwiaHR0cHM6Ly9pbXMtbmExLmFkb2JlbG9naW4uY29tL2ltcy9zZXNzaW9uL3YxL01qWmhNVFUwTmpRdE9ETXhaQzAwTVdRekxXSm1Namd0WkRWa09UWTVPREprTW1GakxTMURNRGt5UXpoQk1UVTBPRGxFUXpBeE1FRTBRems0UWtOQVlXUnZZbVV1WTI5dFwifSIsImFzIjoiaW1zLW5hMSIsImFhX2lkIjoiQzA5MkM4QTE1NDg5REMwMTBBNEM5OEJDQGFkb2JlLmNvbSIsImN0cCI6MCwiZmciOiJaRUNBMzVLT1hQUDdNSFVLSE1RVjJYQUE1WT09PT09PSIsInNpZCI6IjE3MzcxMDE5NTE2MjJfZmFkYjliYmMtNTlkMy00OWU1LTg0MzEtM2JlMWU5YmFhYWM1X3ZhNmMyIiwibW9pIjoiYmJjZDI4NWMiLCJwYmEiOiJPUkcsTWVkU2VjTm9FVixMb3dTZWMiLCJleHBpcmVzX2luIjoiODY0MDAwMDAiLCJjcmVhdGVkX2F0IjoiMTczNzExMTE5NDg0OSIsInNjb3BlIjoiYWIubWFuYWdlLGFjY291bnRfY2x1c3Rlci5yZWFkLGFkZGl0aW9uYWxfaW5mbyxhZGRpdGlvbmFsX2luZm8uam9iX2Z1bmN0aW9uLGFkZGl0aW9uYWxfaW5mby5wcm9qZWN0ZWRQcm9kdWN0Q29udGV4dCxhZGRpdGlvbmFsX2luZm8ucm9sZXMsQWRvYmVJRCxhZG9iZWlvLmFwcHJlZ2lzdHJ5LnJlYWQsYWRvYmVpb19hcGksYXVkaWVuY2VtYW5hZ2VyX2FwaSxjcmVhdGl2ZV9jbG91ZCxtcHMsb3BlbmlkLG9yZy5yZWFkLHBwcy5yZWFkLHJlYWRfb3JnYW5pemF0aW9ucyxyZWFkX3BjLHJlYWRfcGMuYWNwLHJlYWRfcGMuZG1hX3RhcnRhbixzZXNzaW9uIn0.HWTRn8ifiHMQDUEJC4CMmcoIQdMYkwZyQ51TagnrHcNYiSdPZPJBUTc4laSA-kfqnkWJjMYTossMR3DREBzHcDTxVecfj0P6285bthhBxGpClJRytG6Iobwv5C_fEznFUFE9WveJNfmYF-RNelKkVT5YqTCxGaD4S6f9_wyoSyKJSYE5Zu4rVHKewiDSBW7iEVkQfjvF47FMs3k2u74nUF4SlEj0ZxpJBZRkKPR7j-XDSi9NAYguF8GDFZRo6PJ_cshol_qzZcE7Qw2PPC7drsk8bxZCSKEcePjlqsFDnbBiJM0fJfFDv6af5Y31Hmg1T2Q4PJqeJlrZZhTxkvY7rw` };
  const opts = { method: 'POST', body, headers };

  const path = `${DA_API}/${ORG}/${REPO}/index`;
  const resp = await fetch(path, opts);
  console.log(resp.status);
})();