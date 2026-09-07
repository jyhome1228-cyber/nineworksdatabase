# Nineworks Image Database

Internal test utility for turning local JPG/PNG/WEBP images into optimized WebP assets, committing them to this repository, and generating reusable image URLs / HTML / CSS.

## First-time setup

1. GitHub repository → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main / (root)**
4. Save
5. Open `https://jyhome1228-cyber.github.io/nineworksdatabase/`

## Upload authentication

The web page never hard-codes or persists a GitHub token. Create a **fine-grained personal access token** restricted to this repository only:

- Repository access: `nineworksdatabase` only
- Repository permissions → Contents: **Read and write**

Paste the token into the page only when uploading. Closing/reloading the page clears it.

## Current test limits

- 50 images per batch
- JPG / PNG / WEBP input
- WebP output
- 1600 / 1920 / 2400 / 3000 px max-width options
- Each batch is written as one Git commit
- Assets stored at `/images/{project}/...`

## Recommended operating target

For a GitHub-backed image library, aim for roughly 300–500 KB per image where visual quality permits and keep the repository comfortably below 1 GB. For a substantially larger image library, migrate the storage layer to object storage/CDN (for example Cloudflare R2) while keeping the same uploader UI.
