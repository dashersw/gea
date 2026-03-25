import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { crawlRoutes } from '../src/crawl'
import { preloadContent, clearContentCache } from '../src/content'

class HomePage {
  template() {
    return '<div>home</div>'
  }
}
class AboutPage {
  template() {
    return '<div>about</div>'
  }
}
class NotFoundPage {
  template() {
    return '<div>404</div>'
  }
}
class LayoutComponent {
  template() {
    return '<div>layout</div>'
  }
}
class BlogPostPage {
  template() {
    return '<div>post</div>'
  }
}

const tmpDir = join(import.meta.dirname, '.tmp-crawl-test')

beforeEach(async () => {
  await mkdir(join(tmpDir, 'blog'), { recursive: true })
})

afterEach(async () => {
  clearContentCache()
  await rm(tmpDir, { recursive: true, force: true })
})

describe('crawlRoutes', () => {
  it('collects static routes', async () => {
    const routes = { '/': HomePage, '/about': AboutPage }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    assert.equal(result[0].path, '/')
    assert.equal(result[1].path, '/about')
  })

  it('skips string redirects', async () => {
    const routes = { '/': HomePage, '/old': '/new' }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 1)
  })

  it('skips redirect configs', async () => {
    const routes = { '/': HomePage, '/legacy': { redirect: '/modern' } }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 1)
  })

  it('generates 404 page from wildcard routes', async () => {
    const routes = { '/': HomePage, '*': NotFoundPage }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    const notFound = result.find((r) => r.path === '/404')
    assert.ok(notFound)
    assert.equal(notFound!.component, NotFoundPage)
  })

  it('resolves lazy components', async () => {
    const routes = { '/': HomePage, '/lazy': () => Promise.resolve({ default: AboutPage }) }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    assert.equal(result[1].component, AboutPage)
  })

  it('handles route groups with layouts', async () => {
    const routes = {
      '/': { layout: LayoutComponent, children: { '/': HomePage, '/about': AboutPage } },
    }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    assert.equal(result[0].layouts.length, 1)
    assert.equal(result[0].layouts[0], LayoutComponent)
  })

  it('handles nested route groups', async () => {
    const routes = {
      '/admin': {
        layout: LayoutComponent,
        children: {
          '/dashboard': HomePage,
          '/settings': { children: { '/profile': AboutPage } },
        },
      },
    }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    assert.equal(result[0].path, '/admin/dashboard')
    assert.equal(result[1].path, '/admin/settings/profile')
  })

  it('normalizes double slashes', async () => {
    const routes = { '/': { children: { '/about': AboutPage } } }
    const result = await crawlRoutes(routes as any)
    assert.equal(result[0].path, '/about')
  })

  it('returns empty array for empty routes', async () => {
    const result = await crawlRoutes({})
    assert.equal(result.length, 0)
  })

  it('generates routes from content slugs', async () => {
    await writeFile(join(tmpDir, 'blog', 'hello-world.md'), '---\ntitle: Hello\n---\n# Hello')
    await writeFile(join(tmpDir, 'blog', 'second-post.md'), '---\ntitle: Second\n---\n# Second')
    await preloadContent(tmpDir)

    const routes = {
      '/blog/:slug': { component: BlogPostPage, content: 'blog' },
    }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    assert.equal(result[0].path, '/blog/hello-world')
    assert.equal(result[0].params.slug, 'hello-world')
    assert.equal(result[1].path, '/blog/second-post')
  })

  it('generates routes from explicit paths', async () => {
    const routes = {
      '/users/:id': {
        component: HomePage,
        paths: [{ params: { id: '1' } }, { params: { id: '2' } }],
      },
    }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 2)
    assert.equal(result[0].path, '/users/1')
    assert.equal(result[1].path, '/users/2')
  })

  it('treats { component } without content/paths as static route', async () => {
    const routes = { '/about': { component: AboutPage } }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 1)
    assert.equal(result[0].path, '/about')
    assert.equal(result[0].component, AboutPage)
  })

  it('skips parameterized routes without content or paths', async () => {
    const routes = { '/user/:id': HomePage }
    const result = await crawlRoutes(routes as any)
    assert.equal(result.length, 0)
  })
})
