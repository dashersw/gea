import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSSRStream } from '../src/stream.ts'

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
  }
  return result
}

async function readChunks(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }
  return chunks
}

function makeOptions(overrides: Record<string, unknown> = {}) {
  return {
    shellBefore: '<html><body><div id="app">',
    shellAfter: '</div></body></html>',
    render: async () => ({
      appHtml: '<div id="gea-d1">Loading 1...</div><div id="gea-d2">Loading 2...</div>',
      stateJson: '{}',
    }),
    ...overrides,
  }
}

describe('stream timeout and per-deferred streaming', () => {
  it('deferred that never resolves does not hold connection open', async () => {
    const neverResolves = new Promise<string>(() => {})

    const stream = createSSRStream(
      makeOptions({
        deferreds: [{ id: 'gea-d1', promise: neverResolves }],
        streamTimeout: 100,
      }),
    )

    const start = Date.now()
    const html = await readStream(stream)
    const elapsed = Date.now() - start

    assert.ok(elapsed < 1000, `Stream should close quickly, took ${elapsed}ms`)
    assert.ok(html.includes('Loading 1...'), 'Fallback HTML should remain')
    assert.ok(!html.includes('replaceWith'), 'No replacement script for timed-out deferred')
  })

  it('deferred that resolves before timeout streams normally', async () => {
    const stream = createSSRStream(
      makeOptions({
        deferreds: [
          {
            id: 'gea-d1',
            promise: Promise.resolve('<p>Resolved!</p>'),
          },
        ],
        streamTimeout: 5000,
      }),
    )

    const html = await readStream(stream)

    assert.ok(html.includes('Resolved!'), 'Resolved content should be streamed')
    assert.ok(html.includes('gea-d1'), 'Script should reference the deferred ID')
    assert.ok(html.includes('<script>'), 'Replacement script should be present')
  })

  it('default timeout is 10 seconds', async () => {
    // A deferred that resolves in 50ms should work fine with default timeout
    const stream = createSSRStream(
      makeOptions({
        deferreds: [
          {
            id: 'gea-d1',
            promise: new Promise<string>((r) => setTimeout(() => r('<p>ok</p>'), 50)),
          },
        ],
        // no streamTimeout — should default to 10_000
      }),
    )

    const html = await readStream(stream)
    assert.ok(html.includes('<p>ok</p>'), 'Should resolve with default timeout')
  })

  it('fast-resolving deferred streams before slow-resolving one completes', async () => {
    const order: string[] = []

    const fastPromise = new Promise<string>((resolve) => {
      setTimeout(() => {
        order.push('fast')
        resolve('<p>fast</p>')
      }, 20)
    })

    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => {
        order.push('slow')
        resolve('<p>slow</p>')
      }, 200)
    })

    const stream = createSSRStream(
      makeOptions({
        deferreds: [
          { id: 'gea-d1', promise: fastPromise },
          { id: 'gea-d2', promise: slowPromise },
        ],
        streamTimeout: 5000,
      }),
    )

    const chunks = await readChunks(stream)
    const fullHtml = chunks.join('')

    // Both should resolve
    assert.ok(fullHtml.includes('<p>fast</p>'), 'Fast deferred should be in output')
    assert.ok(fullHtml.includes('<p>slow</p>'), 'Slow deferred should be in output')

    // Fast should have resolved first
    assert.equal(order[0], 'fast', 'Fast deferred should resolve first')
    assert.equal(order[1], 'slow', 'Slow deferred should resolve second')

    // The fast deferred script should appear before the slow one in the stream
    // Both appear in the app HTML first, so check the script occurrences
    const fastScriptIdx = fullHtml.indexOf('gea-d1', fullHtml.indexOf('<script>'))
    const slowScriptIdx = fullHtml.indexOf('gea-d2', fullHtml.indexOf('<script>'))
    assert.ok(fastScriptIdx < slowScriptIdx, 'Fast deferred script should appear before slow one')
  })

  it('failed deferred leaves fallback in place', async () => {
    const stream = createSSRStream(
      makeOptions({
        deferreds: [
          {
            id: 'gea-d1',
            promise: Promise.reject(new Error('network error')),
          },
        ],
        streamTimeout: 5000,
      }),
    )

    const html = await readStream(stream)

    assert.ok(html.includes('Loading 1...'), 'Fallback HTML should remain')
    assert.ok(!html.includes('replaceWith'), 'No replacement script for failed deferred')
  })

  it('timed-out deferred leaves fallback in place', async () => {
    const neverResolves = new Promise<string>(() => {})

    const stream = createSSRStream(
      makeOptions({
        deferreds: [{ id: 'gea-d1', promise: neverResolves }],
        streamTimeout: 50,
      }),
    )

    const html = await readStream(stream)

    assert.ok(html.includes('Loading 1...'), 'Fallback HTML should remain after timeout')
    assert.ok(!html.includes('replaceWith'), 'No replacement script for timed-out deferred')
  })

  it('clears timeout timer when deferred resolves before timeout', async () => {
    const clearTimeoutOriginal = globalThis.clearTimeout
    let clearedCount = 0

    const patchedClearTimeout: typeof clearTimeout = function patchedClearTimeout(id) {
      clearedCount++
      clearTimeoutOriginal(id)
    }
    globalThis.clearTimeout = patchedClearTimeout

    try {
      const stream = createSSRStream(
        makeOptions({
          deferreds: [
            { id: 'gea-d1', promise: Promise.resolve('<p>fast</p>') },
            { id: 'gea-d2', promise: Promise.resolve('<p>also fast</p>') },
          ],
          streamTimeout: 5000,
        }),
      )

      await readStream(stream)

      assert.equal(clearedCount, 2, 'Both timeout timers should be cleared after deferreds resolve')
    } finally {
      globalThis.clearTimeout = clearTimeoutOriginal
    }
  })

  it('configurable timeout via options', async () => {
    const slowDeferred = new Promise<string>((resolve) => {
      setTimeout(() => resolve('<p>arrived</p>'), 200)
    })

    // With a 50ms timeout, the 200ms deferred should time out
    const stream1 = createSSRStream(
      makeOptions({
        deferreds: [{ id: 'gea-d1', promise: slowDeferred }],
        streamTimeout: 50,
      }),
    )
    const html1 = await readStream(stream1)
    assert.ok(!html1.includes('arrived'), 'Should time out with 50ms limit')

    // With a 500ms timeout, a 50ms deferred should resolve
    const fastDeferred = new Promise<string>((resolve) => {
      setTimeout(() => resolve('<p>fast result</p>'), 50)
    })
    const stream2 = createSSRStream(
      makeOptions({
        deferreds: [{ id: 'gea-d1', promise: fastDeferred }],
        streamTimeout: 500,
      }),
    )
    const html2 = await readStream(stream2)
    assert.ok(html2.includes('fast result'), 'Should resolve with 500ms limit')
  })
})
