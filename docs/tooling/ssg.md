# Static Site Generation

`@geajs/ssg` pre-renders your Gea application to static HTML at build time. Every route becomes an HTML file with zero client JavaScript — instant loads, full SEO, and no runtime overhead.

## Installation

```bash
npm install -D @geajs/ssg
```

Requires `@geajs/core` ^1.0.0 and `vite` ^8.0.0 as peer dependencies.

## Setup

Add `geaSSG()` to your Vite config after `geaPlugin()`:

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

Your `src/App.tsx` must export a `routes` object and `App` (or a default export):

```tsx
import { Component, RouterView, Link, Head } from '@geajs/core'

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
        <nav>
          <Link to="/" label="Home" exact />
          <Link to="/about" label="About" />
          <Link to="/blog" label="Blog" />
        </nav>
        <RouterView routes={routes} />
      </div>
    )
  }
}
```

Running `vite build` renders every route to `dist/`:

```
dist/
├── index.html          (/)
├── about/index.html    (/about)
├── blog/
│   ├── index.html      (/blog)
│   ├── hello/index.html
│   └── world/index.html
├── 404.html
├── sitemap.xml
└── robots.txt
```

## Head Management

The `Head` component manages per-page `<title>`, meta tags, Open Graph, Twitter Cards, canonical URLs, and JSON-LD structured data.

### Basic Usage

```tsx
import { Component, Head } from '@geajs/core'

class About extends Component {
  template() {
    return (
      <div>
        <Head title="About — My Site" description="Learn about us" />
        <h1>About</h1>
      </div>
    )
  }
}
```

### Full Configuration

```tsx
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
          jsonld={{
            '@type': 'BlogPosting',
            headline: post?.frontmatter.title,
            datePublished: post?.frontmatter.date,
          }}
          meta={[{ name: 'author', content: 'John Doe' }]}
          link={[{ rel: 'alternate', hreflang: 'tr', href: '/tr/blog/' + post?.slug }]}
        />
        <h1>{post?.frontmatter.title}</h1>
        <div>{post?.html}</div>
      </article>
    )
  }
}
```

### How It Works

- Set a default `Head` in your App component, then override per page
- Scalar values (`title`, `description`, `image`, `url`, `type`) are replaced by child pages
- Array values (`meta`, `link`) are merged
- **SSG:** Tags are injected into the static HTML `<head>`
- **Browser:** `document.title` and meta elements are updated on navigation

### Shorthand Expansion

| Prop | Generates |
| --- | --- |
| `title` | `<title>`, `og:title`, `twitter:title` |
| `description` | `<meta name="description">`, `og:description`, `twitter:description` |
| `image` | `og:image`, `twitter:image`, `twitter:card` |
| `url` | `<link rel="canonical">`, `og:url` |
| `type` | `og:type` |

## Markdown Content

The `ssg` accessor reads markdown files with YAML frontmatter from a content directory. Use it inside `template()`:

```tsx
import { ssg } from '@geajs/ssg'

class Blog extends Component {
  template() {
    const posts = ssg.content<{ title: string; date: string }>('blog', {
      sort: (a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
    })
    return (
      <ul>
        {posts.map(p => `<li>${p.frontmatter.title}</li>`).join('')}
      </ul>
    )
  }
}
```

Each returned file has:

- `slug` — filename without extension
- `frontmatter` — parsed YAML metadata
- `content` — raw markdown
- `html` — rendered HTML

A typical markdown file:

```markdown
---
title: Hello World
date: 2026-01-15
excerpt: Getting started with Gea SSG.
---

# Hello World

This is the body content. It supports **bold**, `code`, and [links](https://example.com).
```

### Single File Lookup

Use `ssg.file()` to look up a single content file by slug:

```tsx
class BlogPost extends Component {
  template(props) {
    const post = ssg.file('blog', props?.slug)
    if (!post) return '<div>Not found</div>'
    return (
      <article>
        <h1>{post.frontmatter.title}</h1>
        <div>{post.html}</div>
      </article>
    )
  }
}
```

## Dynamic Routes

### Content-Based Routes

Parameterized routes auto-generate pages from content files. Each `.md` file's slug becomes a route parameter:

```tsx
export const routes = {
  '/blog/:slug': { component: BlogPost, content: 'blog' },
}
```

