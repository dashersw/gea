import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToString } from '../src/render'

// Minimal mock component — simulates what Gea components do
class MockComponent {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template(_props: any) {
    return '<div>Hello World</div>'
  }
}

class MockComponentWithProps {
  props: any
  constructor(props?: any) {
    this.props = props || {}
  }
  template(props: any) {
    return `<h1>${props.title || 'default'}</h1>`
  }
}

class ThrowingComponent {
  props: any
  constructor() {
    throw new Error('Component init failed')
  }
  template() {
    return ''
  }
}

describe('renderToString', () => {
  it('renders a simple component to HTML', () => {
    const result = renderToString(MockComponent)
    assert.equal(result.html, '<div>Hello World</div>')
    assert.equal(result.hasHydrationMarkers, false)
  })

  it('passes props to the component', () => {
    const result = renderToString(MockComponentWithProps, { title: 'SSG Test' })
    assert.equal(result.html, '<h1>SSG Test</h1>')
  })

  it('uses default props when none provided', () => {
    const result = renderToString(MockComponentWithProps)
    assert.equal(result.html, '<h1>default</h1>')
  })

  it('trims whitespace from output', () => {
    class SpaceyComponent {
      props: any
      constructor() {
        this.props = {}
      }
      template() {
        return '  <div>spaced</div>  '
      }
    }
    const result = renderToString(SpaceyComponent)
    assert.equal(result.html, '<div>spaced</div>')
  })

  it('throws on render error by default', () => {
    assert.throws(() => renderToString(ThrowingComponent), { message: 'Component init failed' })
  })

  it('catches errors when onRenderError is provided', () => {
    let capturedError: Error | null = null
    const result = renderToString(ThrowingComponent, undefined, {
      onRenderError: (err) => {
        capturedError = err
      },
    })
    assert.equal(result.html, '')
    assert.equal(result.hasHydrationMarkers, false)
    assert.ok(capturedError)
    assert.equal((capturedError as Error).message, 'Component init failed')
  })

  it('produces deterministic output with same seed', () => {
    const r1 = renderToString(MockComponent, undefined, { seed: 42 })
    const r2 = renderToString(MockComponent, undefined, { seed: 42 })
    assert.equal(r1.html, r2.html)
  })
})
