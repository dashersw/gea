import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../../gea/src/router/router.ts'
import { router } from '../../gea/src/router/index.ts'
import { resolveSSRRouter, runWithSSRRouter, createSSRRouterState } from '../src/ssr-router-context.ts'
import type { ServerRouteResult } from '../src/server-router.ts'

describe('Router._ssrRouterResolver', () => {
  it('exists as a static nullable property', () => {
    assert.equal(Router._ssrRouterResolver, null)
  })

  it('can be assigned a resolver function', () => {
    const resolver = () => null
    Router._ssrRouterResolver = resolver
    assert.equal(Router._ssrRouterResolver, resolver)
    // Clean up
    Router._ssrRouterResolver = null
  })
})

describe('router singleton proxy SSR delegation', () => {
  it('delegates to SSR resolver when set', () => {
    const ssrState = {
      path: '/about',
      route: '/about',
      params: {},
      query: {},
      hash: '',
      matches: ['/about'],
      error: null,
    }
    Router._ssrRouterResolver = () => ssrState
    try {
      assert.equal(router.path, '/about')
      assert.deepEqual(router.matches, ['/about'])
    } finally {
      Router._ssrRouterResolver = null
    }
  })

  it('does not instantiate real Router when SSR resolver is active', () => {
    const ssrState = { path: '/ssr' }
    Router._ssrRouterResolver = () => ssrState
    try {
      assert.equal(router.path, '/ssr')
    } finally {
      Router._ssrRouterResolver = null
    }
  })

  it('returns null from resolver means fall through is attempted', () => {
    let called = false
    Router._ssrRouterResolver = () => {
      called = true
      return { path: '/fallback' }
    }
    try {
      void router.path
      assert.equal(called, true)
    } finally {
      Router._ssrRouterResolver = null
    }
  })
})

describe('SSR router context (AsyncLocalStorage)', () => {
  it('resolveSSRRouter returns null outside context', () => {
    assert.equal(resolveSSRRouter(), null)
  })

  it('resolveSSRRouter returns state inside context', () => {
    const state = { path: '/test' }
    const result = runWithSSRRouter(state, () => resolveSSRRouter())
    assert.equal(result, state)
  })

  it('nested contexts are isolated', () => {
    const outer = { path: '/outer' }
    const inner = { path: '/inner' }
    runWithSSRRouter(outer, () => {
      assert.equal((resolveSSRRouter() as any).path, '/outer')
      runWithSSRRouter(inner, () => {
        assert.equal((resolveSSRRouter() as any).path, '/inner')
      })
      assert.equal((resolveSSRRouter() as any).path, '/outer')
    })
  })
})

describe('createSSRRouterState', () => {
  const mockRouteResult: ServerRouteResult = {
    path: '/users/1',
    route: '/users/:id',
    params: { id: '1' },
    query: { tab: 'profile' },
    hash: '#section',
    matches: ['/users/:id'],
    component: null,
    guardRedirect: null,
    isNotFound: false,
  }

  it('populates path, route, params, query, hash, matches from route result', () => {
    const state = createSSRRouterState(mockRouteResult)
    assert.equal(state.path, '/users/1')
    assert.equal(state.route, '/users/:id')
    assert.deepEqual(state.params, { id: '1' })
    assert.deepEqual(state.query, { tab: 'profile' })
    assert.equal(state.hash, '#section')
    assert.deepEqual(state.matches, ['/users/:id'])
    assert.equal(state.error, null)
  })

  it('isActive returns true for prefix match', () => {
    const state = createSSRRouterState(mockRouteResult)
    assert.equal(state.isActive('/users/1'), true)
    assert.equal(state.isActive('/users'), true)
    assert.equal(state.isActive('/about'), false)
  })

  it('isActive uses exact match for root path', () => {
    const rootResult = { ...mockRouteResult, path: '/' }
    const state = createSSRRouterState(rootResult)
    assert.equal(state.isActive('/'), true)
    assert.equal(state.isActive('/users'), false)
  })

  it('isExact returns true only for exact match', () => {
    const state = createSSRRouterState(mockRouteResult)
    assert.equal(state.isExact('/users/1'), true)
    assert.equal(state.isExact('/users'), false)
  })

  it('navigation methods are no-ops', () => {
    const state = createSSRRouterState(mockRouteResult)
    state.push('/foo')
    state.replace('/foo')
    state.back()
    state.forward()
    state.go(1)
    state.navigate('/foo')
    state.dispose()
    state.setRoutes({})
  })

  it('page returns the resolved component', () => {
    class MockComponent {}
    const withComponent = { ...mockRouteResult, component: MockComponent as any }
    const state = createSSRRouterState(withComponent)
    assert.equal(state.page, MockComponent)
  })
})

describe('handleRequest with SSR router context', () => {
  it('router singleton returns SSR state during render', async () => {
    Router._ssrRouterResolver = resolveSSRRouter

    const mockResult: ServerRouteResult = {
      path: '/test-route',
      route: '/test-route',
      params: {},
      query: {},
      hash: '',
      matches: ['/test-route'],
      component: null,
      guardRedirect: null,
      isNotFound: false,
    }
    const state = createSSRRouterState(mockResult)

    let capturedPath = ''
    runWithSSRRouter(state, () => {
      capturedPath = router.path
    })

    assert.equal(capturedPath, '/test-route')

    // Clean up
    Router._ssrRouterResolver = null
  })
})
