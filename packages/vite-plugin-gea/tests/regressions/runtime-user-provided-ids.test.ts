import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

describe('user-provided id attributes', () => {
  it('static id on root element is emitted verbatim', async () => {
    const restoreDom = installDom()
    try {
      const seed = `uid-static-root-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const Comp = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        export default class StaticRootId extends Component {
          template() {
            return <div id="my-app">Hello</div>
          }
        }
        `,
        '/virtual/StaticRootId.jsx',
        'StaticRootId',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const comp = new Comp()
      comp.render(root)

      assert.equal(comp.el.id, 'my-app')
      assert.equal(comp.el.getAttribute('data-gcc'), comp.id)
      assert.equal(comp.el.textContent?.trim(), 'Hello')

      comp.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })

  it('static id on child element with reactive binding is emitted verbatim', async () => {
    const restoreDom = installDom()
    try {
      const seed = `uid-static-child-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const Comp = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        export default class StaticChildId extends Component {
          label = 'Click me'
          template() {
            return (
              <div>
                <button id="my-btn">{this.label}</button>
              </div>
            )
          }
        }
        `,
        '/virtual/StaticChildId.jsx',
        'StaticChildId',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const comp = new Comp()
      comp.render(root)

      const btn = comp.el.querySelector('#my-btn')
      assert.ok(btn, 'button with id="my-btn" should exist')
      assert.equal(btn.textContent?.trim(), 'Click me')

      comp.label = 'Updated'
      await flushMicrotasks()
      assert.equal(btn.textContent?.trim(), 'Updated')

      comp.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })

  it('dynamic id on root element is emitted from expression', async () => {
    const restoreDom = installDom()
    try {
      const seed = `uid-dynamic-root-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const Comp = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        export default class DynamicRootId extends Component {
          template(props: any) {
            return <div id={props.myId}>Content</div>
          }
        }
        `,
        '/virtual/DynamicRootId.jsx',
        'DynamicRootId',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const comp = new Comp({ myId: 'custom-123' })
      comp.render(root)

      assert.equal(comp.el.id, 'custom-123')
      assert.equal(comp.el.getAttribute('data-gcc'), comp.id)

      comp.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })

  it('no user id on root element uses framework id', async () => {
    const restoreDom = installDom()
    try {
      const seed = `uid-no-id-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const Comp = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        export default class NoUserId extends Component {
          template() {
            return <div>No custom id</div>
          }
        }
        `,
        '/virtual/NoUserId.jsx',
        'NoUserId',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const comp = new Comp()
      comp.render(root)

      assert.equal(comp.el.id, comp.id)
      assert.equal(comp.el.getAttribute('data-gcc'), null)

      comp.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })

  it('static id on root with click event delegates correctly', async () => {
    const restoreDom = installDom()
    try {
      const seed = `uid-event-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const Comp = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        export default class EventWithId extends Component {
          clicked = false
          handleClick() {
            this.clicked = true
          }
          template() {
            return <div id="clickable" click={() => this.handleClick()}>Click</div>
          }
        }
        `,
        '/virtual/EventWithId.jsx',
        'EventWithId',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const comp = new Comp()
      comp.render(root)

      assert.equal(comp.el.id, 'clickable')
      assert.equal(comp.clicked, false)

      comp.el.click()
      await flushMicrotasks()
      assert.equal(comp.clicked, true)

      comp.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })

  it('user id on array container element used for list lookup', async () => {
    const restoreDom = installDom()
    try {
      const seed = `uid-array-${Date.now()}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const Comp = await compileJsxComponent(
        `
        import { Component } from '@geajs/core'
        export default class ArrayContainerId extends Component {
          items = ['a', 'b', 'c']
          template() {
            return (
              <div>
                <ul id="my-list">
                  {this.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )
          }
        }
        `,
        '/virtual/ArrayContainerId.jsx',
        'ArrayContainerId',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const comp = new Comp()
      comp.render(root)

      const ul = document.getElementById('my-list')
      assert.ok(ul, 'ul with id="my-list" should exist')
      assert.equal(ul.children.length, 3)
      assert.equal(ul.children[0].textContent, 'a')

      comp.items = ['x', 'y']
      await flushMicrotasks()
      assert.equal(ul.children.length, 2)
      assert.equal(ul.children[0].textContent, 'x')

      comp.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
})
