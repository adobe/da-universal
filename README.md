# Document Authoring Universal Editor Integration

Document Authoring is a research project and which works nicely with Universal Editor.
Implemented as a worker that prepares the stored CMS page for UE, injects the corresponding scripts and provides a reverse proxy for Edge Delivery Services assets.

## Developing locally

### Run

Prerequisites:

This worker performs all content operations via [da-admin](https://github.com/adobe/da-admin). For local development, you will also need to check out and run da-admin locally.

One read of config.aem.page, pipeline scope, answers existence, head.html and `contentSource`. Its url names the store.

The config service needs a shared secret, so local development points at `dev/lookup-shim.js` instead. Add the org and site to its `SITES` table. A site missing from the table is answered 404. A source url on api.aem.live reads as source-bus, and the table ships one site of each kind, `org/site` and `org/sourcebus`, so both branches can be driven locally.

To run da-universal locally:

1. Clone this repo to your computer.
1. Run `npm install`
1. Use `npx wrangler login` if not done before. Walk through the steps in browser.
1. Put `HLX_CONFIG_SERVICE_TOKEN="local"` in `.dev.vars.dev`, which is gitignored.
1. In a terminal, run `npm run dev:lookups` to start the stand-in lookups on port 4713.
1. In a second terminal, run `npm run dev` in this repo's folder.
1. The da-ue service API is available via https://localhost:4712

The stand-in does not read the token's value, only that there is one. Without it the lookup goes out as the string `undefined` and comes back 401, the way the real service refuses it, and the worker logs that it is the one at fault.

`npm run dev` sets `UE_HOST` to localhost:4712, so https://localhost:4712 serves the UE-instrumented page rather than the composed page as-is, and points `urn:adobe:aue:config:service` at https://localhost:8000. A Universal Editor service has to be running there for that page to open in the editor.

with the shared secret, use `npm run dev` at the real services instead of the stand-in. Put `HLX_CONFIG_SERVICE_TOKEN="<token>"` in `.dev.vars.dev`, which is gitignored, and run `npm run dev -- --var HLX_CONFIG_SERVICE:https://config.aem.page`.

### Run on stage

You can deploy da-universal on Cloudflare stage via `npm run deploy:stage` to test it in a real worker environment.

## Customer documentation
https://docs.da.live/developers/reference/universal-editor
