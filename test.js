const DA_API = 'https://stage-ue.da.live';
const ORG = 'mhaack';
const REPO = 'special-project';

const MOCK_PAGE = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="/mhaack/special-project/scripts/aem.js" type="module"></script>
<script src="/mhaack/special-project/scripts/scripts.js" type="module"></script>
<link rel="stylesheet" href="/mhaack/special-project/styles/styles.css"/>

    <meta name="urn:adobe:aue:system:ab" content="da:https://admin.da.live/source/mhaack/special-project/index.html"/>
    <script type="application/vnd.adobe.aue.component+json" src="/mhaack/special-project/component-definition.json"></script>
    <script type="application/vnd.adobe.aue.model+json" src="/mhaack/special-project/component-models.json"></script>
    <script type="application/vnd.adobe.aue.filter+json" src="/mhaack/special-project/component-filters.json"></script>
    <script src="https://universal-editor-service.adobe.io/cors.js" async=""></script>
    <meta name="urn:adobe:aue:config:service" content="https://universal-editor-service-dev.adobe.io">
</head>
<body>
    <header></header>
    <main>
      <div>
        <p>
          <picture>
            <source type="image/webp" srcset="./media_1dc0a2d290d791a050feb1e159746f52db392775a.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
            <source type="image/webp" srcset="./media_1dc0a2d290d791a050feb1e159746f52db392775a.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
            <source type="image/jpeg" srcset="./media_1dc0a2d290d791a050feb1e159746f52db392775a.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
            <img loading="lazy" alt="Decorative double Helix" src="./media_1dc0a2d290d791a050feb1e159746f52db392775a.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="886">
          </picture>
        </p>
        <h1 id="congrats-you-are-ready-to-go">Congrats, you are ready to go!</h1>
        <p>Your forked repo is set up as an AEM Project and you are ready to start developing.<br>The content you are looking at is served from this <a href="https://drive.google.com/drive/folders/1MGzOt7ubUh3gu7zhZIPb7R7dyRzG371j?usp=sharing">Google Drive</a><br><br>Adjust the <code>fstab.yaml</code> to point to a folder either in your sharepoint or your gdrive that you shared with AEM. See the full tutorial here:<br><br><a href="https://bit.ly/3aImqUL">https://www.aem.live/tutorial</a></p>
        <h2 id="this-is-another-headline-here-for-more-content">This is another headline here for more content</h2>
        <div class="columns">
          <div>
            <div>
              <p>Columns block</p>
              <ul>
                <li>One</li>
                <li>Two</li>
                <li>Three</li>
              </ul>
              <p><a href="/">Live</a></p>
            </div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_17e9dd0aae03d62b8ebe2159b154d6824ef55732d.png?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_17e9dd0aae03d62b8ebe2159b154d6824ef55732d.png?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/png" srcset="./media_17e9dd0aae03d62b8ebe2159b154d6824ef55732d.png?width=2000&#x26;format=png&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="green double Helix" src="./media_17e9dd0aae03d62b8ebe2159b154d6824ef55732d.png?width=750&#x26;format=png&#x26;optimize=medium" width="1600" height="1066">
              </picture>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_143cf1a441962c90f082d4f7dba2aeefb07f4e821.png?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_143cf1a441962c90f082d4f7dba2aeefb07f4e821.png?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/png" srcset="./media_143cf1a441962c90f082d4f7dba2aeefb07f4e821.png?width=2000&#x26;format=png&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="Yellow Double Helix" src="./media_143cf1a441962c90f082d4f7dba2aeefb07f4e821.png?width=750&#x26;format=png&#x26;optimize=medium" width="644" height="470">
              </picture>
            </div>
            <div>
              <p>Or you can just view the preview</p>
              <p><em><a href="/">Preview</a></em></p>
            </div>
          </div>
        </div>
      </div>
      <div>
        <h2 id="boilerplate-highlights">Boilerplate Highlights?</h2>
        <p>Find some of our favorite staff picks below:</p>
        <div class="cards">
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_16582eee85490fbfe6b27c6a92724a81646c2e649.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_16582eee85490fbfe6b27c6a92724a81646c2e649.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_16582eee85490fbfe6b27c6a92724a81646c2e649.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="A fast-moving Tunnel" src="./media_16582eee85490fbfe6b27c6a92724a81646c2e649.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="909">
              </picture>
            </div>
            <div>
              <p><strong>Unmatched speed</strong></p>
              <p>AEM is the fastest way to publish, create, and serve websites</p>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_17a5ca5faf60fa6486a1476fce82a3aa606000c81.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_17a5ca5faf60fa6486a1476fce82a3aa606000c81.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_17a5ca5faf60fa6486a1476fce82a3aa606000c81.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="An iceberg" src="./media_17a5ca5faf60fa6486a1476fce82a3aa606000c81.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="1101">
              </picture>
            </div>
            <div>
              <p><strong>Content at scale</strong></p>
              <p>AEM allows you to publish more content in shorter time with smaller teams</p>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_162cf9431ac2dfd17fe7bf4420525bbffb9d0ccfe.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_162cf9431ac2dfd17fe7bf4420525bbffb9d0ccfe.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_162cf9431ac2dfd17fe7bf4420525bbffb9d0ccfe.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="Doors with light in the dark" src="./media_162cf9431ac2dfd17fe7bf4420525bbffb9d0ccfe.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="889">
              </picture>
            </div>
            <div>
              <p><strong>Uncertainty eliminated</strong></p>
              <p>Preview content at 100% fidelity, get predictable content velocity, and shorten project durations</p>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_136fdd3174ff44787179448cc2e0264af1b02ade9.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_136fdd3174ff44787179448cc2e0264af1b02ade9.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_136fdd3174ff44787179448cc2e0264af1b02ade9.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="A group of people around a Table" src="./media_136fdd3174ff44787179448cc2e0264af1b02ade9.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="1045">
              </picture>
            </div>
            <div>
              <p><strong>Widen the talent pool</strong></p>
              <p>Authors on AEM use Microsoft Word, Excel or Google Docs and need no training</p>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_1cae8484004513f76c6bf5860375bc020d099a6d6.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_1cae8484004513f76c6bf5860375bc020d099a6d6.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_1cae8484004513f76c6bf5860375bc020d099a6d6.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="HTML code in a code editor" src="./media_1cae8484004513f76c6bf5860375bc020d099a6d6.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="1059">
              </picture>
            </div>
            <div>
              <p><strong>The low-code way to developer productivity</strong></p>
              <p>Say goodbye to complex APIs spanning multiple languages. Anyone with a little bit of HTML, CSS, and JS can build a site on AEM.</p>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_11381226cb58caf1f0792ea27abebbc8569b00aeb.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_11381226cb58caf1f0792ea27abebbc8569b00aeb.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_11381226cb58caf1f0792ea27abebbc8569b00aeb.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="A rocket and a headless suit" src="./media_11381226cb58caf1f0792ea27abebbc8569b00aeb.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="1066">
              </picture>
            </div>
            <div>
              <p><strong>Headless is here</strong></p>
              <p>Go directly from Microsoft Excel or Google Sheets to the web in mere seconds. Sanitize and collect form data at extreme scale with AEM Forms.</p>
            </div>
          </div>
          <div>
            <div>
              <picture>
                <source type="image/webp" srcset="./media_18fadeb136e84a2efe384b782e8aea6e92de4fc13.jpeg?width=2000&#x26;format=webply&#x26;optimize=medium" media="(min-width: 600px)">
                <source type="image/webp" srcset="./media_18fadeb136e84a2efe384b782e8aea6e92de4fc13.jpeg?width=750&#x26;format=webply&#x26;optimize=medium">
                <source type="image/jpeg" srcset="./media_18fadeb136e84a2efe384b782e8aea6e92de4fc13.jpeg?width=2000&#x26;format=jpeg&#x26;optimize=medium" media="(min-width: 600px)">
                <img loading="lazy" alt="A dial with a hand on it" src="./media_18fadeb136e84a2efe384b782e8aea6e92de4fc13.jpeg?width=750&#x26;format=jpeg&#x26;optimize=medium" width="1600" height="1120">
              </picture>
            </div>
            <div>
              <p><strong>Peak performance</strong></p>
              <p>Use AEM's serverless architecture to meet any traffic need. Use AEM's PageSpeed Insights Github action to evaluate every Pull-Request for Lighthouse Score.</p>
            </div>
          </div>
        </div>
        <div class="section-metadata">
          <div>
            <div>Style</div>
            <div>highlight</div>
          </div>
        </div>
        <div class="metadata">
          <div>
            <div>Title</div>
            <div>UE & DA</div>
          </div>
          <div>
            <div>Theme</div>
            <div>my-theme</div>
          </div>
        </div>
      </div>
      <div></div>
    </main>
    <footer></footer>
  </body>
</html>`;

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