With three files in `src/content/blog/` (`hello.md`, `world.md`, `intro.md`), this generates three pages: `/blog/hello`, `/blog/world`, `/blog/intro`.

### Explicit Paths

For non-content parameterized routes, provide explicit paths:

```tsx
export const routes = {
  '/user/:id': {
    component: UserPage,
    paths: [{ params: { id: '1' } }, { params: { id: '2' } }],
  },
}
```

## 404 Page

Add a wildcard `*` route to generate a `404.html`:

```tsx
export const routes = {
  '/': Home,
  '/about': About,
  '*': NotFound,
}

class NotFound extends Component {
  template() {
    return (
      <div>
        <Head title="404 — Page Not Found" />
        <h1>Page not found</h1>
        <a href="/">Go home</a>
      </div>
    )
  }
}
```

The preview server automatically serves `404.html` for unmatched routes.

## Client-Only Content

Wrap parts of a component's template with `<Client>` to exclude them from static output. The wrapped content renders only in the browser:

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

During SSG the `<Client>` section becomes an empty placeholder. At runtime the child components mount normally. This lets you pre-render the page shell (nav, layout, headings) while deferring interactive parts to the client.

## Layouts

Route groups with `layout` components work automatically. The SSG renders layouts wrapping page content through `Outlet`, just like client-side rendering:

```tsx
export const routes = {
  '/': Home,
  '/docs': {
    layout: DocsLayout,
    children: {
      '/getting-started': GettingStarted,
      '/api': ApiReference,
    },
  },
}
```

## Active Links

`Link` components get `data-active` attributes in static output matching the current route. Style them with CSS:

```css
[data-active] {
  font-weight: bold;
  color: var(--accent);
}
```

## Dev Mode

In development (`vite dev`), content is preloaded and injected into the page so `ssg.content()` and `ssg.file()` work without a build step. Content file changes trigger automatic page reload.

## Sitemap

Pass a `sitemap` option to generate `sitemap.xml`:

```ts
geaSSG({
  sitemap: {
    hostname: 'https://example.com',
    changefreq: 'weekly',
    priority: 0.8,
    exclude: ['/404'],
  },
})
```

Pages with a `lastmod` value in their `Head` component get per-URL last-modified dates in the sitemap.

## robots.txt

Enable robots.txt generation:

```ts
geaSSG({ robots: true })
```

When `sitemap.hostname` is set, the Sitemap URL is automatically included. Customize rules:

```ts
geaSSG({
  robots: {
    disallow: ['/admin', '/private'],
    allow: ['/public'],
    sitemap: 'https://example.com/sitemap.xml',
  },
})
```

## HTML Minification

Enable minification to reduce output size:

```ts
geaSSG({ minify: true })
```

Removes HTML comments, collapses whitespace, and strips inter-tag spaces while preserving `<pre>`, `<code>`, `<script>`, `<style>`, and `<textarea>` content.

## Trailing Slash

Control URL format with `trailingSlash`:

```ts
geaSSG({ trailingSlash: false }) // /about -> about.html
geaSSG({ trailingSlash: true })  // /about -> about/index.html (default)
```

Affects output file paths, sitemap URLs, and preview server routing.

## Plugin Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entry` | `string` | `'src/App.tsx'` | App entry file |
| `contentDir` | `string` | — | Markdown content directory (relative to project root) |
| `sitemap` | `boolean \| SitemapOptions` | — | Generate sitemap.xml |
| `robots` | `boolean \| RobotsOptions` | — | Generate robots.txt |
| `minify` | `boolean` | `false` | Minify HTML output |
| `trailingSlash` | `boolean` | `true` | URL format for generated files |
| `appElementId` | `string` | `'app'` | Mount element id in index.html |
| `routes` | `RouteMap` | — | Override routes (default: loaded from entry file) |
| `app` | `Component` | — | Override app component (default: loaded from entry file) |
| `concurrency` | `number` | `4` | Max concurrent page renders |
| `onBeforeRender` | `function` | — | Hook before each page render |
| `onAfterRender` | `function` | — | Hook after render, can transform HTML |
| `onRenderError` | `function` | — | Custom error handler per route |

## Programmatic API

All functions are available from the main entry point for custom build pipelines:

```ts
import { ssg, generate, renderToString, crawlRoutes, parseShell, preloadContent } from '@geajs/ssg'
```
