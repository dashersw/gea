// packages/gea-ssr/tests/error-digest.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/handle-request.ts'
import type { GeaComponentInstance } from '../src/types.ts'

const mockIndexHtml = '<!DOCTYPE html><html><body><div id="app"></div></body></html>'

function hasDigest(error: Error): error is Error & { digest: string } {
  if (!('digest' in error)) return false
  return typeof error.digest === 'string'
}

class TestApp implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props || {} }
  template() { return '<h1>Test</h1>' }
}

describe('error digests', () => {
  it('attaches digest to errors passed to onError', async () => {
    let receivedError: Error | null = null
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      async onBeforeRender() { throw new Error('data fetch failed') },
      onError(error) {
        receivedError = error
        return new Response('Error', { status: 500 })
      },
    })
    await handler(new Request('http://localhost/'))
    assert.ok(receivedError)
    assert.ok(hasDigest(receivedError), 'error should have digest')
    assert.ok(receivedError.digest.length > 0)
  })

  it('same error gets same digest', async () => {
    const digests: string[] = []
    const err = new Error('consistent')
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      async onBeforeRender() {
        throw err
      },
      onError(error) {
        if (hasDigest(error)) digests.push(error.digest)
        return new Response('Error', { status: 500 })
      },
    })
    await handler(new Request('http://localhost/'))
    await handler(new Request('http://localhost/'))
    assert.equal(digests[0], digests[1])
  })

  it('digest contains only valid base-36 characters (no sign prefix)', async () => {
    let receivedDigest = ''
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      async onBeforeRender() { throw new Error('sign-test') },
      onError(error) {
        if (hasDigest(error)) receivedDigest = error.digest
        return new Response('Error', { status: 500 })
      },
    })
    await handler(new Request('http://localhost/'))
    assert.ok(receivedDigest.startsWith('gea-'), 'digest should have gea- prefix')
    assert.ok(!/[^a-z0-9-]/.test(receivedDigest), 'digest should only contain a-z, 0-9, and hyphens')
    assert.ok(!receivedDigest.slice(4).includes('-'), 'hash portion should not contain minus sign')
  })

  it('different errors get different digests', async () => {
    let callCount = 0
    const digests: string[] = []
    const handler = handleRequest(TestApp, {
      indexHtml: mockIndexHtml,
      async onBeforeRender() {
        throw new Error(`error-${callCount++}`)
      },
      onError(error) {
        if (hasDigest(error)) digests.push(error.digest)
        return new Response('Error', { status: 500 })
      },
    })
    await handler(new Request('http://localhost/'))
    await handler(new Request('http://localhost/'))
    assert.notEqual(digests[0], digests[1])
  })
})
