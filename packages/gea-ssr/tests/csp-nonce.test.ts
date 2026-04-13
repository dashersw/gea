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

describe('CSP nonce support', () => {
  it('adds nonce attribute to state script tag', async () => {
    const stream = createSSRStream({
      shellBefore: '<body><div id="app">',
      shellAfter: '</div></body>',
      nonce: 'abc123',
      render: async () => ({ appHtml: '<p>hi</p>', stateJson: '{"S":{"x":1}}' }),
    })
    const html = await readStream(stream)
    assert.ok(html.includes('<script nonce="abc123">window.__GEA_STATE__='))
  })

  it('adds nonce attribute to deferred replacement script tags', async () => {
    const stream = createSSRStream({
      shellBefore: '<body><div id="app">',
      shellAfter: '</div></body>',
      nonce: 'def456',
      render: async () => ({ appHtml: '', stateJson: '{}' }),
      deferreds: [{ id: 'deferred-1', promise: Promise.resolve('<p>loaded</p>') }],
    })
    const html = await readStream(stream)
    assert.ok(html.includes('<script nonce="def456">(function()'))
  })

  it('omits nonce attribute when nonce option is not provided', async () => {
    const stream = createSSRStream({
      shellBefore: '<body><div id="app">',
      shellAfter: '</div></body>',
      render: async () => ({ appHtml: '<p>hi</p>', stateJson: '{"S":{"x":1}}' }),
    })
    const html = await readStream(stream)
    assert.ok(html.includes('<script>window.__GEA_STATE__='))
    assert.ok(!html.includes('nonce'))
  })

  it('escapes special characters in nonce value', async () => {
    const stream = createSSRStream({
      shellBefore: '<body><div id="app">',
      shellAfter: '</div></body>',
      nonce: 'a"b<c>d&e',
      render: async () => ({ appHtml: '', stateJson: '{"S":{"x":1}}' }),
    })
    const html = await readStream(stream)
    assert.ok(html.includes('nonce="a&quot;b&lt;c&gt;d&amp;e"'))
  })
})
