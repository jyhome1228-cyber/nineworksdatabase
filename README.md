# Nineworks R2 Asset Uploader

Cloudflare Workers + R2 based personal image CDN uploader.

## Flow

1. Drop JPG / PNG / WEBP images
2. Browser converts them to optimized WebP
3. Worker writes the WebP file directly to an R2 bucket using an R2 binding
4. The Worker returns a CDN URL
5. Copy URL / HTML / CSS

No GitHub token, AWS key, R2 access key, or upload login is used in the web UI.

## Cloudflare deployment

This repository is already configured as a Cloudflare Workers project.

- Worker name: `nineworks-assets`
- R2 binding: `IMAGE_BUCKET`
- R2 bucket: `nineworks-assets`
- Static app: `./public`
- Upload endpoint: `/api/upload`
- Public image path: `/cdn/{folder}/{file}.webp`

### Dashboard

1. Cloudflare Dashboard → **Workers & Pages**
2. **Create application**
3. **Import a repository**
4. Select `jyhome1228-cyber/nineworksdatabase`
5. Save and Deploy

The repository already includes `wrangler.jsonc`. Current Wrangler versions can automatically provision supported resources such as the R2 bucket and bind them during deployment.

After deployment, open the provided `*.workers.dev` address and upload an image.

Example result:

`https://nineworks-assets.<your-workers-subdomain>.workers.dev/cdn/aesost/20260907-...webp`

## Later: custom domain

When the upload test is stable, connect a custom domain such as:

`assets.nineworks.kr`

Then image URLs can look like:

`https://assets.nineworks.kr/cdn/aesost/20260907-...webp`

## Security note

This is intentionally a simple personal test tool with no login. The upload endpoint uses only a same-origin browser guard; it is not intended as a public multi-user upload service. Add Cloudflare Access or another authorization layer before exposing the uploader broadly.
