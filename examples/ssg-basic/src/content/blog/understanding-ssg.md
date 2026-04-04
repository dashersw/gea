---
title: Understanding Static Site Generation
date: 2025-03-10
excerpt: What SSG means, why it matters, and how @geajs/ssg pre-renders your routes at build time.
---

Static Site Generation (SSG) pre-renders your pages at build time into **plain HTML files**. This means zero JavaScript is needed for initial content display, giving you instant loads and perfect SEO.

## How It Works

The `@geajs/ssg` package does three things at build time:

1. **Crawls** your route map to discover all pages
2. **Renders** each component via `Component.template()`
3. **Writes** the output HTML to disk

## Dynamic Routes

For parameterized routes like `/blog/:slug`, you define a static `getStaticPaths()` method:

```tsx
export default class BlogPost extends Component {
  static getStaticPaths() {
    return posts.map(p => ({
      params: { slug: p.slug },
      props: { title: p.title, html: p.html },
    }))
  }
}
```

## Markdown Support

You can also write content in Markdown files with frontmatter:

```md
---
title: My Post
date: 2025-03-10
---

Content goes here with **bold**, *italic*, and `code`.
```

Load them with `loadContent()` and pass the rendered HTML as props.

## The Result

Each page becomes a standalone `.html` file — no client JS, no loading spinners. Just instant content.
