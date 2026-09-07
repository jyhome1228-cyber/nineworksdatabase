# Nineworks CDN Uploader

Simple browser-based image uploader for testing a direct CDN workflow.

## What it does

- Drop up to 10 JPG / PNG / WEBP images
- Convert them to optimized WebP in the browser
- Upload directly to Cloudinary with an **unsigned upload preset**
- Return short CDN URLs plus reusable HTML / CSS code
- Save the Cloud name, preset name, and folder locally in the browser for convenience

## Live page

`https://jyhome1228-cyber.github.io/nineworksdatabase/`

## One-time setup

1. Create a free Cloudinary account.
2. Create an **unsigned upload preset**.
3. Copy your **Cloud name** and the **preset name**.
4. Open the page above and enter the Cloud name and preset name once.
5. Drag images and click **UPLOAD & GET CDN**.

## Output

- CDN URL
- HTML `<img>` code
- CSS `background-image` code

## Notes

- This version does **not** upload images to GitHub.
- No GitHub token, Vercel, or separate backend is needed for this test flow.
- The unsigned preset is intentionally used for a simple personal test workflow.
