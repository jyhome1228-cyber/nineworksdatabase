# Nineworks R2 Asset Uploader

Cloudflare Workers + R2 based personal image CDN uploader.

## Current flow

1. Choose an existing R2 project folder, `미분류`, or create a new project folder.
2. Drop JPG / PNG / WEBP images.
3. Browser converts them to optimized WebP.
4. Worker writes WebP files directly to the `nineworks-assets` R2 bucket through the `IMAGE_BUCKET` binding.
5. Copy CDN URL / HTML / CSS.

No GitHub token, AWS key, R2 access key, or upload login is used in the web UI.

## Project folders

- `uncategorized` is always available and appears as **미분류** in the UI.
- Existing top-level R2 folders are loaded from `/api/folders` and shown in the folder selector.
- `새 프로젝트 폴더 만들기` creates a folder automatically when the first image is uploaded.
- The last selected folder, max width, and WebP quality are stored locally in the browser.

## Cloudflare configuration

- Worker deployment: `nineworksdatabase.planus253.workers.dev`
- R2 binding: `IMAGE_BUCKET`
- R2 bucket: `nineworks-assets`
- Static app: `./public`
- Worker: `./src/index.js`
- Upload endpoint: `/api/upload`
- Folder endpoint: `/api/folders`
- Public image path: `/cdn/{folder}/{file}.webp`

## Repository structure

```text
public/
  index.html
  styles.css
  app.js
src/
  index.js
wrangler.jsonc
package.json
index.html      # GitHub Pages redirect only
```

## Deployment

The GitHub repository is connected to Cloudflare Builds. Changes pushed to `main` are automatically built and deployed with `npx wrangler deploy`.

## URL example

```text
https://nineworksdatabase.planus253.workers.dev/cdn/aesost/20260907-...webp
```

Later, a custom domain such as `assets.nineworks.kr` can replace the workers.dev host while keeping the same `/cdn/{folder}/{file}.webp` structure.

## Design system

The uploader UI uses a token-based layout, spacing, type, radius, interaction and responsive system. Color remains a neutral project-level palette and is not treated as part of the universal structural system.

## Security note

This is intentionally a simple personal tool with no upload login. The upload endpoint uses a same-origin browser guard and is not intended as a public multi-user upload service.
