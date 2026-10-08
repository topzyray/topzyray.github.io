# Tope Taiwo — Personal Website

Personal website and engineering blog for Tope Taiwo.

Built with:

- Jekyll
- Chirpy
- Ruby
- GitHub Pages
- GitHub Actions

## Development

Install Ruby, Bundler and the project dependencies.

```bash
bundle install
```

## Publishing posts

Add posts under `_posts` using a `YYYY-MM-DD-title.md` filename and valid YAML
front matter. Keep `categories` and `tags` as separate, indented lists:

```yaml
---
title: "Post title"
date: 2026-10-09 08:00:00 +0100
categories:
  - Backend Engineering
tags:
  - nodejs
  - architecture
---
```

The deployment workflow validates post titles, dates, categories, and tags
before building the site. Jekyll excludes posts dated in the future and keeps
published posts available afterward. A daily scheduled build at 08:05
`Africa/Lagos` time makes posts dated for that day available without requiring a
new commit. Use an `Africa/Lagos` publication time of 08:00 or earlier so the
scheduled build includes the post; GitHub may delay scheduled workflow runs.
