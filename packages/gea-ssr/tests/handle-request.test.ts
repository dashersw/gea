import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/handle-request.ts'
import type { GeaComponentInstance, SSRContext } from '../src/types.ts'
import { isRecord } from '../src/types.ts'

type Newable = new (props: Record<string, unknown>) => { toString(): string }

function isNewable(value: unknown): value is Newable {
  return typeof value === 'function'
}

async function readResponse(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
  }
  return result
}

const indexHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><div id="app"></div></body></html>'

class TestApp implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props || {} }
  template() { return '<h1>Home</h1>' }
}

class UserView implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props || {} }
  template() { return `<h1>User ${this.props.id || 'unknown'}</h1>` }
  toString() { return this.template() }
}

describe('handleRequest', () => {
  it('returns a Response with streaming HTML', async () => {
    const handler = handleRequest(TestApp, { indexHtml })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8')
    const html = await readResponse(response)
    assert.ok(html.includes('<h1>Home</h1>'))
    assert.ok(html.includes('<!DOCTYPE html>'))
    assert.ok(html.includes('</html>'))
  })

  it('calls onBeforeRender with route context', async () => {
    let receivedContext: SSRContext | null = null
    const handler = handleRequest(TestApp, {
      routes: { '/products/:id': TestApp },
      indexHtml,
      async onBeforeRender(ctx) {
        receivedContext = ctx
      },
    })
    await handler(new Request('http://localhost/products/42?color=red'))
    assert.equal(receivedContext!.params.id, '42')
    assert.equal(receivedContext!.query.color, 'red')
  })

  it('skips guards on server and renders protected route content', async () => {
    const routes = {
      '/protected': {
        guard: () => '/login',
        children: { '/': TestApp },
      },
    }
    const handler = handleRequest(TestApp, { routes, indexHtml })
    const response = await handler(new Request('http://localhost/protected'))
    // Guards are skipped during SSR — client-side hydration handles auth redirects
    assert.equal(response.status, 200)
  })

  it('never executes route guard functions during SSR', async () => {
    let guardCalled = false
    const handler = handleRequest(TestApp, {
      indexHtml,
      routes: {
        '/protected': {
          guard: () => { guardCalled = true; return '/login' },
          children: { '/page': TestApp },
        },
      },
    })
    const response = await handler(new Request('http://localhost/protected/page'))
    assert.equal(guardCalled, false, 'guard should never be called during SSR')
    assert.equal(response.status, 200, 'page renders without guard redirect')
  })

  it('calls onError when onBeforeRender throws', async () => {
    let caughtError: Error | null = null
    const handler = handleRequest(TestApp, {
      indexHtml,
      async onBeforeRender() {
        throw new Error('Data fetch failed')
      },
      onError(error) {
        caughtError = error
        return new Response('Custom Error', { status: 500 })
      },
    })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(response.status, 500)
    assert.equal(caughtError!.message, 'Data fetch failed')
  })

  it('returns 500 when onBeforeRender throws and no onError', async () => {
    const handler = handleRequest(TestApp, {
      indexHtml,
      async onBeforeRender() {
        throw new Error('fail')
      },
    })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(response.status, 500)
  })

  it('returns 500 when both onBeforeRender and onError throw', async () => {
    const handler = handleRequest(TestApp, {
      indexHtml,
      async onBeforeRender() { throw new Error('primary failure') },
      onError() { throw new Error('handler also failed') },
    })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(response.status, 500)
    const body = await response.text()
    assert.equal(body, 'Internal Server Error')
  })

  it('serializes store state into HTML', async () => {
    const store = { count: 42 }
    const handler = handleRequest(TestApp, {
      indexHtml,
      storeRegistry: { TestStore: store },
    })
    const response = await handler(new Request('http://localhost/'))
    const html = await readResponse(response)
    assert.ok(html.includes('__GEA_STATE__'))
    assert.ok(html.includes('42'))
  })

  it('returns 404 when route resolves to wildcard', async () => {
    class NotFoundApp implements GeaComponentInstance {
      props: Record<string, unknown>
      constructor(props?: Record<string, unknown>) { this.props = props || {} }
      template() { return '<h1>Not Found</h1>' }
    }
    const handler = handleRequest(TestApp, {
      indexHtml,
      routes: {
        '/': TestApp,
        '*': NotFoundApp,
      },
    })
    const response = await handler(new Request('http://localhost/nonexistent'))
    assert.equal(response.status, 404)
  })

  it('returns 200 for matched routes', async () => {
    const handler = handleRequest(TestApp, {
      indexHtml,
      routes: {
        '/': TestApp,
        '*': TestApp,
      },
    })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(response.status, 200)
  })

  it('passes resolved route component and params to App', async () => {
    let receivedProps: Record<string, unknown> | null = null

    class RoutedApp implements GeaComponentInstance {
      props: Record<string, unknown>
      constructor(props?: Record<string, unknown>) {
        this.props = props || {}
        receivedProps = this.props
      }
      template() {
        const viewCtor = this.props.__ssrRouteComponent
        if (isNewable(viewCtor)) {
          const rawRouteProps = this.props.__ssrRouteProps
          const routeProps: Record<string, unknown> = isRecord(rawRouteProps) ? rawRouteProps : {}
          const view = new viewCtor(routeProps)
          return `<div>${view}</div>`
        }
        return '<div></div>'
      }
    }

    const routes = { '/': TestApp, '/users/:id': UserView }
    const handler = handleRequest(RoutedApp, { routes, indexHtml })

    const response = await handler(new Request('http://localhost/users/42'))
    const html = await readResponse(response)

    assert.equal(receivedProps!.__ssrRouteComponent, UserView)
    const routeProps = receivedProps!.__ssrRouteProps
    assert.ok(isRecord(routeProps))
    assert.equal(routeProps.id, '42')
    assert.ok(html.includes('User 42'))
  })

  it('populates route context from URL when no route map is configured', async () => {
    let receivedContext: SSRContext | null = null
    const handler = handleRequest(TestApp, {
      indexHtml,
      async onBeforeRender(ctx) {
        receivedContext = ctx
      },
    })
    await handler(new Request('http://localhost/products/42?color=red&size=lg'))
    assert.equal(receivedContext!.route, '/products/42')
    assert.equal(receivedContext!.query.color, 'red')
    assert.equal(receivedContext!.query.size, 'lg')
  })

  it('coalesces repeated query keys into arrays in fallback context', async () => {
    let receivedContext: SSRContext | null = null
    const handler = handleRequest(TestApp, {
      indexHtml,
      async onBeforeRender(ctx) {
        receivedContext = ctx
      },
    })
    await handler(new Request('http://localhost/search?tag=a&tag=b&tag=c'))
    assert.deepEqual(receivedContext!.query.tag, ['a', 'b', 'c'])
  })

  it('injects head tags from onBeforeRender', async () => {
    const handler = handleRequest(TestApp, {
      indexHtml: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>',
      async onBeforeRender(ctx) {
        ctx.head = {
          title: 'Test Page',
          meta: [{ name: 'description', content: 'A test' }],
        }
      },
    })
    const res = await handler(new Request('http://localhost/'))
    const html = await readResponse(res)
    assert.ok(html.includes('<title>Test Page</title>'))
    assert.ok(html.includes('<meta name="description" content="A test">'))
    const headEnd = html.indexOf('</head>')
    const titlePos = html.indexOf('<title>Test Page</title>')
    assert.ok(titlePos < headEnd, 'head tags should be injected before </head>')
  })

  it('streams deferred content when onBeforeRender sets context.deferreds', async () => {
    const handler = handleRequest(TestApp, {
      indexHtml,
      onBeforeRender(context) {
        context.deferreds = [
          {
            id: 'test-deferred',
            promise: Promise.resolve('<p>Deferred content</p>'),
          },
        ]
      },
    })

    const response = await handler(new Request('http://localhost/'))
    const html = await readResponse(response)

    assert.ok(
      html.includes('test-deferred') && html.includes('Deferred content'),
      'Response should contain deferred content scripts.\nGot:\n' + html,
    )
  })
})
