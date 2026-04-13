// packages/gea-ssr/tests/after-response.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Component, GEA_CREATE_TEMPLATE } from '@geajs/core'
import { handleRequest } from '../src/handle-request.ts'
import type { SSRContext } from '../src/types.ts'

const mockIndexHtml = '<!DOCTYPE html><html><body><div id="app"></div></body></html>'

class TestApp extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    const h = document.createElement('h1')
    h.textContent = 'Test'
    return h
  }
}

async function consumeResponse(response: Response): Promise<string> {
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

describe('afterResponse', () => {
  it('calls afterResponse after stream is consumed', async () => {
    let called = false
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      afterResponse: async () => {
        called = true
      },
    })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(called, false, 'should not be called before consumption')
    await consumeResponse(response)
    // Give microtask a chance to run
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(called, true, 'should be called after consumption')
  })

  it('afterResponse receives route context', async () => {
    let receivedCtx: SSRContext | null = null
    const handler = handleRequest(TestApp, {
      routes: { '/items/:id': TestApp },
      indexHtml: mockIndexHtml,
      afterResponse: async (ctx) => {
        receivedCtx = ctx
      },
    })
    const response = await handler(new Request('http://localhost/items/5'))
    await consumeResponse(response)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(receivedCtx!.params.id, '5')
    assert.equal(receivedCtx!.route, '/items/:id')
  })

  it('afterResponse errors do not affect response', async () => {
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      afterResponse: async () => {
        throw new Error('cleanup failed')
      },
    })
    const response = await handler(new Request('http://localhost/'))
    const html = await consumeResponse(response)
    assert.equal(response.status, 200)
    assert.ok(html.includes('<h1>Test</h1>'))
  })

  it('afterResponse completes before stream fully closes', async () => {
    let afterResponseCompleted = false
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      async afterResponse() {
        await new Promise((resolve) => setTimeout(resolve, 50))
        afterResponseCompleted = true
      },
    })
    const response = await handler(new Request('http://localhost/'))
    const reader = response.body!.getReader()
    while (!(await reader.read()).done) {
      /* drain */
    }
    assert.ok(afterResponseCompleted, 'afterResponse must complete before stream closes')
  })

  it('afterResponse not called on error responses', async () => {
    let called = false
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      async onBeforeRender() {
        throw new Error('fail')
      },
      afterResponse: async () => {
        called = true
      },
    })
    const response = await handler(new Request('http://localhost/'))
    assert.equal(response.status, 500)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(called, false)
  })
})
