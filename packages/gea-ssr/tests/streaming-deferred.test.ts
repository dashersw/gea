import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSSRStream } from '../src/stream.ts'

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let result = await reader.read()
  while (!result.done) {
    chunks.push(decoder.decode(result.value))
    result = await reader.read()
  }
  return chunks
}

describe('streaming with deferreds', () => {
  it('streams initial HTML then deferred resolution scripts', async () => {
    let resolveDeferred!: (v: string) => void
    const deferredPromise = new Promise<string>(r => { resolveDeferred = r })

    const stream = createSSRStream({
      shellBefore: '<html><body><div id="app">',
      shellAfter: '</div></body></html>',
      render: async () => ({
        appHtml: '<p>fast</p><div id="gea-deferred-1">Loading...</div>',
        stateJson: '{}',
      }),
      deferreds: [{
        id: 'gea-deferred-1',
        promise: deferredPromise.then(v => `<p>${v}</p>`),
      }],
    })

    resolveDeferred('slow data arrived')

    const chunks = await readStream(stream)
    const fullHtml = chunks.join('')

    assert.ok(fullHtml.includes('gea-deferred-1'), 'should reference the deferred ID')
    assert.ok(fullHtml.includes('slow data arrived'), 'should contain resolved content')
    assert.ok(fullHtml.includes('<script>'), 'should contain a replacement script')
  })

  it('works without deferreds (backward compatible)', async () => {
    const stream = createSSRStream({
      shellBefore: '<html><body><div id="app">',
      shellAfter: '</div></body></html>',
      render: async () => ({
        appHtml: '<p>hello</p>',
        stateJson: '{}',
      }),
    })

    const chunks = await readStream(stream)
    const fullHtml = chunks.join('')
    assert.ok(fullHtml.includes('<p>hello</p>'))
    assert.ok(!fullHtml.includes('<script>'), 'no deferred scripts')
  })

  it('handles rejected deferred promises', async () => {
    const stream = createSSRStream({
      shellBefore: '<html><body><div id="app">',
      shellAfter: '</div></body></html>',
      render: async () => ({
        appHtml: '<div id="gea-err">Loading...</div>',
        stateJson: '{}',
      }),
      deferreds: [{
        id: 'gea-err',
        promise: Promise.reject(new Error('fetch failed')),
      }],
    })

    const chunks = await readStream(stream)
    const fullHtml = chunks.join('')
    assert.ok(fullHtml.includes('Loading...'), 'fallback should remain')
  })
})
