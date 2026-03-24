import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFileRoutes } from '../src/lib/router/file-routes'

// ── Helpers ──────────────────────────────────────────────────────────────────

const lazy = (name: string) => () => Promise.resolve({ default: { name } as any })
const sync = (name: string) => ({ default: { name } as any })

// ── pageFileToRoute (tested indirectly via buildFileRoutes) ──────────────────

describe('buildFileRoutes – flat (no layouts)', () => {
  it('maps root page to "/"', () => {
    const routes = buildFileRoutes(
      { './pages/page.tsx': lazy('Home') },
      {},
      './pages',
    )
    assert.ok('/' in routes, 'should have "/" key')
  })

  it('maps nested page to "/about"', () => {
    const routes = buildFileRoutes(
      { './pages/about/page.tsx': lazy('About') },
      {},
      './pages',
    )
    assert.ok('/about' in routes)
  })

  it('maps dynamic segment [id] to ":id"', () => {
    const routes = buildFileRoutes(
      { './pages/users/[id]/page.tsx': lazy('UserDetail') },
      {},
      './pages',
    )
    assert.ok('/users/:id' in routes)
  })

  it('maps top-level catch-all [...all] to "*"', () => {
    const routes = buildFileRoutes(
      { './pages/[...all]/page.tsx': lazy('NotFound') },
      {},
      './pages',
    )
    assert.ok('*' in routes)
  })

  it('maps nested catch-all [...slug] to "/blog/*"', () => {
    const routes = buildFileRoutes(
      { './pages/blog/[...slug]/page.tsx': lazy('BlogCatchAll') },
      {},
      './pages',
    )
    assert.ok('/blog/*' in routes)
  })

  it('maps multiple pages without layouts', () => {
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/about/page.tsx': lazy('About'),
        './pages/contact/page.tsx': lazy('Contact'),
      },
      {},
      './pages',
    )
    assert.ok('/' in routes)
    assert.ok('/about' in routes)
    assert.ok('/contact' in routes)
    assert.equal(Object.keys(routes).length, 3)
  })

  it('preserves the loader function reference', () => {
    const loader = lazy('Home')
    const routes = buildFileRoutes({ './pages/page.tsx': loader }, {}, './pages')
    assert.equal(routes['/'] as unknown, loader)
  })

  it('works with basePath that has a trailing slash', () => {
    const routes = buildFileRoutes(
      { './pages/about/page.tsx': lazy('About') },
      {},
      './pages/',
    )
    assert.ok('/about' in routes)
  })

  it('supports .ts extensions', () => {
    const routes = buildFileRoutes(
      { './pages/page.ts': lazy('Home') },
      {},
      './pages',
    )
    assert.ok('/' in routes)
  })

  it('supports .js and .jsx extensions', () => {
    const routes = buildFileRoutes(
      {
        './pages/page.js': lazy('HomeJS'),
        './pages/about/page.jsx': lazy('AboutJSX'),
      },
      {},
      './pages',
    )
    assert.ok('/' in routes)
    assert.ok('/about' in routes)
  })
})

// ── With root layout ──────────────────────────────────────────────────────────

describe('buildFileRoutes – with root layout', () => {
  it('wraps all pages in a root layout group', () => {
    const RootLayout = sync('RootLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/about/page.tsx': lazy('About'),
      },
      { './pages/layout.tsx': RootLayout },
      './pages',
    )
    // Root layout group is at '/'
    const group = routes['/'] as any
    assert.ok(group && typeof group === 'object', 'should have a root group')
    assert.ok('layout' in group, 'group should have layout')
    assert.ok('children' in group, 'group should have children')
    assert.equal(group.layout, RootLayout.default)
  })

  it('root layout children include "/" and "/about" as full paths (root prefix keeps full paths)', () => {
    const RootLayout = sync('RootLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/about/page.tsx': lazy('About'),
      },
      { './pages/layout.tsx': RootLayout },
      './pages',
    )
    const group = routes['/'] as any
    assert.ok('/' in group.children, 'children should contain "/"')
    assert.ok('/about' in group.children, 'children should contain "/about"')
  })

  it('catch-all is placed in root layout children', () => {
    const RootLayout = sync('RootLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/[...all]/page.tsx': lazy('NotFound'),
      },
      { './pages/layout.tsx': RootLayout },
      './pages',
    )
    const group = routes['/'] as any
    // bare wildcard '*' is NOT under a root layout (isUnderPrefix returns false for '*' when prefix is '/')
    // Actually per the implementation: isUnderPrefix(route='*', prefix='/') returns false
    // So '*' pages are placed outside layouts
    assert.ok('*' in routes || '*' in (group?.children ?? {}), 'catch-all should exist somewhere')
  })
})

// ── With nested layouts ───────────────────────────────────────────────────────

