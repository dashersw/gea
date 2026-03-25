# @geajs/ssg

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/dashersw/gea/blob/master/LICENSE)

Static site generation plugin for [Gea](https://www.npmjs.com/package/@geajs/core). Pre-renders your routes to static HTML at build time — zero client JavaScript, instant page loads, SEO-friendly output.

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

Each file has: `slug`, `frontmatter`, `content` (raw md), `html` (rendered).

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

### Client-Only Content

Wrap parts of a template with the `<Client>` tag to exclude them from static output. The wrapped content only renders in the browser:

```tsx
import { Component, Client } from '@geajs/core'

class Dashboard extends Component {
  template() {
    return (
      <div>
        <h1>Dashboard</h1>
        <Client>
          <LiveChart />
          <UserActivity />
        </Client>
      </div>
    )
  }
}
```

During SSG the `<Client>` section becomes an empty placeholder. At runtime the child components mount normally.

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
    sitemap: 'https://example.com/sitemap.xml',
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

### Dev Mode

In dev mode (`vite dev`), content is preloaded and injected into the page so `ssg.content()` and `ssg.file()` work without a build step. Content file changes trigger automatic page reload.

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
| `concurrency` | `number` | `4` | Max concurrent page renders |
| `onBeforeRender` | `function` | — | Hook called before each page render |
| `onAfterRender` | `function` | — | Hook called after render, can transform HTML |
| `onRenderError` | `function` | — | Custom error handler per route |

## Programmatic API

```ts
import { ssg, generate, renderToString, crawlRoutes, parseShell, preloadContent } from '@geajs/ssg'
```

All exports are available from the main entry point for custom build pipelines.

## Related Packages

- **[@geajs/core](https://www.npmjs.com/package/@geajs/core)** — Core framework
- **[@geajs/vite-plugin](https://www.npmjs.com/package/@geajs/vite-plugin)** — Vite plugin for compile-time JSX
- **[create-gea](https://www.npmjs.com/package/create-gea)** — Project scaffolder

## License

[MIT](LICENSE) — Copyright (c) 2017-present Armagan Amcalar
