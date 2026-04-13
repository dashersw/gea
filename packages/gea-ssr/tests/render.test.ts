import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Component } from '@geajs/core'
import { renderToString } from '../src/render.ts'
import { GEA_CREATE_TEMPLATE } from '@geajs/core'

// The v2 SSR path uses real @geajs/core Component instances: the compiler emits
// a `[GEA_CREATE_TEMPLATE](disposer)` method on each subclass that returns a
// DOM Node. Tests here short-circuit the compiler by defining that method
// directly.

class SimpleComponent extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    const d = document.createElement('div')
    d.textContent = 'Hello World'
    return d
  }
}

class PropsComponent extends Component<{ name: string }> {
  [GEA_CREATE_TEMPLATE](): Node {
    const d = document.createElement('div')
    d.textContent = String(this.props.name)
    return d
  }
}

class ComponentWithCreated extends Component {
  state = ''
  created() {
    this.state = 'initialized'
  }
  [GEA_CREATE_TEMPLATE](): Node {
    const d = document.createElement('div')
    d.textContent = this.state
    return d
  }
}

class EmptyTemplate extends Component {
  [GEA_CREATE_TEMPLATE](): Node {
    return document.createDocumentFragment()
  }
}

describe('renderToString', () => {
  it('renders a simple component to HTML string', () => {
    const html = renderToString(SimpleComponent as any)
    assert.equal(html, '<div>Hello World</div>')
  })

  it('passes props to component', () => {
    const html = renderToString(PropsComponent as any, { name: 'Gea' })
    assert.equal(html, '<div>Gea</div>')
  })

  it('created() runs via constructor before template()', () => {
    const html = renderToString(ComponentWithCreated as any)
    assert.equal(html, '<div>initialized</div>')
  })

  it('returns empty string for empty template', () => {
    const html = renderToString(EmptyTemplate as any)
    assert.equal(html, '')
  })
})