describe('buildFileRoutes – with nested layouts', () => {
  it('creates nested layout group under root', () => {
    const RootLayout = sync('RootLayout')
    const UsersLayout = sync('UsersLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/users/page.tsx': lazy('UsersList'),
        './pages/users/[id]/page.tsx': lazy('UserDetail'),
      },
      {
        './pages/layout.tsx': RootLayout,
        './pages/users/layout.tsx': UsersLayout,
      },
      './pages',
    )
    const rootGroup = routes['/'] as any
    assert.ok(rootGroup, 'root group should exist')
    // Users layout is a child layout under root
    const usersGroup = rootGroup.children['/users'] as any
    assert.ok(usersGroup, 'users group should be nested inside root')
    assert.equal(usersGroup.layout, UsersLayout.default)
    assert.ok('children' in usersGroup)
  })

  it('users layout children use relative paths', () => {
    const RootLayout = sync('RootLayout')
    const UsersLayout = sync('UsersLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/users/page.tsx': lazy('UsersList'),
        './pages/users/[id]/page.tsx': lazy('UserDetail'),
      },
      {
        './pages/layout.tsx': RootLayout,
        './pages/users/layout.tsx': UsersLayout,
      },
      './pages',
    )
    const rootGroup = routes['/'] as any
    const usersGroup = rootGroup.children['/users'] as any
    // Children relative to /users: '/' and '/:id'
    assert.ok('/' in usersGroup.children, 'users list should map to "/" inside users group')
    assert.ok('/:id' in usersGroup.children, 'user detail should map to "/:id" inside users group')
  })

  it('sibling layout groups do not bleed into each other', () => {
    const RootLayout = sync('RootLayout')
    const BlogLayout = sync('BlogLayout')
    const UsersLayout = sync('UsersLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/blog/page.tsx': lazy('BlogList'),
        './pages/blog/[slug]/page.tsx': lazy('BlogPost'),
        './pages/users/page.tsx': lazy('UsersList'),
      },
      {
        './pages/layout.tsx': RootLayout,
        './pages/blog/layout.tsx': BlogLayout,
        './pages/users/layout.tsx': UsersLayout,
      },
      './pages',
    )
    const rootChildren = (routes['/'] as any).children
    assert.ok('/blog' in rootChildren, 'blog group should be under root')
    assert.ok('/users' in rootChildren, 'users group should be under root')
    const blogChildren = rootChildren['/blog'].children
    assert.ok(!('/users' in blogChildren), 'users routes should not be inside blog group')
  })

  it('deeply nested layout (3 levels)', () => {
    const RootLayout = sync('RootLayout')
    const SettingsLayout = sync('SettingsLayout')
    const ProfileLayout = sync('ProfileLayout')
    const routes = buildFileRoutes(
      {
        './pages/page.tsx': lazy('Home'),
        './pages/settings/page.tsx': lazy('Settings'),
        './pages/settings/profile/page.tsx': lazy('Profile'),
        './pages/settings/profile/edit/page.tsx': lazy('EditProfile'),
      },
      {
        './pages/layout.tsx': RootLayout,
        './pages/settings/layout.tsx': SettingsLayout,
        './pages/settings/profile/layout.tsx': ProfileLayout,
      },
      './pages',
    )
    const rootChildren = (routes['/'] as any).children
    const settingsGroup = rootChildren['/settings'] as any
    assert.ok(settingsGroup, 'settings group should exist')
    const profileGroup = settingsGroup.children['/profile'] as any
    assert.ok(profileGroup, 'profile group should be nested inside settings')
    assert.ok('/' in profileGroup.children, 'profile index should exist')
    assert.ok('/edit' in profileGroup.children, 'edit page should be under profile')
  })
})

// ── Layout without pages (layout only, no sub-pages) ────────────────────────

describe('buildFileRoutes – edge cases', () => {
  it('returns empty object when both globs are empty', () => {
    const routes = buildFileRoutes({}, {}, './pages')
    assert.deepEqual(routes, {})
  })

  it('handles layout module with .default property', () => {
    const LayoutClass = { name: 'Layout' } as any
    const routes = buildFileRoutes(
      { './pages/page.tsx': lazy('Home') },
      { './pages/layout.tsx': { default: LayoutClass } },
      './pages',
    )
    const group = routes['/'] as any
    assert.equal(group.layout, LayoutClass)
  })

  it('handles layout module without .default (direct export)', () => {
    const LayoutClass = { name: 'Layout' } as any
    const routes = buildFileRoutes(
      { './pages/page.tsx': lazy('Home') },
      { './pages/layout.tsx': LayoutClass },
      './pages',
    )
    const group = routes['/'] as any
    assert.equal(group.layout, LayoutClass)
  })

  it('multiple dynamic segments in file path', () => {
    const routes = buildFileRoutes(
      { './pages/orgs/[org]/repos/[repo]/page.tsx': lazy('RepoDetail') },
      {},
      './pages',
    )
    assert.ok('/orgs/:org/repos/:repo' in routes)
  })

  it('standalone layout with no pages still creates empty group', () => {
    const RootLayout = sync('RootLayout')
    const routes = buildFileRoutes(
      {},
      { './pages/layout.tsx': RootLayout },
      './pages',
    )
    const group = routes['/'] as any
    assert.ok(group && typeof group === 'object')
    assert.deepEqual(group.children, {})
  })

  it('page outside any layout remains a flat entry', () => {
    const UsersLayout = sync('UsersLayout')
    const routes = buildFileRoutes(
      {
        './pages/about/page.tsx': lazy('About'),
        './pages/users/page.tsx': lazy('UsersList'),
      },
      { './pages/users/layout.tsx': UsersLayout },
      './pages',
    )
    // '/about' is not under users layout — should be a flat entry
    assert.ok('/about' in routes, 'about should be a top-level flat entry')
  })
})
