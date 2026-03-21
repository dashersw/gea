import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveRoute } from '../src/lib/router/resolve'
import type { RouteMap, RouteGroupConfig, RedirectConfig } from '../src/lib/router/types'

import Home from '../../../examples/router-simple/src/views/Home'
import About from '../../../examples/router-simple/src/views/About'
import UserProfile from '../../../examples/router-simple/src/views/UserProfile'
import NotFound from '../../../examples/router-simple/src/views/NotFound'
import UserSettings from '../../../examples/router-v2/src/views/BillingSettings'
import Dashboard from '../../../examples/router-v2/src/views/Overview'
import AdminPanel from '../../../examples/router-v2/src/views/Projects'
import MainLayout from '../../../examples/router-v2/src/layouts/AppShell'
import AdminLayout from '../../../examples/router-v2/src/layouts/DashboardLayout'
import SettingsLayout from '../../../examples/router-v2/src/layouts/SettingsLayout'

describe('resolveRoute', () => {
  // ── 1. Flat routes ──────────────────────────────────────────────

  describe('flat routes', () => {
    const routes: RouteMap = {
      '/': Home as any,
      '/about': About as any,
      '/users/:id': UserProfile as any,
      '*': NotFound as any,
    }

    it('resolves root path', () => {
      const result = resolveRoute(routes, '/')
      assert.equal(result.component, Home as any)
      assert.deepEqual(result.params, {})
    })

    it('resolves static path', () => {
      const result = resolveRoute(routes, '/about')
      assert.equal(result.component, About as any)
    })

    it('resolves param path', () => {
      const result = resolveRoute(routes, '/users/42')
      assert.equal(result.component, UserProfile as any)
      assert.equal(result.params.id, '42')
    })

    it('resolves wildcard catch-all last', () => {
      const result = resolveRoute(routes, '/nonexistent/page')
      assert.equal(result.component, NotFound as any)
      assert.equal(result.params['*'], 'nonexistent/page')
    })
  })

  // ── 2. Nested routes with layouts ──────────────────────────────

  describe('nested routes with layouts', () => {
    const routes: RouteMap = {
      '/': {
        layout: MainLayout as any,
        children: {
          '/': Home as any,
          '/about': About as any,
          '/admin': {
            layout: AdminLayout as any,
            children: {
              '/': AdminPanel as any,
              '/dashboard': Dashboard as any,
            },
          } satisfies RouteGroupConfig as any,
        },
      } satisfies RouteGroupConfig as any,
    }

    it('resolves nested component with correct layout chain', () => {
      const result = resolveRoute(routes, '/admin/dashboard')
      assert.equal(result.component, Dashboard as any)
      assert.deepEqual(result.layouts, [MainLayout as any, AdminLayout as any])
    })

    it('resolves root inside nested layout', () => {
      const result = resolveRoute(routes, '/')
      assert.equal(result.component, Home as any)
      assert.deepEqual(result.layouts, [MainLayout as any])
    })

    it('resolves shallow nested path', () => {
      const result = resolveRoute(routes, '/about')
      assert.equal(result.component, About as any)
      assert.deepEqual(result.layouts, [MainLayout as any])
    })
  })

  // ── 3. Query mode children ─────────────────────────────────────

  describe('query mode children', () => {
    const routes: RouteMap = {
      '/settings': {
        layout: SettingsLayout as any,
        mode: { type: 'query', param: 'tab' },
        children: {
          profile: UserProfile as any,
          settings: UserSettings as any,
        },
      } satisfies RouteGroupConfig as any,
    }

    it('selects child by query param', () => {
      const result = resolveRoute(routes, '/settings', 'tab=settings')
      assert.equal(result.component, UserSettings as any)
      assert.deepEqual(result.layouts, [SettingsLayout as any])
    })

    it('defaults to first child when param is missing', () => {
      const result = resolveRoute(routes, '/settings', '')
      assert.equal(result.component, UserProfile as any)
    })

    it('records queryModes metadata', () => {
      const result = resolveRoute(routes, '/settings', 'tab=settings')
      const meta = result.queryModes.get(0)
      assert.ok(meta)
      assert.equal(meta.activeKey, 'settings')
      assert.deepEqual(meta.keys, ['profile', 'settings'])
      assert.equal(meta.param, 'tab')
    })
  })

  // ── 4. Static redirect ─────────────────────────────────────────

  describe('static redirect', () => {
    const routes: RouteMap = {
      '/old': '/new',
      '/new': Home as any,
    }

    it('returns redirect field for string entry', () => {
      const result = resolveRoute(routes, '/old')
      assert.equal(result.redirect, '/new')
      assert.equal(result.redirectMethod, 'replace')
      assert.equal(result.component, null)
    })
  })

  // ── 5. RedirectConfig ──────────────────────────────────────────

  describe('RedirectConfig', () => {
    const routes: RouteMap = {
      '/moved': {
        redirect: '/destination',
        method: 'push',
        status: 301,
      } satisfies RedirectConfig as any,
    }

    it('returns redirect with method and status', () => {
      const result = resolveRoute(routes, '/moved')
      assert.equal(result.redirect, '/destination')
      assert.equal(result.redirectMethod, 'push')
      assert.equal(result.redirectStatus, 301)
    })
  })

  // ── 6. Pathless layout ─────────────────────────────────────────

  describe('pathless layout', () => {
    const routes: RouteMap = {
      '/': {
        layout: MainLayout as any,
        children: {
          '/': Home as any,
          '/dashboard': Dashboard as any,
        },
      } satisfies RouteGroupConfig as any,
    }

    it('root layout does not add path prefix', () => {
      const result = resolveRoute(routes, '/dashboard')
      assert.equal(result.component, Dashboard as any)
      assert.deepEqual(result.layouts, [MainLayout as any])
    })
  })

  // ── 7. Nested params accumulation ──────────────────────────────

  describe('nested params accumulation', () => {
    const routes: RouteMap = {
      '/users/:userId': {
        layout: MainLayout as any,
        children: {
          '/posts/:postId': UserProfile as any,
        },
      } satisfies RouteGroupConfig as any,
    }

    it('merges params from parent and child', () => {
      const result = resolveRoute(routes, '/users/7/posts/99')
      assert.equal(result.params.userId, '7')
      assert.equal(result.params.postId, '99')
      assert.equal(result.component, UserProfile as any)
    })
  })

  // ── 8. Guard collection ────────────────────────────────────────

  describe('guard collection', () => {
    const authGuard = () => true as const
    const adminGuard = () => true as const

    const routes: RouteMap = {
      '/': {
        guard: authGuard,
        children: {
          '/admin': {
            guard: adminGuard,
            children: {
              '/': AdminPanel as any,
            },
          } satisfies RouteGroupConfig as any,
        },
      } satisfies RouteGroupConfig as any,
    }

    it('collects guards from parent to child in order', () => {
      const result = resolveRoute(routes, '/admin')
      assert.deepEqual(result.guards, [authGuard, adminGuard])
      assert.equal(result.component, AdminPanel as any)
    })
  })

  // ── 9. Lazy detection ──────────────────────────────────────────

  describe('lazy detection', () => {
    const lazyLoader = () => Promise.resolve({ default: Home as any })

    const routes: RouteMap = {
      '/lazy': lazyLoader as any,
    }

    it('marks arrow function entries as lazy', () => {
      const result = resolveRoute(routes, '/lazy')
      assert.equal(result.isLazy, true)
      assert.equal(result.lazyLoader, lazyLoader)
      assert.equal(result.component, null)
    })

    it('does not mark class components as lazy', () => {
      const classRoutes: RouteMap = {
        '/home': Home as any,
      }
      const result = resolveRoute(classRoutes, '/home')
      assert.equal(result.isLazy, undefined)
      assert.equal(result.component, Home as any)
    })
  })

  // ── 10. No match returns null component ────────────────────────

  describe('no match', () => {
    const routes: RouteMap = {
      '/': Home as any,
      '/about': About as any,
    }

    it('returns null component when nothing matches', () => {
      const result = resolveRoute(routes, '/nonexistent')
      assert.equal(result.component, null)
    })
  })
})
