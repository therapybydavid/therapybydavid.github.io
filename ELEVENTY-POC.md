# Eleventy Proof of Concept (Phase 1)

This is a **self-contained proof of concept** showing how a static site generator
(Eleventy) would let us write blog posts as simple Markdown files instead of
hand-building full HTML pages. **It does not touch the live site** — all of it
lives under `src/` and builds into `_site/` (which is git-ignored).

## What it demonstrates

1. **Write a post as Markdown + a YAML header** — see `src/blog/managing-anxiety.md`.
   That one short file replaces a ~335-line hand-written HTML page.
2. **The layout is defined once** — `src/_includes/base.njk` holds the `<head>`,
   nav, and footer for every page. Change a footer link here → every page updates.
3. **Styling lives in one file** — `src/assets/style.css`, extracted from the
   CSS that used to be copy-pasted inline into 45 separate pages.
4. **The blog index builds itself** — `src/blog.njk` automatically lists every
   post. Add a new `.md` file and it appears in the list, no manual editing.
5. **SEO carries over** — `BlogPosting` structured data, canonical URL, Open
   Graph tags, and title are all generated automatically from the YAML header.

## How to use it

```bash
npm install            # one-time: install Eleventy
npm run build          # build the site into _site/
npm run serve          # live preview at http://localhost:8080
```

## Adding a new blog post (the whole point)

Create a file like `src/blog/my-new-post.md`:

```markdown
---
title: "My New Post Title"
description: "One-sentence summary for search engines."
date: 2026-06-25
tag: Anxiety
readTime: "5 min read"
deck: "The bold intro line shown under the title."
permalink: "/blog/my-new-post/"
---

Write the article here in plain Markdown. Headings with ##, lists with -,
quotes with >. No HTML required.
```

Save it, run the build, and you have a fully styled, SEO-ready article plus an
updated blog index.

## Project layout

```
.eleventy.js            Eleventy config (input/output dirs + date filters)
package.json            Declares the Eleventy dependency
src/
  _data/site.json       Business info + nav links (one source of truth)
  _includes/
    base.njk            Shared <head> + nav + footer (define once)
    post.njk            Blog-post layout (hero, article body, CTA)
  assets/style.css      Shared stylesheet (extracted from inline CSS)
  blog/
    blog.json           Defaults for every post in this folder
    managing-anxiety.md  Example: a real post converted to Markdown
  blog.njk              Auto-generated blog index
```

## Status

This is **Phase 1 only**. Nothing here is deployed. If we proceed, later phases
would migrate the remaining 21 blog posts and the main pages, add an RSS feed,
and finally cut Cloudflare Pages over to the Eleventy build.
