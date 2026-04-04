import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generate } from '../src/generate'
import { RouterView, Outlet, Head } from '@geajs/core'

const SHELL_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Test App</title>
  <script type="module" src="/main.js"></script>
</head>
<body>
  <div id="app"></div>
</body>
</html>`

class HomePage {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template() {
    return '<h1>Home</h1>'
  }
  dispose() {}
}

class AboutPage {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template() {
    return '<h1>About</h1>'
  }
  dispose() {}
}

class UserPage {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template() {
    return `<h1>User ${this.props.id || 'unknown'}</h1>`
  }
  dispose() {}
}

class ThrowingPage {
  constructor() {
    throw new Error('render failed')
  }
  template() {
    return ''
  }
}

class MockLayout {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template() {
    const outletHtml = Outlet._ssgHtml || ''
    return `<div class="layout"><header>Layout Header</header><div id="outlet">${outletHtml}</div></div>`
  }
  dispose() {}
}

class MockNestedLayout {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template() {
    const outletHtml = Outlet._ssgHtml || ''
    return `<section class="nested"><nav>Nested Nav</nav>${outletHtml}</section>`
  }
  dispose() {}
}

class MockApp {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template() {
    let routeContent = ''
    if (RouterView._ssgRoute) {
      const { component, layouts, params } = RouterView._ssgRoute

      if (!layouts.length) {
        const child = new component(params)
        routeContent = String(child.template(child.props)).trim()
        if (typeof child.dispose === 'function') child.dispose()
      } else {
        const leaf = new component(params)
        let innerHtml = String(leaf.template(leaf.props)).trim()
        if (typeof leaf.dispose === 'function') leaf.dispose()

        for (let i = layouts.length - 1; i >= 0; i--) {
          Outlet._ssgHtml = innerHtml
          const layout = new layouts[i]({ ...params })
          innerHtml = String(layout.template(layout.props)).trim()
          if (typeof layout.dispose === 'function') layout.dispose()
          Outlet._ssgHtml = null
        }
        routeContent = innerHtml
      }
    }
    return `<div class="app"><nav>Nav</nav><div id="view">${routeContent}</div></div>`
  }
  dispose() {}
}

let tempDir: string
let shellPath: string

describe('generate', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gea-ssg-test-'))
    shellPath = join(tempDir, 'index.html')
    await writeFile(shellPath, SHELL_HTML, 'utf-8')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('generates HTML files for static routes', async () => {
    const result = await generate({
      routes: { '/': HomePage, '/about': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    assert.equal(result.pages.length, 2)
    assert.equal(result.errors.length, 0)

    const indexHtml = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(indexHtml.includes('<h1>Home</h1>'))
    assert.ok(indexHtml.includes('<nav>Nav</nav>'))

    const aboutHtml = await readFile(join(tempDir, 'about', 'index.html'), 'utf-8')
    assert.ok(aboutHtml.includes('<h1>About</h1>'))
  })

  it('creates nested directories', async () => {
    const result = await generate({
      routes: { '/docs/getting-started': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    assert.equal(result.pages.length, 1)
    const html = await readFile(join(tempDir, 'docs', 'getting-started', 'index.html'), 'utf-8')
    assert.ok(html.includes('<h1>About</h1>'))
  })

  it('catches render errors per route', async () => {
    const capturedErrors: string[] = []
    const result = await generate({
      routes: { '/': HomePage, '/broken': ThrowingPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      onRenderError: (path, err) => {
        capturedErrors.push(`${path}: ${err.message}`)
      },
    })

    assert.equal(result.pages.length, 1)
    assert.equal(result.errors.length, 1)
    assert.equal(capturedErrors[0], '/broken: render failed')
  })

  it('passes params to route components via { component, paths }', async () => {
    const result = await generate({
      routes: {
        '/users/:id': {
          component: UserPage,
          paths: [{ params: { id: '1' } }, { params: { id: '2' } }],
        },
      } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    assert.equal(result.pages.length, 2)

    const user1 = await readFile(join(tempDir, 'users', '1', 'index.html'), 'utf-8')
    assert.ok(user1.includes('<h1>User 1</h1>'))

    const user2 = await readFile(join(tempDir, 'users', '2', 'index.html'), 'utf-8')
    assert.ok(user2.includes('<h1>User 2</h1>'))
  })

  it('generates routes from { component, content } config', async () => {
    const contentDir = join(tempDir, 'content')
    await mkdir(join(contentDir, 'blog'), { recursive: true })
    await writeFile(join(contentDir, 'blog', 'hello.md'), '---\ntitle: Hello\n---\n# Hello')
    await writeFile(join(contentDir, 'blog', 'world.md'), '---\ntitle: World\n---\n# World')

    class PostPage {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        return `<h1>Post: ${this.props.slug}</h1>`
      }
      dispose() {}
    }

    const result = await generate({
      routes: {
        '/blog/:slug': { component: PostPage, content: 'blog' },
      } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      contentDir,
    })

    assert.equal(result.pages.length, 2)

    const hello = await readFile(join(tempDir, 'blog', 'hello', 'index.html'), 'utf-8')
    assert.ok(hello.includes('<h1>Post: hello</h1>'))

    const world = await readFile(join(tempDir, 'blog', 'world', 'index.html'), 'utf-8')
    assert.ok(world.includes('<h1>Post: world</h1>'))
  })

  it('renders with a single layout wrapping the component', async () => {
    const result = await generate({
      routes: {
        '/': {
          layout: MockLayout,
          children: { '/': HomePage, '/about': AboutPage },
        },
      } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    assert.equal(result.pages.length, 2)

    const indexHtml = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(indexHtml.includes('<header>Layout Header</header>'))
    assert.ok(indexHtml.includes('<h1>Home</h1>'))
  })

  it('renders with nested layouts', async () => {
    const result = await generate({
      routes: {
        '/': {
          layout: MockLayout,
          children: {
            '/dashboard': {
              layout: MockNestedLayout,
              children: { '/': HomePage },
            },
          },
        },
      } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    assert.equal(result.pages.length, 1)

    const html = await readFile(join(tempDir, 'dashboard', 'index.html'), 'utf-8')
    assert.ok(html.includes('<header>Layout Header</header>'))
    assert.ok(html.includes('<nav>Nested Nav</nav>'))
    assert.ok(html.includes('<h1>Home</h1>'))
  })

  it('calls onBeforeRender hook', async () => {
    const paths: string[] = []
    await generate({
      routes: { '/': HomePage, '/about': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      onBeforeRender: (ctx) => {
        paths.push(ctx.path)
      },
    })

    assert.ok(paths.includes('/'))
    assert.ok(paths.includes('/about'))
  })

  it('calls onAfterRender hook and uses transformed HTML', async () => {
    await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      onAfterRender: (_ctx, html) => html.replace('</body>', '<footer>SSG</footer></body>'),
    })

    const html = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(html.includes('<footer>SSG</footer>'))
  })

  it('keeps scripts in output for client-side takeover', async () => {
    await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    const html = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(html.includes('main.js'))
  })

  it('preserves non-JS scripts like JSON-LD', async () => {
    const shellWithJsonLd = SHELL_HTML.replace(
      '</head>',
      '<script type="application/ld+json">{"@type":"WebSite"}</script>\n</head>',
    )
    await writeFile(shellPath, shellWithJsonLd, 'utf-8')

    await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    const html = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(html.includes('application/ld+json'))
    assert.ok(html.includes('main.js'))
  })

  it('generates sitemap when enabled', async () => {
    await generate({
      routes: { '/': HomePage, '/about': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      sitemap: { hostname: 'https://example.com' },
    })

    const sitemap = await readFile(join(tempDir, 'sitemap.xml'), 'utf-8')
    assert.ok(sitemap.includes('<loc>https://example.com/</loc>'))
    assert.ok(sitemap.includes('<loc>https://example.com/about/</loc>'))
  })

  it('returns duration in result', async () => {
    const result = await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })
    assert.ok(result.duration > 0)
  })

  it('returns page sizes in result', async () => {
    const result = await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })
    assert.ok(result.pages[0].size > 0)
  })

  it('rejects path traversal in route paths', async () => {
    await assert.rejects(
      () =>
        generate({
          routes: { '/../../escape': HomePage } as any,
          app: MockApp as any,
          shell: shellPath,
          outDir: tempDir,
        }),
      /Path traversal detected/,
    )
  })

  it('generates 404.html from wildcard route', async () => {
    class NotFoundPage {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        return '<h1>Not Found</h1>'
      }
      dispose() {}
    }

    const result = await generate({
      routes: { '/': HomePage, '*': NotFoundPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    assert.equal(result.pages.length, 2)
    const notFoundPage = result.pages.find((p) => p.path === '/404')
    assert.ok(notFoundPage)

    const html = await readFile(join(tempDir, '404', 'index.html'), 'utf-8')
    assert.ok(html.includes('<h1>Not Found</h1>'))
  })

  it('generates robots.txt with boolean option', async () => {
    await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      robots: true,
      sitemap: { hostname: 'https://example.com' },
    })

    const robots = await readFile(join(tempDir, 'robots.txt'), 'utf-8')
    assert.ok(robots.includes('User-agent: *'))
    assert.ok(robots.includes('Allow: /'))
    assert.ok(robots.includes('Sitemap: https://example.com/sitemap.xml'))
  })

  it('generates robots.txt with custom options', async () => {
    await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      robots: { disallow: ['/admin', '/private'] },
    })

    const robots = await readFile(join(tempDir, 'robots.txt'), 'utf-8')
    assert.ok(robots.includes('Disallow: /admin'))
    assert.ok(robots.includes('Disallow: /private'))
  })

  it('minifies HTML output when enabled', async () => {
    await generate({
      routes: { '/': HomePage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      minify: true,
    })

    const html = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(!html.includes('<!--'))
    assert.ok(!html.includes('\n'))
  })

  it('generates trailing slash false output', async () => {
    await generate({
      routes: { '/': HomePage, '/about': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      trailingSlash: false,
    })

    const aboutHtml = await readFile(join(tempDir, 'about.html'), 'utf-8')
    assert.ok(aboutHtml.includes('<h1>About</h1>'))
  })

  it('injects head tags when Head._current is set', async () => {
    class HeadPage {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        Head._current = { title: 'Custom Title', description: 'Custom Desc', url: '/head-test' }
        return '<h1>Head Test</h1>'
      }
      dispose() {}
    }

    class HeadApp {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        let routeContent = ''
        if (RouterView._ssgRoute) {
          const child = new (RouterView._ssgRoute.component as any)(RouterView._ssgRoute.params)
          routeContent = String(child.template(child.props)).trim()
          if (typeof child.dispose === 'function') child.dispose()
        }
        return `<div>${routeContent}</div>`
      }
      dispose() {}
    }

    await generate({
      routes: { '/': HeadPage } as any,
      app: HeadApp as any,
      shell: shellPath,
      outDir: tempDir,
    })

    const html = await readFile(join(tempDir, 'index.html'), 'utf-8')
    assert.ok(html.includes('<title>Custom Title</title>'))
    assert.ok(html.includes('og:title'))
    assert.ok(html.includes('Custom Desc'))
    assert.ok(html.includes('rel="canonical"'))
  })

  it('includes lastmod in sitemap from Head config', async () => {
    class DatedPage {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        Head._current = { title: 'Dated', lastmod: '2026-01-15' }
        return '<h1>Dated</h1>'
      }
      dispose() {}
    }

    class DatedApp {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        let routeContent = ''
        if (RouterView._ssgRoute) {
          const child = new (RouterView._ssgRoute.component as any)(RouterView._ssgRoute.params)
          routeContent = String(child.template(child.props)).trim()
          if (typeof child.dispose === 'function') child.dispose()
        }
        return `<div>${routeContent}</div>`
      }
      dispose() {}
    }

    await generate({
      routes: { '/': DatedPage } as any,
      app: DatedApp as any,
      shell: shellPath,
      outDir: tempDir,
      sitemap: { hostname: 'https://example.com' },
    })

    const sitemap = await readFile(join(tempDir, 'sitemap.xml'), 'utf-8')
    assert.ok(sitemap.includes('<lastmod>2026-01-15</lastmod>'))
  })

  it('excludes /404 from sitemap', async () => {
    class NotFoundPage {
      props: any
      constructor(props?: any) {
        this.props = props || {}
      }
      template() {
        return '<h1>404</h1>'
      }
      dispose() {}
    }

    await generate({
      routes: { '/': HomePage, '*': NotFoundPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      sitemap: { hostname: 'https://example.com' },
    })

    const sitemap = await readFile(join(tempDir, 'sitemap.xml'), 'utf-8')
    assert.ok(sitemap.includes('<loc>https://example.com/</loc>'))
    assert.ok(!sitemap.includes('/404'))
  })

  it('sitemap uses trailing slash in URLs', async () => {
    await generate({
      routes: { '/': HomePage, '/about': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      sitemap: { hostname: 'https://example.com' },
      trailingSlash: true,
    })

    const sitemap = await readFile(join(tempDir, 'sitemap.xml'), 'utf-8')
    assert.ok(sitemap.includes('<loc>https://example.com/about/</loc>'))
  })

  it('sitemap omits trailing slash when disabled', async () => {
    await generate({
      routes: { '/': HomePage, '/about': AboutPage } as any,
      app: MockApp as any,
      shell: shellPath,
      outDir: tempDir,
      sitemap: { hostname: 'https://example.com' },
      trailingSlash: false,
    })

    const sitemap = await readFile(join(tempDir, 'sitemap.xml'), 'utf-8')
    assert.ok(sitemap.includes('<loc>https://example.com/about</loc>'))
    assert.ok(!sitemap.includes('/about/'))
  })
})
