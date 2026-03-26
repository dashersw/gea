import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderToString } from '../src/render.ts'
import type { GeaComponentInstance } from '../src/types.ts'

class SimpleComponent implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props || {} }
  template() { return '<div>Hello World</div>' }
}

class PropsComponent implements GeaComponentInstance {
  props: Record<string, unknown>
  constructor(props?: Record<string, unknown>) { this.props = props || {} }
  template() { return `<div>${this.props.name}</div>` }
}

// Simulates real Component base class which calls created() in constructor.
// renderToString triggers created() via constructor, not explicitly.
class ComponentWithCreated implements GeaComponentInstance {
  props: Record<string, unknown>
  state = ''
  constructor(props?: Record<string, unknown>) {
    this.props = props || {}
    this.created(this.props)
  }
  created(_props: Record<string, unknown>) { this.state = 'initialized' }
  template() { return `<div>${this.state}</div>` }
}

describe('renderToString', () => {
  it('renders a simple component to HTML string', () => {
    const html = renderToString(SimpleComponent)
    assert.equal(html, '<div>Hello World</div>')
  })

  it('passes props to component', () => {
    const html = renderToString(PropsComponent, { name: 'Gea' })
    assert.equal(html, '<div>Gea</div>')
  })

  it('created() runs via constructor before template()', () => {
    const html = renderToString(ComponentWithCreated)
    assert.equal(html, '<div>initialized</div>')
  })

  it('returns empty string for empty template', () => {
    class EmptyTemplate implements GeaComponentInstance {
      props: Record<string, unknown>
      constructor(props?: Record<string, unknown>) { this.props = props || {} }
      template() { return '' }
    }
    const html = renderToString(EmptyTemplate)
    assert.equal(html, '')
  })
})
