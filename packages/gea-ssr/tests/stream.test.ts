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

describe('createSSRStream', () => {
  it('produces valid HTML with all three sections', async () => {
    const stream = createSSRStream({
      shellBefore: '<!DOCTYPE html><html><body><div id="app">',
      shellAfter: '</div></body></html>',
      render: async () => ({ appHtml: '<h1>Hello</h1>', stateJson: '{"S":{"count":1}}' }),
    })
    const html = await readStream(stream)
    assert.ok(html.includes('<!DOCTYPE html>'))
    assert.ok(html.includes('<h1>Hello</h1>'))
    assert.ok(html.includes('window.__GEA_STATE__='))
    assert.ok(html.includes('</body></html>'))
  })

  it('shell chunk flushes before render completes', async () => {
    let renderCalled = false
    let releaseRender!: () => void
    const renderGate = new Promise<void>((resolve) => {
      releaseRender = resolve
    })
    const stream = createSSRStream({
      shellBefore: '<head>shell</head><body><div id="app">',
      shellAfter: '</div></body></html>',
      render: async () => {
        renderCalled = true
        await renderGate
        return { appHtml: '<p>content</p>', stateJson: '{}' }
      },
    })
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    const first = await reader.read()
    assert.ok(!first.done)
    assert.ok(decoder.decode(first.value).includes('shell'))
    assert.ok(renderCalled, 'render should have been called')
    releaseRender()
    while (!(await reader.read()).done) {
      /* drain */
    }
  })

  it('embeds state in a script tag', async () => {
    const stream = createSSRStream({
      shellBefore: '<body><div id="app">',
      shellAfter: '</div></body>',
      render: async () => ({ appHtml: '', stateJson: '{"T":{"x":1}}' }),
    })
    const html = await readStream(stream)
    assert.ok(html.includes('<script>window.__GEA_STATE__={"T":{"x":1}}</script>'))
  })

  it('skips state script when stateJson is empty object', async () => {
    const stream = createSSRStream({
      shellBefore: '<body><div id="app">',
      shellAfter: '</div></body>',
      render: async () => ({ appHtml: '<p>hi</p>', stateJson: '{}' }),
    })
    const html = await readStream(stream)
    assert.ok(!html.includes('__GEA_STATE__'))
  })
})
