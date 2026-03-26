import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    MutationObserver: globalThis.MutationObserver,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  }

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
  })

  return () => Object.assign(globalThis, prev)
}

import Component from '../src/lib/base/component'
import { Store } from '../src/lib/store'

describe('Teleport', () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('should teleport content to target selector', () => {
    // Setup DOM with target container
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <div class="modal">Hello World</div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Content should be moved to modal-root
    const modalRoot = document.getElementById('modal-root')!
    assert.strictEqual(modalRoot.children.length, 1)
    assert.strictEqual(modalRoot.querySelector('.modal')?.textContent, 'Hello World')
  })

  it('should not teleport when disabled', () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" data-gea-teleport-disabled="true" style="display: none;">
              <div class="modal">Disabled Content</div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Content should stay in original location
    const modalRoot = document.getElementById('modal-root')!
    assert.strictEqual(modalRoot.children.length, 0)

    // Should remain in app container (inside the hidden teleport div)
    const teleportDiv = appRoot.querySelector('[data-gea-teleport="true"]')!
    assert.strictEqual(teleportDiv.querySelector('.modal')?.textContent, 'Disabled Content')
  })

  it('should handle missing target gracefully', () => {
    document.body.innerHTML = '<div id="app"></div>'

    // Mock console.warn to capture warning
    const originalWarn = console.warn
    let warningMessage = ''
    console.warn = (msg: string) => {
      warningMessage = msg
    }

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#missing-target" style="display: none;">
              <div class="modal">Content</div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Should emit warning and keep content in place
    assert(warningMessage.includes('Target element not found: #missing-target'))

    // Content should remain in original location
    const teleportDiv = appRoot.querySelector('[data-gea-teleport="true"]')!
    assert.strictEqual(teleportDiv.querySelector('.modal')?.textContent, 'Content')

    // Restore console.warn
    console.warn = originalWarn
  })

  it('should cleanup teleported content on component disposal', () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <div class="modal">Cleanup Test</div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Verify content was teleported
    const modalRoot = document.getElementById('modal-root')!
    assert.strictEqual(modalRoot.children.length, 1)

    // Dispose component
    component.dispose()

    // Content should be cleaned up from target
    assert.strictEqual(modalRoot.children.length, 0)
  })

  it('should handle re-rendering and maintain teleport state', async () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    const state = new Store()
    state.showContent = true

    class TestComponent extends Component {
      constructor() {
        super()
        state.observe('showContent', () => {
          if (this.rendered) {
            this.__geaRequestRender()
          }
        })
      }

      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <div class="modal">${state.showContent ? 'Visible' : 'Hidden'}</div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Initial state
    const modalRoot = document.getElementById('modal-root')!
    assert.strictEqual(modalRoot.querySelector('.modal')?.textContent, 'Visible')

    // Update state and trigger re-render
    state.showContent = false

    // Wait for async re-render to complete
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Content should be updated and still teleported
    assert.strictEqual(modalRoot.querySelector('.modal')?.textContent, 'Hidden')
  })

  it('should maintain event delegation for teleported elements', async () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    let clickCount = 0

    class TestComponent extends Component {
      events = {
        click: {
          '.test-button': () => {
            clickCount++
          },
        },
      }

      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <button class="test-button">Click Me</button>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Find teleported button
    const modalRoot = document.getElementById('modal-root')!
    const button = modalRoot.querySelector('.test-button') as HTMLButtonElement
    assert(button, 'Button should be teleported to modal root')

    // Import ComponentManager and test event handling
    const module = await import('../src/lib/base/component-manager')
    const manager = module.default.getInstance()

    // Create and dispatch click event
    const clickEvent = new Event('click', { bubbles: true })
    Object.defineProperty(clickEvent, 'target', { value: button, configurable: true })

    // Simulate ComponentManager event handling
    manager.handleEvent(clickEvent)
    assert.strictEqual(clickCount, 1, 'Event handler should work for teleported element')
  })

  it('should handle multiple teleport elements', () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="sidebar-root"></div><div id="app"></div>'

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <div class="modal">Modal Content</div>
            </div>
            <div data-gea-teleport="true" data-gea-teleport-to="#sidebar-root" style="display: none;">
              <div class="sidebar">Sidebar Content</div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Both targets should receive content
    const modalRoot = document.getElementById('modal-root')!
    const sidebarRoot = document.getElementById('sidebar-root')!

    assert.strictEqual(modalRoot.querySelector('.modal')?.textContent, 'Modal Content')
    assert.strictEqual(sidebarRoot.querySelector('.sidebar')?.textContent, 'Sidebar Content')
  })

  it('should handle nested elements in teleported content', () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <div class="modal">
                <h3>Title</h3>
                <p>Content</p>
                <button>Action</button>
              </div>
            </div>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    const modalRoot = document.getElementById('modal-root')!
    const modal = modalRoot.querySelector('.modal')!

    assert.strictEqual(modal.querySelector('h3')?.textContent, 'Title')
    assert.strictEqual(modal.querySelector('p')?.textContent, 'Content')
    assert.strictEqual(modal.querySelector('button')?.textContent, 'Action')
  })

  it('should preserve DOM structure when teleporting', () => {
    document.body.innerHTML = '<div id="modal-root"></div><div id="app"></div>'

    class TestComponent extends Component {
      template() {
        return `
          <div>
            <span>Before</span>
            <div data-gea-teleport="true" data-gea-teleport-to="#modal-root" style="display: none;">
              <div class="modal">Teleported</div>
            </div>
            <span>After</span>
          </div>
        `
      }
    }

    const component = new TestComponent()
    const appRoot = document.getElementById('app')!
    component.render(appRoot)

    // Original structure should have placeholder comment
    const spans = appRoot.querySelectorAll('span')
    assert.strictEqual(spans.length, 2)
    assert.strictEqual(spans[0].textContent, 'Before')
    assert.strictEqual(spans[1].textContent, 'After')

    // Content should be teleported
    const modalRoot = document.getElementById('modal-root')!
    assert.strictEqual(modalRoot.querySelector('.modal')?.textContent, 'Teleported')
  })
})
