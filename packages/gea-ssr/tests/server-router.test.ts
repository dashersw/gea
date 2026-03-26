import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServerRouter } from '../src/server-router.ts'

describe('createServerRouter', () => {
  it('resolves a simple route', () => {
    const routes = { '/': 'Home', '/about': 'About' }
    const router = createServerRouter('http://localhost/about', routes)
    assert.equal(router.path, '/about')
    assert.equal(router.route, '/about')
  })

  it('extracts route params', () => {
    const routes = { '/users/:id': 'UserProfile' }
    const router = createServerRouter('http://localhost/users/42', routes)
    assert.equal(router.params.id, '42')
    assert.equal(router.route, '/users/:id')
  })

  it('parses query string', () => {
    const routes = { '/search': 'Search' }
    const router = createServerRouter('http://localhost/search?q=hello&page=2', routes)
    assert.equal(router.query.q, 'hello')
    assert.equal(router.query.page, '2')
  })

  it('parses hash', () => {
    const routes = { '/docs': 'Docs' }
    const router = createServerRouter('http://localhost/docs#section', routes)
    assert.equal(router.hash, '#section')
  })

  it('returns redirect string from guard', () => {
    class Dashboard {}
    const routes = {
      '/dashboard': {
        guard: () => '/login',
        children: { '/': Dashboard },
      },
    }
    const result = createServerRouter('http://localhost/dashboard', routes)
    assert.equal(result.guardRedirect, '/login')
  })

  it('passes guard that returns true', () => {
    class Dashboard {}
    const routes = {
      '/dashboard': {
        guard: () => true,
        children: { '/': Dashboard },
      },
    }
    const result = createServerRouter('http://localhost/dashboard', routes)
    assert.equal(result.guardRedirect, null)
    assert.equal(result.path, '/dashboard')
  })

  it('handles wildcard 404 route', () => {
    const routes = { '/': 'Home', '*': 'NotFound' }
    const router = createServerRouter('http://localhost/nonexistent', routes)
    assert.equal(router.route, '*')
  })

  it('handles string redirect routes', () => {
    const routes = { '/old': '/new', '/new': 'NewPage' }
    const router = createServerRouter('http://localhost/old', routes)
    assert.equal(router.guardRedirect, '/new')
  })
})

describe('resolveRoutes — nested groups', () => {
  class PageA { props = {}; template() { return '<a>' } }
  class PageB { props = {}; template() { return '<b>' } }
  class Deep { props = {}; template() { return '<deep>' } }

  it('resolves deeply nested route groups', () => {
    const routes = {
      '/admin': {
        children: {
          '/settings': {
            children: {
              '/profile': Deep,
            },
          },
        },
      },
    }
    const result = createServerRouter('http://localhost/admin/settings/profile', routes)
    assert.equal(result.component, Deep)
    assert.deepEqual(result.matches, ['/admin', '/settings', '/profile'])
    assert.equal(result.isNotFound, false)
  })

  it('merges params from parent and child groups', () => {
    const routes = {
      '/org/:orgId': {
        children: {
          '/team/:teamId': PageA,
        },
      },
    }
    const result = createServerRouter('http://localhost/org/42/team/7', routes)
    assert.equal(result.params.orgId, '42')
    assert.equal(result.params.teamId, '7')
  })

  it('returns isNotFound when no nested route matches', () => {
    const routes = {
      '/admin': {
        children: {
          '/dashboard': PageA,
        },
      },
    }
    const result = createServerRouter('http://localhost/admin/nonexistent', routes)
    assert.equal(result.isNotFound, true)
  })

  it('matches wildcard inside nested group', () => {
    const routes = {
      '/app': {
        children: {
          '/home': PageA,
          '*': PageB,
        },
      },
    }
    const result = createServerRouter('http://localhost/app/anything', routes)
    assert.equal(result.component, PageB)
    assert.equal(result.route, '*')
  })
})

describe('resolveRoutes — guard behavior', () => {
  class Guarded { props = {}; template() { return '<guarded>' } }

  it('skips guards when skipGuards is true', () => {
    const routes = {
      '/secret': {
        guard: () => '/login' as const,
        children: { '/data': Guarded },
      },
    }
    const result = createServerRouter('http://localhost/secret/data', routes, true)
    assert.equal(result.component, Guarded)
    assert.equal(result.guardRedirect, null)
  })

  it('returns guardRedirect when guard returns string and skipGuards is false', () => {
    const routes = {
      '/secret': {
        guard: () => '/login',
        children: { '/data': Guarded },
      },
    }
    const result = createServerRouter('http://localhost/secret/data', routes, false)
    assert.equal(result.guardRedirect, '/login')
  })

  it('allows through when guard returns true', () => {
    const routes = {
      '/open': {
        guard: () => true,
        children: { '/page': Guarded },
      },
    }
    const result = createServerRouter('http://localhost/open/page', routes, false)
    assert.equal(result.component, Guarded)
    assert.equal(result.guardRedirect, null)
  })
})

describe('createServerRouter — edge cases', () => {
  it('returns isNotFound for empty route map', () => {
    const result = createServerRouter('http://localhost/anything', {})
    assert.equal(result.isNotFound, true)
    assert.equal(result.component, null)
  })

  it('handles route group with empty children', () => {
    const routes = {
      '/admin': { children: {} },
    }
    const result = createServerRouter('http://localhost/admin/page', routes)
    assert.equal(result.isNotFound, true)
  })

  it('handles route group with no guard', () => {
    class Page {}
    const routes = {
      '/section': {
        children: { '/page': Page },
      },
    }
    const result = createServerRouter('http://localhost/section/page', routes, false)
    assert.equal(result.component, Page)
    assert.equal(result.guardRedirect, null)
  })

  it('handles URL with encoded characters in params', () => {
    class Page {}
    const routes = {
      '/user/:name': Page,
    }
    const result = createServerRouter('http://localhost/user/hello%20world', routes)
    assert.equal(result.params.name, 'hello world')
  })

  it('handles multi-value query params', () => {
    const routes = { '/search': 'Search' }
    const result = createServerRouter('http://localhost/search?tag=a&tag=b&tag=c', routes)
    assert.deepEqual(result.query.tag, ['a', 'b', 'c'])
  })
})
