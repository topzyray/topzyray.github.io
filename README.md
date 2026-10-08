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

## Comments and listening

Comments support both Utterances and Disqus. Utterances links a GitHub issue to
each post by its URL; the repository's Issues feature must remain enabled, and
the Utterances GitHub App must be installed with access to this repository.
Readers need a GitHub account to comment or react there.

For guest comments, create a Disqus site and set its shortname in
`comments.disqus.shortname` in `_config.yml`. Enable guest commenting and
configure moderation in the Disqus dashboard. Visitors can then comment through
Disqus without a GitHub account. The two comment systems are shown separately
on each post.

Post pages also include a read-aloud control that uses the browser's built-in
speech synthesis. Available voices and playback behavior depend on the reader's
browser and device; no audio files are generated or stored.
