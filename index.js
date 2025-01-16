const DA_API = 'https://admin.da.live/source';
const ORG = 'mhaack';
const REPO = 'special-project';

const MOCK_PAGE = `
  <body>
    <header></header>
    <main data-aue-type="container" data-aue-resource="urn:daconnection:1234">
    <div data-aue-type="container" data-aue-model="section" data-aue-resource="urn:daconnection:5678">
    <h1>Hello World</h1>
    </div>
    </main>
    <footer></footer>
  </body>`;

(async () => {
  const body = new FormData();
  const data = new Blob([MOCK_PAGE], { type: 'text/html' });
  body.set('data', data);
  
  const headers = { Authorization: `Bearer eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5LWF0LTEuY2VyIiwia2lkIjoiaW1zX25hMS1rZXktYXQtMSIsIml0dCI6ImF0In0.eyJpZCI6IjE3MzY5NTIxNjUwOTNfZDczNGM3NWQtYjQ4OC00MWRmLThjY2QtYjVmMzZhMjM0Y2VmX3ZhNmMyIiwidHlwZSI6ImFjY2Vzc190b2tlbiIsImNsaWVudF9pZCI6ImV4Y19hcHAiLCJ1c2VyX2lkIjoiODQzNjFGODQ2MzFDMzNENjBBNDk1QzExQDdlZWIyMGY4NjMxYzBjYjc0OTVjMDYuZSIsInN0YXRlIjoie1wic2Vzc2lvblwiOlwiaHR0cHM6Ly9pbXMtbmExLmFkb2JlbG9naW4uY29tL2ltcy9zZXNzaW9uL3YxL01qWmhNVFUwTmpRdE9ETXhaQzAwTVdRekxXSm1Namd0WkRWa09UWTVPREprTW1GakxTMURNRGt5UXpoQk1UVTBPRGxFUXpBeE1FRTBRems0UWtOQVlXUnZZbVV1WTI5dFwifSIsImFzIjoiaW1zLW5hMSIsImFhX2lkIjoiQzA5MkM4QTE1NDg5REMwMTBBNEM5OEJDQGFkb2JlLmNvbSIsImN0cCI6MCwiZmciOiJaRDQzRjVLT1hQUDdNSFVLSE1RVjJYQUE1WT09PT09PSIsInNpZCI6IjE3MzY3ODA3OTA1NjRfYzFkZDc5NDktZmJiZS00NjA1LWI1MjItM2FhNThmZTA0MTI1X3VlMSIsIm1vaSI6IjFiMDVjNGVlIiwicGJhIjoiT1JHLE1lZFNlY05vRVYsTG93U2VjIiwiZXhwaXJlc19pbiI6Ijg2NDAwMDAwIiwiY3JlYXRlZF9hdCI6IjE3MzY5NTIxNjUwOTMiLCJzY29wZSI6ImFiLm1hbmFnZSxhY2NvdW50X2NsdXN0ZXIucmVhZCxhZGRpdGlvbmFsX2luZm8sYWRkaXRpb25hbF9pbmZvLmpvYl9mdW5jdGlvbixhZGRpdGlvbmFsX2luZm8ucHJvamVjdGVkUHJvZHVjdENvbnRleHQsYWRkaXRpb25hbF9pbmZvLnJvbGVzLEFkb2JlSUQsYWRvYmVpby5hcHByZWdpc3RyeS5yZWFkLGFkb2JlaW9fYXBpLGF1ZGllbmNlbWFuYWdlcl9hcGksY3JlYXRpdmVfY2xvdWQsbXBzLG9wZW5pZCxvcmcucmVhZCxwcHMucmVhZCxyZWFkX29yZ2FuaXphdGlvbnMscmVhZF9wYyxyZWFkX3BjLmFjcCxyZWFkX3BjLmRtYV90YXJ0YW4sc2Vzc2lvbiJ9.TZG6562CR5Md7oFwFTlDk5RqeugRBmy3JdS92Vvlw7IM5A2_3y0fmrxelTTHdflxIGK0qDDxos1P0M1tSzOapK9zHUSkeKykG0ODAHb_2nuX8ydYNcrJD3OLVZHg8Vbmf01dMo1wf6oJt96ku0sPzTvDynny6DdWf4iz7s33-ek9Ahoc78ZHqk0EzJL9cF556gdJ7nzHGxw_5AdssP-w48BMyMBs_MizrQRCI-Il8L2DPEN3ICy2SILi2bvaYWDSbGOl2B9nQqrlKj4fzShW7w3XWgH1jKAadSF4vO8hoSXzvxccTN_hHywQ_7i_BzQ8ExGuazQTDhRkL-JtO3dO6g` };
  const opts = { method: 'POST', body, headers };

  const path = `${DA_API}/${ORG}/${REPO}/new.html`;
  const resp = await fetch(path, opts);
  console.log(resp.status);
})();