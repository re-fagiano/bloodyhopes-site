# Bloody Hopes — website

Static site for the Bloody Hopes project. No build step required: plain HTML/CSS.

## Structure

- `index.html`, `about.html`, `catalog.html` — main pages
- `songs/` — historical deep-dive pages for individual songs
- `assets/style.css` — shared stylesheet
- `robots.txt`, `sitemap.xml`, `llms.txt` — SEO / AI-agent discoverability files

## How to update the live site

This repo is connected to Cloudflare Pages for automatic deployment. To publish a change:

1. Edit the file(s) you need (or replace them with updated versions).
2. Commit and push to the `main` branch (or use GitHub's web "Edit"/"Upload files" button if you're not using git locally).
3. Cloudflare Pages detects the push automatically and redeploys the site within a minute or two — no manual re-upload needed.

## Adding a new song page

1. Duplicate one of the files in `songs/` as a template.
2. Update the title, YouTube embed ID (`https://www.youtube.com/embed/VIDEO_ID`), historical facts, and JSON-LD block.
3. Add a card for it in `catalog.html` under the correct era section.
4. Push the changes — Cloudflare Pages will redeploy automatically.

## Before going fully live

Replace every occurrence of `bloodyhopesmusic.example` (canonical tags, Open Graph tags, sitemap.xml, llms.txt) with the real production domain once it's registered and connected.
