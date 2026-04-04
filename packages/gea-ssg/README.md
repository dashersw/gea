# @geajs/ssg

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/dashersw/gea/blob/master/LICENSE)

Static site generation plugin for [Gea](https://www.npmjs.com/package/@geajs/core). Pre-renders your routes to static HTML at build time — instant first paint, full SEO, and selective client-side hydration. Pages without interactive components ship zero JavaScript.

## Installation

```bash
npm install -D @geajs/ssg
```

Requires `@geajs/core` ^1.0.0 and `vite` ^8.0.0 as peer dependencies.

## Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import { geaSSG } from '@geajs/ssg/vite'

export default defineConfig({
  plugins: [
    geaPlugin(),
    geaSSG({
      contentDir: 'src/content',
      sitemap: { hostname: 'https://example.com' },
      robots: true,
      minify: true,
    }),
  ],
})
```

Your `src/App.tsx` must export `routes` (a `RouteMap`) and `App` (or a default export):

```tsx
export const routes = {
  '/': Home,
  '/about': About,
  '/blog': Blog,
  '/blog/:slug': { component: BlogPost, content: 'blog' },
  '*': NotFound,
}

export default class App extends Component {
  template() {
    return (
      <div>
        <Head title="My Site" description="Site description" />
        <nav>...</nav>
        <RouterView routes={routes} />
      </div>
    )
  }
}
```

Run `vite build` and every route is pre-rendered to `dist/`.

## Features

### Head Management

The `Head` component sets per-page title, meta tags, Open Graph, Twitter Cards, canonical URL, and JSON-LD:

```tsx
import { Component, Head } from '@geajs/core'

class BlogPost extends Component {
  template(props) {
    const post = ssg.file('blog', props?.slug)
    return (
      <article>
        <Head
          title={post?.frontmatter.title + ' | Blog'}
          description={post?.frontmatter.excerpt}
          url={'/blog/' + post?.slug}
          image="/og.png"
          type="article"
          lastmod={post?.frontmatter.date}
          jsonld={{ '@type': 'BlogPosting', headline: post?.frontmatter.title }}
        />
        <h1>{post?.frontmatter.title}</h1>
        <div>{post?.html}</div>
      </article>
    )
  }
}
```

Set a default `Head` in your App and override per page — scalar values (title, description) are replaced, arrays (meta, link) are merged. During SSG the tags are injected into the HTML `<head>`. In the browser, `document.title` and meta elements are updated on navigation.

**Shorthand expansion:** `title` sets `<title>`, `og:title`, `twitter:title`. `description` sets `<meta name="description">`, `og:description`, `twitter:description`. `image` sets `og:image`, `twitter:image`, `twitter:card`.

### Static Routes

Every path in your `RouteMap` is rendered to an HTML file:

```
/           -> dist/index.html
/about      -> dist/about/index.html
/contact    -> dist/contact/index.html
```

### Markdown Content

Load markdown files with YAML frontmatter using the `ssg` accessor inside `template()`:

```tsx
import { ssg } from '@geajs/ssg'

class Blog extends Component {
  template() {
    const posts = ssg.content('blog', {
      sort: (a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
    })
    return <ul>{posts.map(p => `<li>${p.frontmatter.title}</li>`).join('')}</ul>
  }
}
```

Each file has: `slug`, `frontmatter`, `html` (rendered), and optionally `content` (raw markdown — available at build time, omitted in client payload to reduce size).

### Dynamic Routes with Content

Parameterized routes auto-generate pages from content files. Each `.md` file's slug becomes a route parameter:

```tsx
export const routes = {
  '/blog/:slug': { component: BlogPost, content: 'blog' },
}

class BlogPost extends Component {
  template(props) {
    const post = ssg.file('blog', props?.slug)
    return post ? <article><h1>{post.frontmatter.title}</h1><div>{post.html}</div></article> : ''
  }
}
```

### Dynamic Routes with Explicit Paths

For non-content parameterized routes, provide explicit paths:

```tsx
export const routes = {
  '/user/:id': {
    component: UserPage,
    paths: [{ params: { id: '1' } }, { params: { id: '2' } }],
  },
}
```

### 404 Page

Add a wildcard route to generate a `404.html`:

```tsx
import { Component, Head } from '@geajs/core'

export const routes = {
  '/': Home,
  '*': NotFound,
}

class NotFound extends Component {
  template() {
    return (
      <div>
        <Head title="404 - Not Found" />
        <h1>Page not found</h1>
      </div>
    )
  }
}
```

The preview server automatically serves `404.html` for unmatched routes.

### Layouts and Outlets

Route groups with `layout` components are rendered with proper nesting — the layout wraps the page content through `Outlet`.

### Sitemap

Pass `sitemap: { hostname: 'https://example.com' }` to generate a `sitemap.xml`. Pages with `lastmod` in their `Head` get per-URL last-modified dates. The `/404` route is automatically excluded.

### robots.txt

Enable robots.txt generation:

```ts
geaSSG({
  robots: true,
  sitemap: { hostname: 'https://example.com' },
})
```

Or customize:

```ts
geaSSG({
  robots: {
    disallow: ['/admin', '/private'],
    allow: ['/public'],
    sitemap: false,
  },
})
```

### HTML Minification

Enable minification to reduce output size:

```ts
geaSSG({ minify: true })
```

Removes HTML comments, collapses whitespace, and strips inter-tag spaces while preserving `<pre>`, `<code>`, `<script>`, `<style>`, and `<textarea>` content.

### Trailing Slash

Control URL format with `trailingSlash`:

```ts
geaSSG({ trailingSlash: false }) // /about -> about.html
geaSSG({ trailingSlash: true })  // /about -> about/index.html (default)
```

Affects output paths, sitemap URLs, and preview server routing.

### Active Link State

`Link` components automatically get `data-active` attributes in static output, matching the current route — no client JavaScript needed.

### MPA Hydration (Zero JS on Static Pages)

By default, the SSG build bundles your entire app as a single-page application. With the `hydrate` option, you can switch to **MPA mode**: only pages that contain interactive components get JavaScript — everything else is pure HTML with zero JS.

```ts
// vite.config.ts
geaSSG({
  contentDir: 'src/content',
  hydrate: ['Counter', 'LiveClock'],
})
```

```ts
// src/main.ts
import { hydrate } from '@geajs/ssg'
import Counter from './views/Counter'
import LiveClock from './views/LiveClock'
import './styles.css'

hydrate({ Counter, LiveClock })
```

**How it works:**

1. During build, the SSG renderer tracks which components from the `hydrate` list appear on each page and marks them with `data-gea` attributes.
2. Pages **without** any hydrated components have their `<script type="module">` tags stripped — zero JavaScript.
3. Pages **with** hydrated components keep their JS. On load, `hydrate()` finds each `data-gea` element, creates the component instance with a matching ID, and attaches reactive bindings and event handlers to the existing SSG DOM — no re-render, no flash.

**Content API in MPA mode:** When `hydrate` is set, no global `_ssg/content.js` file is generated. `ssg.content()` and `ssg.file()` will return empty results on the client. This is by design — in MPA mode content is baked into the SSG HTML at build time. If you need client-side content access, use the default SPA mode (omit `hydrate`).

**When to use MPA mode:** Sites where most pages are static content (blogs, docs, marketing) and only a few pages need interactivity (forms, counters, live data).

### Dev Mode

In dev mode (`vite dev`), content is preloaded and injected into the page so `ssg.content()` and `ssg.file()` work without a build step. Content file changes trigger automatic page reload.

When using MPA mode with `hydrate`, the dev server falls back to full SPA rendering (Router + all views) so you can navigate and develop normally. The MPA behavior only applies to production builds.

## Plugin Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entry` | `string` | `'src/App.tsx'` | App entry file |
| `contentDir` | `string` | — | Content directory for markdown files (relative to project root) |
| `sitemap` | `boolean \| SitemapOptions` | — | Generate sitemap.xml |
| `robots` | `boolean \| RobotsOptions` | — | Generate robots.txt |
| `minify` | `boolean` | `false` | Minify HTML output |
| `trailingSlash` | `boolean` | `true` | URL format for generated files |
| `appElementId` | `string` | `'app'` | Mount element id in index.html |
| `routes` | `RouteMap` | — | Override routes (default: from entry file) |
| `app` | `Component` | — | Override app component (default: from entry file) |
| `hydrate` | `string[]` | — | Component class names to hydrate on client (enables MPA mode) |
| `base` | `string` | `'/'` | Base path for asset URLs |
| `concurrency` | `number` | `4` | Max concurrent page renders |
| `onBeforeRender` | `function` | — | Hook called before each page render |
| `onAfterRender` | `function` | — | Hook called after render, can transform HTML |
| `onRenderError` | `function` | — | Custom error handler per route |

## Programmatic API

```ts
// Build-time / server-side
import { ssg, generate, renderToString, crawlRoutes, parseShell, preloadContent } from '@geajs/ssg'

// Client-side (browser)
import { hydrate, ssg } from '@geajs/ssg' // aliased to client module by vite-plugin
```

All build-time exports are available from the main entry point for custom pipelines. The `hydrate` function is only available from the client entry (`@geajs/ssg/client`), which the Vite plugin aliases automatically.

## Related Packages

- **[@geajs/core](https://www.npmjs.com/package/@geajs/core)** — Core framework
- **[@geajs/vite-plugin](https://www.npmjs.com/package/@geajs/vite-plugin)** — Vite plugin for compile-time JSX
- **[create-gea](https://www.npmjs.com/package/create-gea)** — Project scaffolder

## License

[MIT](LICENSE) — Copyright (c) 2017-present Armagan Amcalar
