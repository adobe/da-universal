# Document Authoring Universal Editor Integration

Document Authoring is a research project and which works nicely with Universal Editor.
Implemented as a worker that prepares the stored CMS page for UE, injects the corresponding scripts and provides a reverse proxy for Edge Delivery Services assets.

## Developing locally

### Run

To run da-universal locally:

1. Clone this repo to your computer.
1. Run `npm install`
1. Use `npx wrangler login` if not done before. Walk through the steps in browser.
1. In a terminal, run `npm run dev` this repo's folder.
1. The da-ue service API is available via https://localhost:8787

### Run on stage

You can deploy da-universal on Cloudflare stage via `npm deploy:stage` to test it in a real worker environment.
