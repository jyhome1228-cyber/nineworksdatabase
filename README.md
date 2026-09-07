# Nineworks Image Database

Internal image utility for turning JPG/PNG/WEBP files into optimized WebP assets, saving them to this GitHub repository, and generating reusable image URLs / HTML / CSS.

## Frontend

GitHub Pages:

`https://jyhome1228-cyber.github.io/nineworksdatabase/`

The page does **not** ask for or store a GitHub token. Images are optimized in the browser and then sent to a small private upload API.

## Secure upload API

The repository includes `api/upload.js`, designed for Vercel Functions.

Required Vercel environment variables:

- `GITHUB_IMAGE_TOKEN` — fine-grained GitHub PAT restricted to `nineworksdatabase`, with Repository permissions → Contents: Read and write
- `NINEWORKS_ACCESS_CODE` — a private administrator code chosen by the owner

The GitHub token stays on the server. The browser only stores the administrator code locally after the first successful connection.

Expected production endpoint:

`https://nineworksdatabase.vercel.app/api/upload`

If the Vercel project receives a different domain, set the browser override once in DevTools:

```js
localStorage.setItem('nineworks_api_url', 'https://YOUR-VERCEL-DOMAIN.vercel.app/api/upload')
location.reload()
```

## GitHub Pages setup

1. Repository → Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` / `(root)`
4. Save

## Current limits

- Up to 50 images selected per browser batch
- JPG / PNG / WEBP input
- WebP output
- 1600 / 1920 / 2400 / 3000 px max-width
- Large images are adaptively recompressed to stay within the serverless upload size target
- Upload requests are automatically split into smaller commit batches
- Assets are stored at `/images/{project}/...`

## Recommended operating target

For a GitHub-backed image library, aim for roughly 300–500 KB per image where visual quality permits and keep the repository comfortably below 1 GB. For a substantially larger image library, migrate the storage layer to object storage/CDN while keeping the same uploader UI.
