import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToString } from '../src/render.ts'
import type { GeaComponentInstance, GeaComponentConstructor } from '../src/types.ts'

class WorkingComponent implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props ?? {} }
  template() { return '<p>works</p>' }
}

class FailingComponent implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props ?? {} }
  template(): string { throw new Error('render failed') }
}

describe('SSR error boundary', () => {
  it('renders normally when no error', () => {
    const html = renderToString(
      WorkingComponent satisfies GeaComponentConstructor,
    )
    assert.equal(html, '<p>works</p>')
  })

  it('returns fallback HTML when component throws and onRenderError is set', () => {
    const html = renderToString(
      FailingComponent satisfies GeaComponentConstructor,
      {},
      {
        onRenderError: (err) => `<div class="ssr-error">Error: ${err.message}</div>`,
      },
    )
    assert.equal(html, '<div class="ssr-error">Error: render failed</div>')
  })

  it('re-throws when no onRenderError handler', () => {
    assert.throws(
      () => renderToString(FailingComponent satisfies GeaComponentConstructor),
      /render failed/,
    )
  })
})
