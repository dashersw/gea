import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Component, GEA_CREATE_TEMPLATE } from '@geajs/core'
import { renderToString } from '../src/render.ts'

class WorkingComponent extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    const p = document.createElement('p')
    p.textContent = 'works'
    return p
  }
}

class FailingComponent extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    throw new Error('render failed')
  }
}

describe('SSR error boundary', () => {
  it('renders normally when no error', () => {
    const html = renderToString(WorkingComponent as any)
    assert.equal(html, '<p>works</p>')
  })

  it('returns fallback HTML when component throws and onRenderError is set', () => {
    const html = renderToString(
      FailingComponent as any,
      {},
      {
        onRenderError: (err) => `<div class="ssr-error">Error: ${err.message}</div>`,
      },
    )
    assert.equal(html, '<div class="ssr-error">Error: render failed</div>')
  })

  it('re-throws when no onRenderError handler', () => {
    assert.throws(() => renderToString(FailingComponent as any), /render failed/)
  })
})
