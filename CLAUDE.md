# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker that integrates Document Authoring (DA) with Adobe Universal Editor (UE). The worker:
- Fetches content from da-admin service
- Injects Universal Editor scripts and attributes
- Proxies static resources from AEM Edge Delivery Services
- Prepares HTML for in-context editing

## Development Commands

### Local Development
```bash
npm run dev        # Start local development server at https://localhost:4712
npm start          # Alias for npm run dev
```

**Prerequisites for local dev:**
- Check out and run [da-admin](https://github.com/adobe/da-admin) locally
- Run `npx wrangler login` if not already authenticated

### Testing and Linting
```bash
npm test           # Run all tests with coverage (c8 + mocha)
npm run lint       # Run ESLint
```

### Deployment
```bash
npm run deploy:stage  # Deploy to Cloudflare stage environment
npm run deploy        # Deploy to production
```

## Architecture

### Request Flow
1. **Entry point**: `src/index.js` - Cloudflare Worker fetch handler
2. **HTTP method routing**: Dispatches to specialized handlers based on request method
   - `handlers/get.js` - GET requests
   - `handlers/post.js` - POST requests (content updates)
   - `handlers/head.js` - HEAD requests
   - `handlers/options.js` - CORS preflight
   - `handlers/unknown.js` - Unsupported methods

### Route Handling (GET)
- **Static resources** (`.css`, `.js`, `.png`, etc.) → `routes/aem-proxy.js` - proxies to AEM
- **Content pages** → `routes/da-admin.js` - fetches from da-admin and prepares for UE

### Context Extraction
- **`utils/daCtx.js`**: Parses URL to extract org, site, ref, and path
  - Local URLs: `localhost:4712/{org}/{site}/{path}`
  - Production URLs: `{ref}--{site}--{org}.ue.da.live/{path}`
- **`utils/aemCtx.js`**: Creates AEM context for fetching AEM resources (head.html, etc.)

### Universal Editor Integration
The `ue/` directory handles UE-specific transformations:
- **`ue/ue.js`**: Main orchestration - `prepareHtml()` function:
  1. Fetches bulk metadata
  2. Extracts local metadata from content
  3. Injects AEM head entries (scripts, links)
  4. Injects UE head entries (connection scripts)
  5. Rewrites icon references
  6. Injects UE data attributes for editability
- **`ue/scaffold.js`**: Generates HTML document structure, UE configuration
- **`ue/attributes.js`**: Adds/removes `data-*` attributes for UE
- **`ue/metadata.js`**: Fetches and processes metadata
- **`ue/rewrite-icons.js`**: Rewrites icon references for UE compatibility

### HTML Manipulation
Uses **hast** (Hypertext Abstract Syntax Tree) utilities for HTML transformation:
- `hast-util-from-html` - Parse HTML to AST
- `hast-util-to-html` - Serialize AST to HTML
- `hast-util-select` - Query AST (like CSS selectors)
- `hast-util-format` - Format HTML output
- `hastscript` - Build AST nodes programmatically

### Content Persistence (POST)
When content is saved in UE:
1. Receives HTML from UE via POST
2. Unwraps paragraph wrappers (`ue/attributes.js`)
3. Removes UE data attributes
4. Minifies whitespace
5. Forwards cleaned content to da-admin service

## Code Style

### File Header
All source files must include Apache 2.0 copyright:
```javascript
/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * ...
 */
```

### JavaScript Conventions
- **ES modules**: Use `import`/`export`, not `require()`
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use
- **Async**: Prefer async/await over promises
- **Variables**: `const` by default, `let` when reassignment needed, never `var`
- **Naming**: camelCase for functions/variables, PascalCase for classes, UPPER_CASE for constants

### Import Organization
```javascript
// External dependencies first (alphabetically)
import { select } from 'hast-util-select';
import { visit } from 'unist-util-visit';

// Internal imports next (alphabetically)
import { getDaCtx } from './utils/daCtx.js';
import { formatResponse } from './helpers/formatter.js';
```

### JSDoc for Complex Functions
```javascript
/**
 * Processes the request and returns a formatted response
 * @param {Object} options - The options object
 * @param {Request} options.req - The request object
 * @param {Object} options.env - Environment variables
 * @returns {Response} The formatted response
 */
async function processRequest({ req, env }) {
  // ...
}
```

## Configuration

### Environment Variables (wrangler.toml)
- **`UE_HOST`**: Universal Editor host (varies by environment)
- **`DA_ADMIN`**: da-admin service URL
- **`ENVIRONMENT`**: Current environment (dev/stage/prod)
- **Service binding**: `daadmin` - binds to da-admin worker

### Site Configuration
- Stored via `storage/config.js`
- Supports `editor.ue.template` configuration for custom page templates
- Templates are path-prefix based (longest prefix wins)

## Testing

Tests use Mocha with c8 for coverage:
- Located in `test/` directory
- Mirror source structure (e.g., `test/ue/attributes.test.js` for `src/ue/attributes.js`)
- Use esmock for ES module mocking
