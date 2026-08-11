# Document Authoring Universal Editor Integration

Document Authoring is a research project and which works nicely with Universal Editor.
Implemented as a worker that prepares the stored CMS page for UE, injects the corresponding scripts and provides a reverse proxy for Edge Delivery Services assets.

## Developing locally

### Run

Prerequisites:

This worker performs all content operations via [da-admin](https://github.com/adobe/da-admin). For local development, you will also need to check out and run da-admin locally.

Site lookups go to config.aem.page, which needs a shared secret, so local development points at `dev/config-shim.js` instead. Add the org and site to the `SITES` table in that file; a site missing from it is answered 404.

To run da-universal locally:

1. Clone this repo to your computer.
1. Run `npm install`
1. Use `npx wrangler login` if not done before. Walk through the steps in browser.
1. In a terminal, run `npm run dev:config` to start the stand-in config service on port 4713.
1. In a second terminal, run `npm run dev` in this repo's folder.
1. The da-ue service API is available via https://localhost:4712

Anyone who has the shared secret can point `npm run dev` at config.aem.page instead of the stand-in. Put `HLX_CONFIG_SERVICE_TOKEN="<token>"` in `.dev.vars.dev`, which is gitignored, and run `npm run dev -- --var HLX_CONFIG_SERVICE:https://config.aem.page`.

### Run on stage

You can deploy da-universal on Cloudflare stage via `npm deploy:stage` to test it in a real worker environment.

## Customer documentation
https://docs.da.live/developers/reference/universal-editor
