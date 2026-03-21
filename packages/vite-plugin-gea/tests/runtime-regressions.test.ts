import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { JSDOM } from 'jsdom'

import { geaPlugin } from '../index'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  const requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0)
  const cancelAnimationFrame = (id: number) => clearTimeout(id)

  dom.window.requestAnimationFrame = requestAnimationFrame
  dom.window.cancelAnimationFrame = cancelAnimationFrame

  const previous = {
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
    requestAnimationFrame,
    cancelAnimationFrame,
  })

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function compileJsxComponent(source: string, id: string, className: string, bindings: Record<string, unknown>) {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  assert.ok(result)

  let code = typeof result === 'string' ? result : result.code

  // Strip TypeScript types so new Function() can parse the output
  const esbuild = await import('esbuild')
  const stripped = await esbuild.transform(code, { loader: 'ts', target: 'esnext' })
  code = stripped.code

  const compiledSource = `${code
    .replace(/^import .*;$/gm, '')
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replaceAll('import.meta.hot', 'undefined')
    .replaceAll('import.meta.url', '""')
    .replace(/export default class\s+/, 'class ')
    .replace(/export default function\s+/, 'function ')
    .replace(/export\s*\{[^}]*\}/, '')}
return ${className};`

  return new Function(...Object.keys(bindings), compiledSource)(...Object.values(bindings))
}

async function loadRuntimeModules(seed: string) {
  const { default: ComponentManager } = await import('../../gea/src/lib/base/component-manager')
  ComponentManager.instance = undefined
  return Promise.all([
    import(`../../gea/src/lib/base/component.tsx?${seed}`),
    import(`../../gea/src/lib/store.ts?${seed}`),
  ])
}

test('runtime-only bindings update when state changes after render', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-binding`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const RuntimeBindingComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class RuntimeBindingComponent extends Component {
          count = 0

          template() {
            return <div class="count">{this.count}</div>
          }
        }
      `,
      '/virtual/RuntimeBindingComponent.jsx',
      'RuntimeBindingComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new RuntimeBindingComponent()
    component.render(root)

    assert.equal(component.el.textContent?.trim(), '0')

    component.count = 1
    await flushMicrotasks()

    assert.equal(component.el.textContent?.trim(), '1')
    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('simple conditional class bindings toggle on and off', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-simple-class-toggle`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ToggleClassComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ToggleClassComponent extends Component {
          active = false

          template() {
            return <div class={this.active ? 'panel active' : 'panel'}>Panel</div>
          }
        }
      `,
      '/virtual/ToggleClassComponent.jsx',
      'ToggleClassComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ToggleClassComponent()
    component.render(root)

    assert.equal(component.el.className, 'panel')

    component.active = true
    await flushMicrotasks()
    assert.equal(component.el.className, 'panel active')

    component.active = false
    await flushMicrotasks()
    assert.equal(component.el.className, 'panel')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped conditional attributes add and remove in place', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-attribute-toggle`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AttributeList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AttributeList extends Component {
          items = [{ id: 1, label: 'one', active: false }]

          template() {
            return (
              <div class="items">
                {this.items.map(item => (
                  <button key={item.id} data-state={item.active ? 'on' : null}>
                    {item.label}
                  </button>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/AttributeList.jsx',
      'AttributeList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new AttributeList()
    component.render(root)
    await flushMicrotasks()

    const button = () => component.el.querySelector('button')

    assert.equal(button()?.hasAttribute('data-state'), false)

    component.items[0].active = true
    await flushMicrotasks()
    assert.equal(button()?.getAttribute('data-state'), 'on')

    component.items[0].active = false
    await flushMicrotasks()
    assert.equal(button()?.hasAttribute('data-state'), false)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped transition style attributes update and remove without replacing rows', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-transition-style`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const AnimatedList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class AnimatedList extends Component {
          items = [{ id: 1, label: 'toast', visible: false }]

          template() {
            return (
              <div class="items">
                {this.items.map(item => (
                  <div
                    key={item.id}
                    class="toast"
                    style={
                      item.visible
                        ? 'opacity: 1; transform: translateY(0); transition: opacity 150ms ease, transform 150ms ease;'
                        : null
                    }
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/AnimatedList.jsx',
      'AnimatedList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new AnimatedList()
    component.render(root)
    await flushMicrotasks()

    const rowBefore = component.el.querySelector('.toast') as HTMLElement
    assert.equal(rowBefore.getAttribute('style'), null)

    component.items[0].visible = true
    await flushMicrotasks()

    const rowVisible = component.el.querySelector('.toast') as HTMLElement
    assert.equal(rowVisible, rowBefore)
    assert.match(rowVisible.getAttribute('style') || '', /transition:\s*opacity 150ms ease, transform 150ms ease;/)
    assert.match(rowVisible.getAttribute('style') || '', /opacity:\s*1/)
    assert.match(rowVisible.getAttribute('style') || '', /transform:\s*translateY\(0\)/)

    component.items[0].visible = false
    await flushMicrotasks()

    const rowAfter = component.el.querySelector('.toast') as HTMLElement
    assert.equal(rowAfter, rowBefore)
    assert.equal(rowAfter.getAttribute('style'), null)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches swap rendered elements when state flips', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-branches`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ConditionalBranchComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ConditionalBranchComponent extends Component {
          expanded = false

          template() {
            return (
              <section class="card">
                {this.expanded ? (
                  <p class="details">Details</p>
                ) : (
                  <button class="summary">Open</button>
                )}
              </section>
            )
          }
        }
      `,
      '/virtual/ConditionalBranchComponent.jsx',
      'ConditionalBranchComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ConditionalBranchComponent()
    component.render(root)

    assert.equal(component.el.querySelector('.summary')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)

    component.expanded = true
    await flushMicrotasks()
    assert.equal(component.el.querySelector('.details')?.textContent?.trim(), 'Details')
    assert.equal(component.el.querySelector('.summary'), null)

    component.expanded = false
    await flushMicrotasks()
    assert.equal(component.el.querySelector('.summary')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches preserve surrounding siblings across repeated flips', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-sibling-stability`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SiblingStableConditional = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SiblingStableConditional extends Component {
          open = false

          template() {
            return (
              <section class="panel">
                <header class="title">Title</header>
                {this.open ? (
                  <div class="details">
                    <span class="details-copy">Details</span>
                  </div>
                ) : (
                  <button class="trigger">Open</button>
                )}
                <footer class="footer">Footer</footer>
              </section>
            )
          }
        }
      `,
      '/virtual/SiblingStableConditional.jsx',
      'SiblingStableConditional',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new SiblingStableConditional()
    component.render(root)

    assert.equal(component.el.children.length, 3)
    assert.equal(component.el.querySelector('.trigger')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'trigger', 'footer'],
    )

    component.open = true
    await flushMicrotasks()
    assert.equal(component.el.children.length, 3)
    assert.equal(component.el.querySelectorAll('.title').length, 1)
    assert.equal(component.el.querySelectorAll('.footer').length, 1)
    assert.equal(component.el.querySelector('.trigger'), null)
    assert.equal(component.el.querySelector('.details-copy')?.textContent?.trim(), 'Details')
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'details', 'footer'],
    )

    component.open = false
    await flushMicrotasks()
    assert.equal(component.el.children.length, 3)
    assert.equal(component.el.querySelectorAll('.title').length, 1)
    assert.equal(component.el.querySelectorAll('.footer').length, 1)
    assert.equal(component.el.querySelector('.trigger')?.textContent?.trim(), 'Open')
    assert.equal(component.el.querySelector('.details'), null)
    assert.deepEqual(
      Array.from(component.el.children).map((node) => (node as HTMLElement).className),
      ['title', 'trigger', 'footer'],
    )

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional branches do not leave stale transitioning nodes behind', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-stale-node-cleanup`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TransitionBranchComponent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TransitionBranchComponent extends Component {
          showToast = false

          template() {
            return (
              <div class="shell">
                {this.showToast ? (
                  <div class="toast" style="opacity: 1; transition: opacity 120ms ease;">Saved</div>
                ) : (
                  <span class="idle">Idle</span>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/TransitionBranchComponent.jsx',
      'TransitionBranchComponent',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new TransitionBranchComponent()
    component.render(root)

    assert.equal(component.el.querySelectorAll('.toast').length, 0)
    assert.equal(component.el.querySelectorAll('.idle').length, 1)

    component.showToast = true
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 1)
    assert.equal(component.el.querySelectorAll('.idle').length, 0)
    assert.match(component.el.querySelector('.toast')?.getAttribute('style') || '', /transition:\s*opacity 120ms ease;/)

    component.showToast = false
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 0)
    assert.equal(component.el.querySelectorAll('.idle').length, 1)

    component.showToast = true
    await flushMicrotasks()
    assert.equal(component.el.querySelectorAll('.toast').length, 1)
    assert.equal(component.el.querySelectorAll('.idle').length, 0)

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped list mutations add and remove DOM rows in order', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-list-mutations`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SimpleList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SimpleList extends Component {
          nextId = 2
          items = [{ id: 1, label: 'one' }]

          add(label) {
            this.items.push({ id: this.nextId++, label })
          }

          removeFirst() {
            this.items.splice(0, 1)
          }

          template() {
            return (
              <ul class="items">
                {this.items.map(item => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            )
          }
        }
      `,
      '/virtual/SimpleList.jsx',
      'SimpleList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new SimpleList()
    component.render(root)

    const rowTexts = () =>
      Array.from(component.el.querySelectorAll('li')).map((node: Element) => node.textContent?.trim())

    assert.deepEqual(rowTexts(), ['one'])

    component.add('two')
    await flushMicrotasks()
    assert.deepEqual(rowTexts(), ['one', 'two'])

    component.removeFirst()
    await flushMicrotasks()
    assert.deepEqual(rowTexts(), ['two'])

    component.add('three')
    await flushMicrotasks()
    assert.deepEqual(rowTexts(), ['two', 'three'])

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child props stay reactive for imported store state', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-imported-child`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ count: 1 })

    const CounterChild = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CounterChild extends Component {
          template({ count }) {
            return <div class="counter-value">{count}</div>
          }
        }
      `,
      '/virtual/CounterChild.jsx',
      'CounterChild',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import CounterChild from './CounterChild.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent-view">
                <CounterChild count={store.count} />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentView.jsx',
      'ParentView',
      { Component, store, CounterChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    assert.equal(view.el.textContent?.trim(), '1')

    store.count = 2
    await flushMicrotasks()

    assert.equal(view.el.textContent?.trim(), '2')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('array slot list does not clear when selecting option (imported store)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-array-slot-select`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const OPTIONS = [
      { id: 'a', label: 'Option A', price: 0 },
      { id: 'b', label: 'Option B', price: 10 },
      { id: 'c', label: 'Option C', price: 20 },
    ]

    const optionsStore = new Store({ selected: 'a' }) as {
      selected: string
      setSelected: (id: string) => void
    }
    optionsStore.setSelected = (id: string) => {
      optionsStore.selected = id
    }

    const OptionStepWithInlineItems = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class OptionStepWithInlineItems extends Component {
          template({ options, selectedId, onSelect }) {
            return (
              <div class="option-step">
                {options.map(opt => (
                  <div
                    key={opt.id}
                    class={\`option-item \${selectedId === opt.id ? 'selected' : ''}\`}
                    click={() => onSelect(opt.id)}
                  >
                    <span class="label">{opt.label}</span>
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/OptionStepWithInlineItems.jsx',
      'OptionStepWithInlineItems',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new OptionStepWithInlineItems({
      options: OPTIONS,
      selectedId: optionsStore.selected,
      onSelect: (id: string) => optionsStore.setSelected(id),
    })
    view.render(root)
    await flushMicrotasks()

    const optionItems = root.querySelectorAll('.option-item')
    assert.equal(optionItems.length, 3, 'initial render: should have 3 options')
    assert.ok(root.querySelector('.option-item.selected'), 'option A should be selected initially')

    const optionB = Array.from(optionItems).find((el) => el.querySelector('.label')?.textContent?.trim() === 'Option B')
    assert.ok(optionB, 'should find Option B')
    optionB?.dispatchEvent(new window.Event('click', { bubbles: true }))

    await flushMicrotasks()

    const optionItemsAfter = root.querySelectorAll('.option-item')
    assert.equal(optionItemsAfter.length, 3, 'after select: list must not clear, should still have 3 options')
    assert.ok(root.querySelector('.option-item.selected'), 'one option should be selected after click')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child option select updates in place without leaked click attrs or section rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-compiled-child-option-select`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const OPTIONS = [
      { id: 'a', label: 'Option A', price: 0 },
      { id: 'b', label: 'Option B', price: 10 },
      { id: 'c', label: 'Option C', price: 20 },
    ]

    const OptionItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class OptionItem extends Component {
          template({ label, price, selected, onSelect }) {
            return (
              <div class={\`option-item \${selected ? 'selected' : ''}\`} click={onSelect}>
                <span class="label">{label}</span>
                <span class="price">{price === 0 ? 'Included' : \`+$\${price}\`}</span>
              </div>
            )
          }
        }
      `,
      '/virtual/OptionItem.jsx',
      'OptionItem',
      { Component },
    )

    const OptionStep = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import OptionItem from './OptionItem.jsx'

        export default class OptionStep extends Component {
          template({ options, selectedId, onSelect }) {
            return (
              <section class="section-card">
                <div class="option-grid">
                  {options.map(opt => (
                    <OptionItem
                      key={opt.id}
                      label={opt.label}
                      price={opt.price}
                      selected={selectedId === opt.id}
                      onSelect={() => onSelect(opt.id)}
                    />
                  ))}
                </div>
              </section>
            )
          }
        }
      `,
      '/virtual/OptionStep.jsx',
      'OptionStep',
      { Component, OptionItem },
    )

    const optionsStore = new Store({ selected: 'a' }) as {
      selected: string
      setSelected: (id: string) => void
    }
    optionsStore.setSelected = (id: string) => {
      optionsStore.selected = id
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new OptionStep({
      options: OPTIONS,
      selectedId: optionsStore.selected,
      onSelect: (id: string) => optionsStore.setSelected(id),
    })
    view.render(root)
    await flushMicrotasks()

    const sectionBefore = root.querySelector('.section-card')
    assert.ok(sectionBefore, 'section should render')
    assert.equal(root.querySelectorAll('.option-item[click]').length, 0, 'no click attrs should leak initially')

    const optionB = Array.from(root.querySelectorAll('.option-item')).find(
      (el) => el.querySelector('.label')?.textContent?.trim() === 'Option B',
    )
    assert.ok(optionB, 'should find Option B')

    optionB?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    view.__geaUpdateProps({ selectedId: optionsStore.selected })
    await flushMicrotasks()

    const sectionAfter = root.querySelector('.section-card')
    assert.equal(sectionAfter, sectionBefore, 'section root should not be replaced on option select')
    assert.equal(root.querySelectorAll('.option-item[click]').length, 0, 'no click attrs should leak after select')

    const selected = root.querySelector('.option-item.selected .label')?.textContent?.trim()
    assert.equal(selected, 'Option B')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('option select patches in place without full rerender (showBack + arrow function props)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-parent-conditional-option-select`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const OPTIONS = [
      { id: 'economy', label: 'Economy', description: 'Standard legroom', price: 0 },
      { id: 'premium', label: 'Premium Economy', description: 'Extra legroom', price: 120 },
      { id: 'business', label: 'Business Class', description: 'Lie-flat seat', price: 350 },
    ]

    const OptionItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default function OptionItem({ label, description, price, selected, onSelect }) {
          return (
            <div class={\`option-item \${selected ? 'selected' : ''}\`} click={onSelect}>
              <div>
                <div class="label">{label}</div>
                {description && <div class="description">{description}</div>}
              </div>
              <span class={\`price \${price === 0 ? 'free' : ''}\`}>
                {price === 0 ? 'Included' : \`+$\${price}\`}
              </span>
            </div>
          )
        }
      `,
      '/virtual/OptionItem.jsx',
      'OptionItem',
      { Component },
    )

    const OptionStep = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import OptionItem from './OptionItem.jsx'

        export default function OptionStep({
          stepNumber, title, options, selectedId,
          showBack, nextLabel = 'Continue',
          onSelect, onBack, onContinue
        }) {
          return (
            <section class="section-card">
              <div class="option-grid">
                {options.map(opt => (
                  <OptionItem
                    key={opt.id}
                    label={opt.label}
                    description={opt.description}
                    price={opt.price}
                    selected={selectedId === opt.id}
                    onSelect={() => onSelect(opt.id)}
                  />
                ))}
              </div>
              <div class="nav-buttons">
                {showBack && (
                  <button class="btn btn-secondary" click={onBack}>
                    Back
                  </button>
                )}
                <button class="btn btn-primary" click={onContinue}>
                  {nextLabel}
                </button>
              </div>
            </section>
          )
        }
      `,
      '/virtual/OptionStep.jsx',
      'OptionStep',
      { Component, OptionItem },
    )

    const stepStore = new Store({ step: 2 }) as { step: number; setStep: (n: number) => void }
    stepStore.setStep = (n: number) => {
      stepStore.step = n
    }

    const optionsStore = new Store({ seat: 'economy' }) as { seat: string; setSeat: (id: string) => void }
    optionsStore.setSeat = (id: string) => {
      optionsStore.seat = id
    }

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import OptionStep from './OptionStep.jsx'
        import stepStore from './step-store'
        import optionsStore from './options-store'

        export default class ParentView extends Component {
          template() {
            const { step } = stepStore
            const { seat } = optionsStore
            return (
              <div class="parent-view">
                <h1>Select Seat</h1>
                {step === 2 && (
                  <OptionStep
                    stepNumber={2}
                    title="Select Seat"
                    options={OPTIONS}
                    selectedId={seat}
                    showBack={true}
                    nextLabel="Continue"
                    onSelect={id => optionsStore.setSeat(id)}
                    onBack={() => stepStore.setStep(1)}
                    onContinue={() => stepStore.setStep(3)}
                  />
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentView.jsx',
      'ParentView',
      { Component, OptionStep, stepStore, optionsStore, OPTIONS },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    // --- spy on __geaRequestRender at every level ---
    let parentRerenders = 0
    const origParentRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      parentRerenders++
      return origParentRender()
    }

    const optionStepChild = view._optionStep2 ?? view._optionStep
    assert.ok(optionStepChild, 'OptionStep child must exist after render')
    let childRerenders = 0
    const origChildRender = optionStepChild.__geaRequestRender.bind(optionStepChild)
    optionStepChild.__geaRequestRender = () => {
      childRerenders++
      return origChildRender()
    }

    const optionItems = optionStepChild._optionsItems
    assert.ok(optionItems?.length > 0, 'OptionItem array should be populated')
    let itemRerenders = 0
    for (const item of optionItems) {
      if (!item.__geaRequestRender) continue
      const origItemRender = item.__geaRequestRender.bind(item)
      item.__geaRequestRender = () => {
        itemRerenders++
        return origItemRender()
      }
    }

    // --- capture DOM references before click ---
    const sectionBefore = root.querySelector('.section-card')
    assert.ok(sectionBefore, 'section should render')
    const optionDivsBefore = Array.from(root.querySelectorAll('.option-item'))
    assert.equal(optionDivsBefore.length, 3, 'should render 3 options')
    assert.ok(root.querySelector('.option-item.selected'), 'economy should be selected initially')
    assert.ok(root.querySelector('.btn.btn-secondary'), 'Back button should render (showBack=true)')

    // --- click Premium Economy ---
    const premiumOption = optionDivsBefore.find(
      (el) => el.querySelector('.label')?.textContent?.trim() === 'Premium Economy',
    )
    assert.ok(premiumOption, 'should find Premium Economy option')
    premiumOption?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    // --- assert zero full rerenders at all levels ---
    assert.equal(parentRerenders, 0, `ParentView must NOT call __geaRequestRender (got ${parentRerenders})`)
    assert.equal(childRerenders, 0, `OptionStep must NOT call __geaRequestRender (got ${childRerenders})`)
    assert.equal(itemRerenders, 0, `OptionItem must NOT call __geaRequestRender (got ${itemRerenders})`)

    // --- assert DOM identity preserved (no replace, just patch) ---
    const sectionAfter = root.querySelector('.section-card')
    assert.equal(sectionAfter, sectionBefore, 'section DOM element must be the same object (not replaced)')
    const optionDivsAfter = Array.from(root.querySelectorAll('.option-item'))
    assert.equal(optionDivsAfter.length, 3, 'should still have 3 options')
    for (let i = 0; i < optionDivsBefore.length; i++) {
      assert.equal(optionDivsAfter[i], optionDivsBefore[i], `option-item[${i}] DOM element must be the same object`)
    }

    // --- assert selection actually changed ---
    assert.equal(
      root.querySelector('.option-item.selected .label')?.textContent?.trim(),
      'Premium Economy',
      'Premium Economy should be selected after click',
    )
    const selectedCount = root.querySelectorAll('.option-item.selected').length
    assert.equal(selectedCount, 1, 'exactly one option should be selected')

    // --- click Business Class (second selection change) ---
    parentRerenders = 0
    childRerenders = 0
    itemRerenders = 0
    const businessOption = Array.from(root.querySelectorAll('.option-item')).find(
      (el) => el.querySelector('.label')?.textContent?.trim() === 'Business Class',
    )
    businessOption?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(parentRerenders, 0, `ParentView must NOT rerender on second click (got ${parentRerenders})`)
    assert.equal(childRerenders, 0, `OptionStep must NOT rerender on second click (got ${childRerenders})`)
    assert.equal(itemRerenders, 0, `OptionItem must NOT rerender on second click (got ${itemRerenders})`)
    assert.equal(
      root.querySelector('.option-item.selected .label')?.textContent?.trim(),
      'Business Class',
      'Business Class should be selected after second click',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child props can use template-local variables', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-child-locals`
    const [{ default: Component }] = await Promise.all([import(`../../gea/src/lib/base/component.tsx?${seed}`)])

    const ChildBadge = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ChildBadge extends Component {
          template({ activeClass }) {
            return <div class={activeClass}>Counter</div>
          }
        }
      `,
      '/virtual/ChildBadge.jsx',
      'ChildBadge',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import ChildBadge from './ChildBadge.jsx'

        export default class ParentView extends Component {
          constructor() {
            super()
            this.currentPage = 'counter'
          }

          template() {
            const activeClass = this.currentPage === 'counter' ? 'active' : ''
            return (
              <div class="parent-view">
                <ChildBadge activeClass={activeClass} />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentViewWithLocals.jsx',
      'ParentView',
      { Component, ChildBadge },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    const badge = root.querySelector('div.active')
    assert.ok(badge)
    assert.equal(badge.textContent?.trim(), 'Counter')

    view.dispose()
    await flushMicrotasks()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('View renders passed children', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-view-children`
    const [{ default: Component }] = await Promise.all([import(`../../gea/src/lib/base/component.tsx?${seed}`)])

    class View extends Component {
      index = 0

      render(opt_rootEl = document.body, opt_index = 0) {
        this.index = opt_index
        return super.render(opt_rootEl)
      }

      onAfterRender() {
        super.onAfterRender()
        this.el.style.zIndex = String(this.index)
        this.el.style.transform = `translate3d(0, 0, ${this.index}px)`
      }

      constructor(props: any = {}) {
        super(props)
      }

      template(props: Record<string, any> = {}) {
        const children = props.children == null ? '' : props.children
        return `<view>${children}</view>`
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new View({
      children: '<button class="inner-button">Counter</button>',
    })
    view.render(root)
    await flushMicrotasks()

    const button = root.querySelector('button.inner-button')
    assert.ok(button, root.innerHTML)
    assert.equal(button.textContent?.trim(), 'Counter')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store push emits one semantic append change', async () => {
  const seed = `runtime-${Date.now()}-append`
  const [, { Store }] = await loadRuntimeModules(seed)
  const store = new Store({ data: [] as Array<{ id: number }> })
  const seen: Array<{ value: Array<{ id: number }>; changes: Array<Record<string, unknown>> }> = []

  store.observe('data', (value, changes) => {
    seen.push({
      value: value as Array<{ id: number }>,
      changes: changes as Array<Record<string, unknown>>,
    })
  })

  store.data.push({ id: 1 }, { id: 2 })
  await flushMicrotasks()

  assert.equal(seen.length, 1)
  assert.equal(seen[0]?.value.length, 2)
  assert.equal(seen[0]?.changes.length, 1)
  assert.equal(seen[0]?.changes[0]?.type, 'append')
  assert.deepEqual(seen[0]?.changes[0]?.pathParts, ['data'])
  assert.equal(seen[0]?.changes[0]?.start, 0)
  assert.equal(seen[0]?.changes[0]?.count, 2)
})

test('store annotates reciprocal array index updates as swaps', async () => {
  const seed = `runtime-${Date.now()}-swap-meta`
  const [, { Store }] = await loadRuntimeModules(seed)
  const store = new Store({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] })
  const seen: Array<Record<string, unknown>[]> = []

  store.observe('data', (_value, changes) => {
    seen.push(changes as Array<Record<string, unknown>>)
  })

  const rows = store.data
  const tmp = rows[0]
  rows[0] = rows[2]
  rows[2] = tmp
  await flushMicrotasks()

  assert.equal(seen.length, 1)
  assert.equal(seen[0]?.length, 2)
  assert.equal(seen[0]?.[0]?.arrayOp, 'swap')
  assert.equal(seen[0]?.[1]?.arrayOp, 'swap')
  assert.deepEqual(seen[0]?.[0]?.arrayPathParts, ['data'])
  assert.deepEqual(seen[0]?.[1]?.arrayPathParts, ['data'])
  assert.equal(seen[0]?.[0]?.otherIndex, 2)
  assert.equal(seen[0]?.[1]?.otherIndex, 0)
  assert.equal(typeof seen[0]?.[0]?.opId, 'string')
  assert.equal(seen[0]?.[0]?.opId, seen[0]?.[1]?.opId)
})

test('store leaves unrelated array index updates unclassified', async () => {
  const seed = `runtime-${Date.now()}-no-swap-meta`
  const [, { Store }] = await loadRuntimeModules(seed)
  const store = new Store({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] })
  const seen: Array<Record<string, unknown>[]> = []

  store.observe('data', (_value, changes) => {
    seen.push(changes as Array<Record<string, unknown>>)
  })

  store.data[0] = { id: 4 }
  store.data[2] = { id: 5 }
  await flushMicrotasks()

  assert.equal(seen.length, 1)
  assert.equal(seen[0]?.length, 2)
  assert.equal(seen[0]?.[0]?.arrayOp, undefined)
  assert.equal(seen[0]?.[1]?.arrayOp, undefined)
})

test('single array item property updates refresh mapped class bindings', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-todo-completed-class`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoList extends Component {
          todos = [{ id: 1, text: 'First todo', completed: false }]

          toggle(todo) {
            todo.completed = !todo.completed
          }

          template() {
            return (
              <div class="todo-list">
                <div class="todo-items">
                  {this.todos.map(todo => (
                    <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                      <input type="checkbox" checked={todo.completed} change={() => this.toggle(todo)} />
                      <span>{todo.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/TodoListCompletedClass.jsx',
      'TodoList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    const rowBefore = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxBefore = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null

    assert.ok(rowBefore)
    assert.ok(checkboxBefore)
    assert.equal(rowBefore?.className, 'todo-item')
    assert.equal(checkboxBefore?.checked, false)

    view.todos[0].completed = true
    await flushMicrotasks()

    const rowAfter = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxAfter = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null

    assert.ok(rowAfter)
    assert.ok(checkboxAfter)
    assert.equal(rowAfter?.className, 'todo-item completed')
    assert.equal(checkboxAfter?.checked, true)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped checkbox events resolve live proxy items and refresh completed class', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-todo-checkbox-class`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoList extends Component {
          todos = [{ id: 1, text: 'First todo', completed: false }]

          toggle(todo) {
            todo.completed = !todo.completed
          }

          template() {
            return (
              <div class="todo-list">
                <div class="todo-items">
                  {this.todos.map(todo => (
                    <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                      <input type="checkbox" checked={todo.completed} change={() => this.toggle(todo)} />
                      <span>{todo.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/TodoListCheckboxClass.jsx',
      'TodoList',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    const rowBefore = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxBefore = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null

    assert.ok(rowBefore)
    assert.ok(checkboxBefore)
    assert.equal(rowBefore?.className, 'todo-item')
    assert.equal(checkboxBefore?.checked, false)

    checkboxBefore?.dispatchEvent(new window.Event('change', { bubbles: true }))
    await flushMicrotasks()

    const rowAfter = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxAfter = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null

    assert.ok(rowAfter)
    assert.ok(checkboxAfter)
    assert.equal(rowAfter?.className, 'todo-item completed')
    assert.equal(checkboxAfter?.checked, true)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('imported todo store checkbox events refresh completed class and stats', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-imported-todo-checkbox-class`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      todos: [{ id: 1, text: 'First todo', completed: false }],
      inputValue: '',
      editingId: null,
      editingValue: '',
      nextTodoId: 2,
    })
    ;(store as typeof store & { toggleTodo: (todo: { completed: boolean }) => void }).toggleTodo = (todo) => {
      todo.completed = !todo.completed
    }

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './todo-store.ts'

        export default class TodoList extends Component {
          template() {
            return (
              <div class="todo-list">
                <div class="todo-items">
                  {store.todos.map(todo => (
                    <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                      <input type="checkbox" checked={todo.completed} change={() => store.toggleTodo(todo)} />
                      <span>{todo.text}</span>
                    </div>
                  ))}
                </div>
                <div class="todo-stats">
                  Total: {store.todos.length} | Completed: {store.todos.filter(todo => todo.completed).length}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/ImportedTodoListCheckboxClass.jsx',
      'TodoList',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    const rowBefore = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxBefore = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    const statsBefore = view.el.querySelector('.todo-stats') as HTMLElement | null
    assert.ok(rowBefore)
    assert.ok(checkboxBefore)
    assert.ok(statsBefore)
    assert.equal(rowBefore?.className, 'todo-item')
    assert.equal(checkboxBefore?.checked, false)
    assert.match(statsBefore?.textContent || '', /Completed:\s*0/)

    checkboxBefore?.dispatchEvent(new window.Event('change', { bubbles: true }))
    await flushMicrotasks()

    const rowAfter = view.el.querySelector('.todo-item') as HTMLElement | null
    const checkboxAfter = view.el.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    const statsAfter = view.el.querySelector('.todo-stats') as HTMLElement | null
    assert.ok(rowAfter)
    assert.ok(checkboxAfter)
    assert.ok(statsAfter)
    assert.equal(rowAfter?.className, 'todo-item completed')
    assert.equal(checkboxAfter?.checked, true)
    assert.match(statsAfter?.textContent || '', /Completed:\s*1/)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('imported todo store add flow renders first todo and updates stats', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-imported-todo-add`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      todos: [] as Array<{ id: number; text: string; completed: boolean }>,
      inputValue: '',
      editingId: null,
      editingValue: '',
      nextTodoId: 1,
    })
    Object.assign(store as Record<string, unknown>, {
      setInputValue(event: { target: { value: string } }) {
        store.inputValue = event.target.value
      },
      addTodo() {
        const inputValue = String(store.inputValue || '')
        if (inputValue.trim()) {
          store.todos.push({
            id: store.nextTodoId++,
            text: inputValue,
            completed: false,
          })
          store.inputValue = ''
        }
      },
      toggleTodo(todo: { completed: boolean }) {
        todo.completed = !todo.completed
      },
      deleteTodo(todo: { id: number }) {
        const index = store.todos.findIndex((item) => item.id === todo.id)
        if (index !== -1) store.todos.splice(index, 1)
      },
      startEditing(todo: { id: number; text: string }) {
        store.editingId = todo.id
        store.editingValue = todo.text
      },
      setEditingValue(event: { target: { value: string } }) {
        store.editingValue = event.target.value
      },
      updateTodo(todo: { text: string }) {
        if (store.editingValue.trim() && store.editingValue !== todo.text) {
          todo.text = store.editingValue
        }
        store.editingId = null
        store.editingValue = ''
      },
      cancelEditing() {
        store.editingId = null
        store.editingValue = ''
      },
    })

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './todo-store.ts'

        export default class TodoList extends Component {
          addTodoOnEnter(event) {
            if (event.key === 'Enter') {
              store.addTodo()
            }
          }

          template() {
            const _ = store.editingId
            return (
              <div class="todo-list">
                <div class="todo-input">
                  <input
                    type="text"
                    value={store.inputValue}
                    input={store.setInputValue}
                    keydown={this.addTodoOnEnter}
                    placeholder="Add a todo..."
                  />
                  <button click={store.addTodo}>Add</button>
                </div>
                <div class="todo-items">
                  {store.todos.map(todo => (
                    <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
                      <input type="checkbox" checked={todo.completed} change={() => store.toggleTodo(todo)} />
                      {store.editingId === todo.id ? (
                        <>
                          <input
                            type="text"
                            value={todo.text}
                            input={store.setEditingValue}
                            class="todo-edit-input"
                          />
                          <button click={() => store.updateTodo(todo)}>Save</button>
                          <button click={() => store.cancelEditing()}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <span dblclick={() => store.startEditing(todo)}>{todo.text}</span>
                          <button click={() => store.startEditing(todo)}>Edit</button>
                          <button click={() => store.deleteTodo(todo)}>Delete</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div class="todo-stats">
                  Total: {store.todos.length} | Completed: {store.todos.filter(todo => todo.completed).length}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/ImportedTodoListAddFlow.jsx',
      'TodoList',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    store.inputValue = 'hello'
    store.addTodo()
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.todo-item').length, 1)
    assert.match(view.el.querySelector('.todo-items')?.textContent || '', /hello/)
    assert.match(view.el.querySelector('.todo-stats')?.textContent || '', /Total:\s*1/)
    assert.equal((view.el.querySelector('.todo-input input[type="text"]') as HTMLInputElement | null)?.value, '')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('getter-derived imported child list renders items after add', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-getter-derived-child-list`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      todos: [] as Array<{ id: number; text: string; done: boolean }>,
      draft: '',
      filter: 'all' as 'all' | 'active' | 'completed',
      nextId: 1,
    }) as InstanceType<typeof Store> & {
      addTodo: (text: string) => void
      filteredTodos: Array<{ id: number; text: string; done: boolean }>
    }

    Object.defineProperty(store, 'filteredTodos', {
      get() {
        const { todos, filter } = store
        if (filter === 'active') return todos.filter((todo) => !todo.done)
        if (filter === 'completed') return todos.filter((todo) => todo.done)
        return todos
      },
    })

    store.addTodo = (text: string) => {
      store.todos = [...store.todos, { id: store.nextId++, text, done: false }]
    }

    const TodoRow = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoRow extends Component {
          template({ todo }) {
            return <li class="todo-row">{todo.text}</li>
          }
        }
      `,
      '/virtual/TodoRow.jsx',
      'TodoRow',
      { Component },
    )

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './todo-store.ts'
        import TodoRow from './TodoRow.jsx'

        export default class TodoList extends Component {
          template() {
            const { filteredTodos } = store
            return (
              <ul class="todo-list">
                {filteredTodos.map(todo => (
                  <TodoRow key={todo.id} todo={todo} />
                ))}
              </ul>
            )
          }
        }
      `,
      '/virtual/GetterDerivedTodoList.jsx',
      'TodoList',
      { Component, store, TodoRow },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    let parentRerenders = 0
    const originalRerender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      parentRerenders++
      return originalRerender()
    }

    const listBefore = view.el.querySelector('.todo-list') as HTMLElement | null
    assert.equal(view.el.querySelectorAll('.todo-row').length, 0)

    store.addTodo('first')
    await flushMicrotasks()

    const listAfterFirst = view.el.querySelector('.todo-list') as HTMLElement | null
    assert.equal(parentRerenders, 0, 'first add should not call parent __geaRequestRender')
    assert.equal(listAfterFirst, listBefore, 'todo list container should be preserved on first add')
    assert.equal(view.el.querySelectorAll('.todo-row').length, 1)
    assert.match(view.el.textContent || '', /first/)

    store.addTodo('second')
    await flushMicrotasks()

    const listAfterSecond = view.el.querySelector('.todo-list') as HTMLElement | null
    assert.equal(parentRerenders, 0, 'subsequent adds should not call parent __geaRequestRender')
    assert.equal(listAfterSecond, listBefore, 'todo list container should be preserved on subsequent adds')
    assert.equal(view.el.querySelectorAll('.todo-row').length, 2)
    assert.match(view.el.textContent || '', /second/)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional imported empty-state list updates without parent rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-imported-empty-list`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      logs: [] as Array<{ id: number; label: string; gesture: string }>,
      nextId: 1,
    }) as {
      logs: Array<{ id: number; label: string; gesture: string }>
      nextId: number
      addLog: (label: string) => void
    }

    store.addLog = (label: string) => {
      const entry = { id: store.nextId++, label, gesture: label }
      store.logs = [entry, ...store.logs]
    }

    const GestureLikeView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './gesture-store.ts'

        export default class GestureLikeView extends Component {
          template() {
            return (
              <div class="gesture-view">
                <button class="tap-target" click={() => store.addLog('tap')}>Touch here</button>
                <div class="log-wrap">
                  {store.logs.length === 0 ? (
                    <div class="empty-state">No gestures detected yet</div>
                  ) : (
                    store.logs.map(entry => (
                      <div key={entry.id} class={\`gesture-log-entry gesture-\${entry.gesture}\`}>
                        {entry.label}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/GestureLikeView.jsx',
      'GestureLikeView',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new GestureLikeView()
    view.render(root)
    await flushMicrotasks()

    let parentRerenders = 0
    const originalRerender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      parentRerenders++
      return originalRerender()
    }

    const wrapBefore = view.el.querySelector('.log-wrap') as HTMLElement | null
    const buttonBefore = view.el.querySelector('.tap-target') as HTMLElement | null
    assert.ok(wrapBefore)
    assert.ok(buttonBefore)
    assert.equal(view.el.querySelectorAll('.log-entry').length, 0)
    assert.match(view.el.querySelector('.empty-state')?.textContent || '', /No gestures/)

    buttonBefore?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    const wrapAfterFirst = view.el.querySelector('.log-wrap') as HTMLElement | null
    const buttonAfterFirst = view.el.querySelector('.tap-target') as HTMLElement | null
    assert.equal(parentRerenders, 0, 'first log insert should not call parent __geaRequestRender')
    assert.equal(wrapAfterFirst, wrapBefore, 'log wrapper should be preserved on first insert')
    assert.equal(buttonAfterFirst, buttonBefore, 'tap target should be preserved on first insert')
    assert.equal(view.el.querySelector('.empty-state'), null)
    assert.equal(view.el.querySelectorAll('.gesture-log-entry').length, 1)
    assert.equal(
      (view.el.querySelector('.gesture-log-entry') as HTMLElement | null)?.className,
      'gesture-log-entry gesture-tap',
    )

    buttonAfterFirst?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    const wrapAfterSecond = view.el.querySelector('.log-wrap') as HTMLElement | null
    const buttonAfterSecond = view.el.querySelector('.tap-target') as HTMLElement | null
    assert.equal(parentRerenders, 0, 'subsequent log inserts should not call parent __geaRequestRender')
    assert.equal(wrapAfterSecond, wrapBefore, 'log wrapper should be preserved on subsequent inserts')
    assert.equal(buttonAfterSecond, buttonBefore, 'tap target should be preserved on subsequent inserts')
    const rows = Array.from(view.el.querySelectorAll('.gesture-log-entry')) as HTMLElement[]
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((row) => row.className),
      ['gesture-log-entry gesture-tap', 'gesture-log-entry gesture-tap'],
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped edit input submits todo changes on Enter', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-todo-enter`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      todos: [{ id: 1, text: 'original', completed: false }],
      editingId: 1,
      editingValue: 'original',
    })
    Object.assign(store, {
      setEditingValue(event: { target: { value: string } }) {
        store.editingValue = event.target.value
      },
      updateTodo(todo: { text: string }) {
        todo.text = String(store.editingValue)
        store.editingId = null
      },
    })

    const TodoList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './todo-store.ts'

        export default class TodoList extends Component {
          template() {
            return (
              <div class="todo-items">
                {store.todos.map(todo => (
                  <div class="todo-item" key={todo.id}>
                    {store.editingId === todo.id ? (
                      <input
                        type="text"
                        value={todo.text}
                        input={store.setEditingValue}
                        keydown={e => {
                          if (e.key === 'Enter') {
                            store.updateTodo(todo)
                          }
                        }}
                        class="todo-edit-input"
                      />
                    ) : (
                      <span>{todo.text}</span>
                    )}
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/TodoEnterEdit.jsx',
      'TodoList',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoList()
    view.render(root)
    await flushMicrotasks()

    const input = view.el.querySelector('.todo-edit-input') as HTMLInputElement | null
    assert.ok(input)

    input.value = 'updated via enter'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.todo-item span')?.textContent, 'updated via enter')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('inline event handlers can use template-local validation state', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-local-click-state`
    const [{ default: Component }] = await loadRuntimeModules(seed)
    let payCount = 0

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class PaymentForm extends Component {
          template(props) {
            const { value, onPay } = props
            const isValid = value.trim().length > 0
            return (
              <div class="payment-form">
                <button class="pay-btn" click={() => isValid && onPay()}>Pay</button>
              </div>
            )
          }
        }
      `,
      '/virtual/LocalStatePaymentForm.jsx',
      'PaymentForm',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new PaymentForm({
      value: 'ok',
      onPay: () => {
        payCount++
      },
    })
    view.render(root)
    await flushMicrotasks()

    view.el.querySelector('.pay-btn')?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()
    assert.equal(payCount, 1)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('prop-driven conditional jsx children rerender to show validation messages while preserving focus', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-prop-jsx-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class PaymentForm extends Component {
          template(props) {
            const {
              passengerName,
              cardNumber,
              expiry,
              onPassengerNameChange,
              onCardNumberChange,
              onExpiryChange
            } = props

            const passengerNameValid = passengerName.trim().length >= 2
            const cardNumberValid = cardNumber.replace(/\\D/g, '').length === 16
            const expiryValid = /^\\d{2}\\/\\d{2}$/.test(expiry)
            const showErrors = passengerName !== '' || cardNumber !== '' || expiry !== ''

            return (
              <div class="payment-form">
                <div class="form-group">
                  <input
                    value={passengerName}
                    input={onPassengerNameChange}
                    type="text"
                    placeholder="Passenger name"
                    class={showErrors && !passengerNameValid ? 'error' : ''}
                  />
                  {showErrors && !passengerNameValid && <span class="error-msg">At least 2 characters</span>}
                </div>
                <div class="form-group">
                  <input
                    value={cardNumber}
                    input={onCardNumberChange}
                    type="text"
                    placeholder="Card number"
                    class={showErrors && !cardNumberValid ? 'error' : ''}
                  />
                </div>
                <div class="form-group">
                  <input
                    value={expiry}
                    input={onExpiryChange}
                    type="text"
                    placeholder="MM/YY"
                    class={showErrors && !expiryValid ? 'error' : ''}
                  />
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/PaymentFormConditionalErrors.jsx',
      'PaymentForm',
      { Component },
    )

    const paymentStore = new Store({
      passengerName: '',
      cardNumber: '',
      expiry: '',
    }) as {
      passengerName: string
      cardNumber: string
      expiry: string
      setPassengerName: (e: Event) => void
      setCardNumber: (e: Event) => void
      setExpiry: (e: Event) => void
    }
    paymentStore.setPassengerName = (e: Event) => {
      const target = e.target as HTMLInputElement
      paymentStore.passengerName = target.value
    }
    paymentStore.setCardNumber = (e: Event) => {
      const target = e.target as HTMLInputElement
      paymentStore.cardNumber = target.value
    }
    paymentStore.setExpiry = (e: Event) => {
      const target = e.target as HTMLInputElement
      paymentStore.expiry = target.value
    }

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import paymentStore from './payment-store.ts'
        import PaymentForm from './PaymentFormConditionalErrors.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent-view">
                <PaymentForm
                  passengerName={paymentStore.passengerName}
                  cardNumber={paymentStore.cardNumber}
                  expiry={paymentStore.expiry}
                  onPassengerNameChange={paymentStore.setPassengerName}
                  onCardNumberChange={paymentStore.setCardNumber}
                  onExpiryChange={paymentStore.setExpiry}
                />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentPaymentFormConditionalErrors.jsx',
      'ParentView',
      { Component, PaymentForm, paymentStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    const input = root.querySelector('input[placeholder="Passenger name"]') as HTMLInputElement | null
    assert.ok(input)

    input.focus()
    input.value = 'A'
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(document.activeElement, root.querySelector('input[placeholder="Passenger name"]'))
    assert.equal(root.querySelector('.error-msg')?.textContent?.trim(), 'At least 2 characters')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('rerender preserves focused input and selection', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-preserve-focus`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    class FocusComponent extends Component {
      constructor(props: any = {}) {
        super(props)
      }

      template(props: { value: string }) {
        return `<div id="${this.id}" class="focus-wrap"><input id="${this.id}-field" value="${props.value}" /></div>`
      }

      __onPropChange() {
        if (this.rendered_) this.__geaRequestRender()
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new FocusComponent({ value: 'abc' })
    view.render(root)
    await flushMicrotasks()

    const input = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(input)
    input!.focus()
    input!.setSelectionRange(1, 2)

    view.__geaUpdateProps({ value: 'abcd' })
    await flushMicrotasks()

    const rerendered = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(rerendered)
    assert.equal((document.activeElement as HTMLElement | null)?.id, `${view.id}-field`)
    assert.equal(rerendered!.selectionStart, 1)
    assert.equal(rerendered!.selectionEnd, 2)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('rerender adjusts caret when formatted value grows before cursor', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-preserve-formatted-caret`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    class FocusComponent extends Component {
      constructor(props: any = {}) {
        super(props)
      }

      template(props: { value: string }) {
        return `<div id="${this.id}" class="focus-wrap"><input id="${this.id}-field" value="${props.value}" /></div>`
      }

      __onPropChange() {
        if (this.rendered_) this.__geaRequestRender()
      }
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new FocusComponent({ value: '42424' })
    view.render(root)
    await flushMicrotasks()

    const input = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(input)
    input!.focus()
    input!.setSelectionRange(5, 5)

    view.__geaUpdateProps({ value: '4242 4' })
    await flushMicrotasks()

    const rerendered = view.el.querySelector('input') as HTMLInputElement | null
    assert.ok(rerendered)
    assert.equal(rerendered!.selectionStart, 6)
    assert.equal(rerendered!.selectionEnd, 6)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('imported mapped table rows rerender selected class in place', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mapped-table-selection`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [], selected: 0 })

    const actions = {
      run() {
        store.data = [
          { id: 1, label: 'one' },
          { id: 2, label: 'two' },
          { id: 3, label: 'three' },
          { id: 4, label: 'four' },
          { id: 5, label: 'five' },
          { id: 6, label: 'six' },
        ]
        store.selected = 0
      },
      select(id: number) {
        store.selected = id
      },
    }

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id} class={store.selected === item.id ? 'danger' : ''}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    actions.run()
    await flushMicrotasks()

    const rowBefore = view.el.querySelector('tbody > tr:nth-of-type(5)')

    assert.equal((rowBefore as any)?.__geaItem?.id, 5)
    assert.equal(view.el.querySelectorAll('tbody > tr.danger').length, 0)

    actions.select(5)
    await flushMicrotasks()

    const rowAfter = view.el.querySelector('tbody > tr:nth-of-type(5)')

    assert.equal((rowAfter as any)?.__geaItem?.id, 5)
    assert.equal(rowAfter?.className, 'danger')
    assert.equal(rowAfter, rowBefore)
    assert.equal(view.el.querySelectorAll('tbody > tr.danger').length, 1)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('keyed mapped tables replace rows by identity on full array updates', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-reconcile`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
    ]
    await flushMicrotasks()

    const firstRowBefore = view.el.querySelector('tbody > tr:first-of-type')
    assert.equal((firstRowBefore as any)?.__geaItem?.id, 1)

    store.data = [
      { id: 3, label: 'three' },
      { id: 4, label: 'four' },
    ]
    await flushMicrotasks()

    const firstRowAfter = view.el.querySelector('tbody > tr:first-of-type')
    assert.equal((firstRowAfter as any)?.__geaItem?.id, 3)
    assert.notEqual(firstRowAfter, firstRowBefore)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('keyed mapped tables move existing rows on swaps', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-swap`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
    ]
    await flushMicrotasks()

    const firstRowBefore = view.el.querySelector('tbody > tr:nth-of-type(1)')
    const thirdRowBefore = view.el.querySelector('tbody > tr:nth-of-type(3)')
    assert.equal((firstRowBefore as any)?.__geaItem?.id, 1)
    assert.equal((thirdRowBefore as any)?.__geaItem?.id, 3)

    const rows = store.data
    const tmp = rows[0]
    rows[0] = rows[2]
    rows[2] = tmp
    await flushMicrotasks()

    const tbodyAfter = view.el.querySelector('tbody')!
    const firstRowAfter = tbodyAfter.children[0] as Element
    const thirdRowAfter = tbodyAfter.children[2] as Element
    assert.equal((firstRowAfter as any)?.__geaItem?.id, 3)
    assert.equal((thirdRowAfter as any)?.__geaItem?.id, 1)
    assert.equal(firstRowAfter, thirdRowBefore)
    assert.equal(thirdRowAfter, firstRowBefore)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('keyed mapped tables clear all rows on full array resets', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-keyed-clear`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/BenchmarkTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
      { id: 3, label: 'three' },
    ]
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('tbody > tr').length, 3)

    store.data = []
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('tbody > tr').length, 0)
    assert.equal(view.el.querySelector('tbody')?.textContent, '')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('unkeyed mapped tables do not emit key attributes', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-unkeyed-attrs`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ data: [] as Array<{ id: number; label: string }> })

    const BenchmarkTable = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class BenchmarkTable extends Component {
          template() {
            return (
              <table>
                <tbody id="tbody">
                  {store.data.map(item => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }
      `,
      '/virtual/UnkeyedTable.jsx',
      'BenchmarkTable',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BenchmarkTable()
    view.render(root)

    store.data = [{ id: 1, label: 'one' }]
    await flushMicrotasks()

    const row = view.el.querySelector('tbody > tr')
    assert.equal(row?.hasAttribute('key'), false)
    assert.equal(row?.hasAttribute('data-gea-item-id'), true)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

for (const keyed of [true]) {
  test(`local state mapped benchmark table renders rows after array assignment (${keyed ? 'keyed' : 'non-keyed'})`, async () => {
    const restoreDom = installDom()

    try {
      const seed = `runtime-${Date.now()}-local-table-${keyed ? 'keyed' : 'non-keyed'}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const BenchmarkTable = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          export default class BenchmarkTable extends Component {
            data = []
            selected = 0

            run() {
              this.data = Array.from({ length: 1000 }, (_, index) => ({
                id: index + 1,
                label: \`row-\${index + 1}\`
              }))
            }

            template() {
              return (
                <table>
                  <tbody id="tbody">
                    {this.data.map(item => (
                      <tr${keyed ? ' key={item.id}' : ''} class={this.selected === item.id ? 'danger' : ''}>
                        <td class="col-md-1">{item.id}</td>
                        <td class="col-md-4">
                          <a>{item.label}</a>
                        </td>
                        <td class="col-md-1">
                          <a>
                            <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                          </a>
                        </td>
                        <td class="col-md-6"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          }
        `,
        `/virtual/LocalBenchmarkTable-${keyed ? 'keyed' : 'non-keyed'}.jsx`,
        'BenchmarkTable',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const view = new BenchmarkTable()
      view.render(root)
      view.run()
      await flushMicrotasks()

      assert.equal(view.el.querySelectorAll('tbody > tr').length, 1000)
      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(1) > td:nth-of-type(1)')?.textContent?.trim(), '1')
      assert.equal(
        view.el.querySelector('tbody > tr:nth-of-type(1000) > td:nth-of-type(2) > a')?.textContent?.trim(),
        'row-1000',
      )

      view.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
}

for (const keyed of [true]) {
  test(`local state mapped rows update selected class in place (${keyed ? 'keyed' : 'non-keyed'})`, async () => {
    const restoreDom = installDom()

    try {
      const seed = `runtime-${Date.now()}-local-select-${keyed ? 'keyed' : 'non-keyed'}`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const BenchmarkTable = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          export default class BenchmarkTable extends Component {
            data = [
              { id: 1, label: 'one' },
              { id: 2, label: 'two' },
              { id: 3, label: 'three' },
              { id: 4, label: 'four' },
              { id: 5, label: 'five' }
            ]
            selected = 0

            select(id) {
              this.selected = id
            }

            template() {
              return (
                <table>
                  <tbody id="tbody">
                    {this.data.map(item => (
                      <tr${keyed ? ' key={item.id}' : ''} class={this.selected === item.id ? 'danger' : ''}>
                        <td>{item.id}</td>
                        <td>{item.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          }
        `,
        `/virtual/LocalSelectTable-${keyed ? 'keyed' : 'non-keyed'}.jsx`,
        'BenchmarkTable',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const view = new BenchmarkTable()
      view.render(root)

      const rowBefore = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal(rowBefore?.className, '')

      view.select(5)
      await flushMicrotasks()

      const rowAfter = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal(rowAfter?.className, 'danger')
      assert.equal(rowAfter, rowBefore)

      view.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
}

for (const keyed of [true]) {
  test(`local state mapped rows keep event item refs after full replacement (${keyed ? 'keyed' : 'non-keyed'})`, async () => {
    const restoreDom = installDom()

    try {
      const seed = `runtime-${Date.now()}-local-${keyed ? 'keyed' : 'non-keyed'}-events`
      const [{ default: Component }] = await loadRuntimeModules(seed)

      const BenchmarkTable = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          export default class BenchmarkTable extends Component {
            data = []
            selected = 0

            run() {
              this.data = Array.from({ length: 10 }, (_, index) => ({
                id: index + 1,
                label: \`row-\${index + 1}\`
              }))
            }

            select(id) {
              this.selected = id
            }

            remove(id) {
              const index = this.data.findIndex(item => item.id === id)
              if (index >= 0) this.data.splice(index, 1)
            }

            template() {
              return (
                <table>
                  <tbody id="tbody">
                    {this.data.map(item => (
                      <tr${keyed ? ' key={item.id}' : ''} class={this.selected === item.id ? 'danger' : ''}>
                        <td>{item.id}</td>
                        <td>
                          <a class="select-link" click={() => this.select(item.id)}>{item.label}</a>
                        </td>
                        <td>
                          <a class="remove-link" click={() => this.remove(item.id)}>
                            <span>x</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          }
        `,
        `/virtual/Local${keyed ? 'Keyed' : 'NonKeyed'}Events.jsx`,
        'BenchmarkTable',
        { Component },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)

      const view = new BenchmarkTable()
      view.render(root)
      view.run()
      await flushMicrotasks()

      const selectLink = view.el.querySelector('tbody > tr:nth-of-type(5) .select-link') as HTMLElement
      const selectedRowBefore = view.el.querySelector('tbody > tr:nth-of-type(5)')
      assert.equal(selectedRowBefore?.getAttribute('data-gea-item-id'), '5')
      selectLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flushMicrotasks()

      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(5)')?.className, 'danger')
      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(5)')?.getAttribute('data-gea-item-id'), '5')

      const removeLink = view.el.querySelector('tbody > tr:nth-of-type(9) .remove-link') as HTMLElement
      removeLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flushMicrotasks()

      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(9) > td:nth-of-type(1)')?.textContent?.trim(), '10')
      assert.equal(view.el.querySelector('tbody > tr:nth-of-type(9)')?.getAttribute('data-gea-item-id'), '10')

      view.dispose()
      await flushMicrotasks()
    } finally {
      restoreDom()
    }
  })
}

test('input in form with conditional error spans does not rerender when condition is stable', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-stable-conditional-input`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const PaymentForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default function PaymentForm({
          passengerName, cardNumber, expiry,
          onPassengerNameChange, onCardNumberChange, onExpiryChange
        }) {
          const passengerNameValid = passengerName.trim().length >= 2
          const cardNumberValid = cardNumber.replace(/\\D/g, '').length === 16
          const expiryValid = /^\\d{2}\\/\\d{2}$/.test(expiry)
          const showErrors = passengerName !== '' || cardNumber !== '' || expiry !== ''

          return (
            <div class="payment-form">
              <div class="form-group">
                <input
                  value={passengerName}
                  input={onPassengerNameChange}
                  type="text"
                  placeholder="Passenger name"
                  class={showErrors && !passengerNameValid ? 'error' : ''}
                />
                {showErrors && !passengerNameValid && <span class="error-msg name-error">At least 2 characters</span>}
              </div>
              <div class="form-group">
                <input
                  value={cardNumber}
                  input={onCardNumberChange}
                  type="text"
                  placeholder="Card number"
                  class={showErrors && !cardNumberValid ? 'error' : ''}
                />
                {showErrors && !cardNumberValid && <span class="error-msg card-error">16 digits required</span>}
              </div>
              <div class="form-group">
                <input
                  value={expiry}
                  input={onExpiryChange}
                  type="text"
                  placeholder="MM/YY"
                  class={showErrors && !expiryValid ? 'error' : ''}
                />
                {showErrors && !expiryValid && <span class="error-msg expiry-error">Format: MM/YY</span>}
              </div>
            </div>
          )
        }
      `,
      '/virtual/StableCondPaymentForm.jsx',
      'PaymentForm',
      { Component },
    )

    const paymentStore = new Store({
      passengerName: '',
      cardNumber: '',
      expiry: '',
    }) as {
      passengerName: string
      cardNumber: string
      expiry: string
    }

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import paymentStore from './payment-store.ts'
        import PaymentForm from './PaymentForm.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent-view">
                <PaymentForm
                  passengerName={paymentStore.passengerName}
                  cardNumber={paymentStore.cardNumber}
                  expiry={paymentStore.expiry}
                  onPassengerNameChange={e => { paymentStore.passengerName = e.target.value }}
                  onCardNumberChange={e => { paymentStore.cardNumber = e.target.value }}
                  onExpiryChange={e => { paymentStore.expiry = e.target.value }}
                />
              </div>
            )
          }
        }
      `,
      '/virtual/StableCondParentView.jsx',
      'ParentView',
      { Component, PaymentForm, paymentStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    const paymentFormChild = (view as any)._paymentForm
    assert.ok(paymentFormChild, 'PaymentForm child must exist')

    // Type "A" — showErrors flips false→true, passengerNameValid is false
    // All three error conditions flip: [false,false,false] → [true,true,true]
    // A rerender is expected here (first condition change)
    paymentStore.passengerName = 'A'
    await flushMicrotasks()

    assert.ok(root.querySelector('.name-error'), 'name error should appear')
    assert.ok(root.querySelector('.card-error'), 'card error should appear')
    assert.ok(root.querySelector('.expiry-error'), 'expiry error should appear')

    // Now install spies AFTER the initial condition flip
    let formRerenders = 0
    const origRender = paymentFormChild.__geaRequestRender.bind(paymentFormChild)
    paymentFormChild.__geaRequestRender = () => {
      formRerenders++
      return origRender()
    }

    let parentRerenders = 0
    const origParentRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      parentRerenders++
      return origParentRender()
    }

    const formElBefore = paymentFormChild.el

    // Type "A" → "B" (single char, still invalid, conditions remain [true,true,true])
    paymentStore.passengerName = 'B'
    await flushMicrotasks()

    assert.equal(formRerenders, 0, `PaymentForm must NOT rerender when conditions are stable (got ${formRerenders})`)
    assert.equal(parentRerenders, 0, `ParentView must NOT rerender (got ${parentRerenders})`)
    assert.equal(paymentFormChild.el, formElBefore, 'PaymentForm DOM element must be the same object')
    assert.ok(root.querySelector('.name-error'), 'name error should persist')
    assert.equal((root.querySelector('input[placeholder="Passenger name"]') as HTMLInputElement)?.value, 'B')

    // Type "B" → "C" (another single char, still invalid, same stable conditions)
    formRerenders = 0
    paymentStore.passengerName = 'C'
    await flushMicrotasks()

    assert.equal(formRerenders, 0, `PaymentForm must NOT rerender on third stable keystroke (got ${formRerenders})`)
    assert.equal(paymentFormChild.el, formElBefore, 'PaymentForm DOM element must remain the same')

    // Now type a valid name "CD" — passengerNameValid flips to true
    // Condition 0 flips: true→false. DOM patching removes the error span without a full rerender.
    formRerenders = 0
    paymentStore.passengerName = 'CD'
    await flushMicrotasks()

    assert.equal(
      formRerenders,
      0,
      `PaymentForm should NOT rerender — conditional DOM patching handles the flip (got ${formRerenders})`,
    )
    assert.equal(root.querySelector('.name-error'), null, 'name error should disappear when name becomes valid')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('getter-derived child component list preserves container on add (todo-app pattern)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-getter-child-component-list`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      todos: [] as Array<{ id: number; text: string; done: boolean }>,
      draft: '',
      filter: 'all' as 'all' | 'active' | 'completed',
      nextId: 1,
    }) as InstanceType<typeof Store> & {
      add: (text: string) => void
      filteredTodos: Array<{ id: number; text: string; done: boolean }>
      activeCount: number
    }

    Object.defineProperty(store, 'filteredTodos', {
      get() {
        const { todos, filter } = store
        if (filter === 'active') return todos.filter((t) => !t.done)
        if (filter === 'completed') return todos.filter((t) => t.done)
        return todos
      },
    })

    Object.defineProperty(store, 'activeCount', {
      get() {
        return store.todos.filter((t) => !t.done).length
      },
    })

    store.add = (text: string) => {
      store.todos = [...store.todos, { id: store.nextId++, text, done: false }]
    }

    const TodoItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoItem extends Component {
          template({ todo, onToggle, onRemove }) {
            return (
              <li class={\`todo-item \${todo.done ? 'done' : ''}\`}>
                <input type="checkbox" checked={todo.done} change={onToggle} />
                <span class="todo-text">{todo.text}</span>
                <button class="todo-remove" click={onRemove}>x</button>
              </li>
            )
          }
        }
      `,
      '/virtual/TodoItem.jsx',
      'TodoItem',
      { Component },
    )

    const TodoFilters = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoFilters extends Component {
          template({ activeCount }) {
            return <div class="todo-filters"><span class="count">{activeCount} items left</span></div>
          }
        }
      `,
      '/virtual/TodoFilters.jsx',
      'TodoFilters',
      { Component },
    )

    const TodoApp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './todo-store.ts'
        import TodoItem from './TodoItem.jsx'
        import TodoFilters from './TodoFilters.jsx'

        export default class TodoApp extends Component {
          template() {
            const { filteredTodos, activeCount } = store
            return (
              <div class="todo-app">
                <h1>Todo</h1>
                <ul class="todo-list">
                  {filteredTodos.map(todo => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={() => {}}
                      onRemove={() => {}}
                    />
                  ))}
                </ul>
                {store.todos.length > 0 && (
                  <TodoFilters activeCount={activeCount} />
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/TodoApp.jsx',
      'TodoApp',
      { Component, store, TodoItem, TodoFilters },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoApp()
    view.render(root)
    await flushMicrotasks()

    let parentRerenders = 0
    const originalRerender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      parentRerenders++
      return originalRerender()
    }

    const listBefore = view.el.querySelector('.todo-list') as HTMLElement | null
    assert.ok(listBefore, 'todo-list should exist')
    assert.equal(view.el.querySelectorAll('.todo-item').length, 0)
    assert.equal(view.el.querySelector('.todo-filters'), null, 'filters hidden when empty')

    store.add('first')
    await flushMicrotasks()

    const listAfterFirst = view.el.querySelector('.todo-list') as HTMLElement | null
    assert.equal(parentRerenders, 0, 'first add must NOT call parent __geaRequestRender')
    assert.equal(listAfterFirst, listBefore, 'todo-list container must be preserved on first add')
    assert.equal(view.el.querySelectorAll('.todo-item').length, 1)
    assert.match(view.el.textContent || '', /first/)

    const firstItemEl = view.el.querySelector('.todo-item') as HTMLElement | null
    assert.ok(firstItemEl, 'first todo-item should exist')

    store.add('second')
    await flushMicrotasks()

    const listAfterSecond = view.el.querySelector('.todo-list') as HTMLElement | null
    assert.equal(parentRerenders, 0, 'second add must NOT call parent __geaRequestRender')
    assert.equal(listAfterSecond, listBefore, 'todo-list container must be preserved on second add')
    assert.equal(view.el.querySelectorAll('.todo-item').length, 2)
    assert.match(view.el.textContent || '', /second/)

    const firstItemElAfter = view.el.querySelector('.todo-item') as HTMLElement | null
    assert.equal(
      firstItemElAfter,
      firstItemEl,
      'first todo-item DOM must be preserved when adding second (no full list redraw)',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store-dependent class binding on root element patches without full rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-store-class-no-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ highlightedId: null as string | null })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ id, title }) {
            const isHighlighted = store.highlightedId === id
            return (
              <div class={\`column \${isHighlighted ? 'highlighted' : ''}\`}>
                <h2>{title}</h2>
                <p>Static content</p>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MyColumn({ id: 'col1', title: 'Column One' })
    view.render(root)

    const elBefore = view.el
    const h2Before = view.el.querySelector('h2')
    assert.ok(elBefore)
    assert.ok(h2Before)
    assert.match(elBefore.className, /column/)
    assert.doesNotMatch(elBefore.className, /highlighted/)

    store.highlightedId = 'col1'
    await flushMicrotasks()

    assert.match(view.el.className, /highlighted/)
    assert.equal(view.el, elBefore, 'root element must be preserved (no full rerender)')
    assert.equal(view.el.querySelector('h2'), h2Before, 'child h2 must be preserved')

    store.highlightedId = 'col2'
    await flushMicrotasks()

    assert.doesNotMatch(view.el.className, /highlighted/)
    assert.equal(view.el, elBefore, 'root element must still be preserved after un-highlighting')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store-dependent class in unresolved map patches items without full list rebuild', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-unresolved-map-class-patch`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({ activeId: null as string | null })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ items }) {
            return (
              <div class="column">
                <div class="body">
                  {items.map(item => (
                    <div key={item} class={\`card \${store.activeId === item ? 'active' : ''}\`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MyColumn({ items: ['a', 'b', 'c'] })
    view.render(root)

    const cards = view.el.querySelectorAll('.body > div')
    assert.equal(cards.length, 3)

    const cardA = cards[0]
    const cardB = cards[1]
    const cardC = cards[2]
    assert.ok(cardA)
    assert.ok(cardB)
    assert.ok(cardC)

    store.activeId = 'b'
    await flushMicrotasks()

    const cardsAfter = view.el.querySelectorAll('.body > div')
    assert.equal(cardsAfter.length, 3)
    assert.equal(cardsAfter[0], cardA, 'first card DOM should be preserved')
    assert.equal(cardsAfter[1], cardB, 'second card DOM should be preserved')
    assert.equal(cardsAfter[2], cardC, 'third card DOM should be preserved')
    assert.match(cardsAfter[1].className, /active/)

    store.activeId = null
    await flushMicrotasks()

    const cardsAfter2 = view.el.querySelectorAll('.body > div')
    assert.equal(cardsAfter2.length, 3)
    assert.equal(cardsAfter2[0], cardA, 'first card DOM still preserved after deactivation')
    assert.doesNotMatch(cardsAfter2[1].className, /active/)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('unresolved map rebuilds when parent mutates prop array in-place and calls __geaUpdateProps (drop scenario)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-drop-inplace-mutation`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      tasks: { t1: { id: 't1', title: 'A' }, t2: { id: 't2', title: 'B' }, t3: { id: 't3', title: 'C' } } as Record<
        string,
        any
      >,
    })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ column }) {
            const taskIds = column.taskIds
            return (
              <div class="column">
                <div class="body">
                  {taskIds.map(taskId =>
                    store.tasks[taskId] ? (
                      <div key={taskId} class="card">{store.tasks[taskId].title}</div>
                    ) : null
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const colA = { id: 'col-a', title: 'From', taskIds: ['t1', 't2'] }
    const colB = { id: 'col-b', title: 'To', taskIds: ['t3'] }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const viewA = new MyColumn({ column: colA })
    viewA.render(root)
    const viewB = new MyColumn({ column: colB })
    viewB.render(root)

    await flushMicrotasks()

    const cardsA1 = viewA.el.querySelectorAll('.body .card')
    const cardsB1 = viewB.el.querySelectorAll('.body .card')
    assert.equal(cardsA1.length, 2, 'column A starts with 2 cards')
    assert.equal(cardsB1.length, 1, 'column B starts with 1 card')

    const idx = colA.taskIds.indexOf('t2')
    colA.taskIds.splice(idx, 1)
    colB.taskIds.push('t2')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    await flushMicrotasks()

    const cardsA2 = viewA.el.querySelectorAll('.body .card')
    const cardsB2 = viewB.el.querySelectorAll('.body .card')
    assert.equal(cardsA2.length, 1, 'column A should have 1 card after move')
    assert.equal(cardsB2.length, 2, 'column B should have 2 cards after move')
    assert.equal(cardsA2[0].textContent, 'A', 'remaining card in A is t1')
    assert.equal(cardsB2[1].textContent, 'B', 'moved card in B is t2')

    viewA.dispose()
    viewB.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional slot with early-return guard does not crash constructor when store value is null', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-early-return-cond`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const dataStore = new Store({
      item: null as { description: string } | null,
    }) as { item: { description: string } | null }

    const DetailView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import dataStore from './data-store'

        export default class DetailView extends Component {
          isEditing = false

          template() {
            const { item } = dataStore

            if (!item) return <div class="loader">Loading</div>

            const desc = item.description || ''

            return (
              <div class="detail">
                {this.isEditing && <textarea value={desc} />}
                {!this.isEditing && desc && <p class="desc">{desc}</p>}
                {!this.isEditing && !desc && <p class="placeholder">Add description</p>}
              </div>
            )
          }
        }
      `,
      '/virtual/DetailView.jsx',
      'DetailView',
      { Component, dataStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    assert.doesNotThrow(
      () => new DetailView(),
      'constructing a component with null store data and an early-return guard must not throw',
    )

    const view = new DetailView()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.textContent?.includes('Loading'), 'should show loader when item is null')

    view.dispose()
    dataStore.item = null
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store-controlled conditional slot patches without full rerender; branch-only store keys skip rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-store`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const formStore = new Store({
      activeColumnId: null as string | null,
      draftTitle: '',
    }) as {
      activeColumnId: string | null
      draftTitle: string
    }

    const KanbanColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import formStore from './form-store'

        export default class KanbanColumn extends Component {
          template({ column }) {
            const isAdding = formStore.activeColumnId === column.id
            return (
              <div class="col">
                <div class="header">{column.title}</div>
                {isAdding ? (
                  <div class="add-form">
                    <input type="text" value={formStore.draftTitle} />
                  </div>
                ) : (
                  <button class="add-btn">Add task</button>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/KanbanColumn.jsx',
      'KanbanColumn',
      { Component, formStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new KanbanColumn({ column: { id: 'col-1', title: 'Backlog' } })
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-btn'), 'initially shows add button')
    assert.ok(!view.el.querySelector('.add-form'), 'initially no add form')

    let rerenderCount = 0
    const origRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      rerenderCount++
      return origRender()
    }

    // Toggle conditional slot by changing activeColumnId
    formStore.activeColumnId = 'col-1'
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-form'), 'add form should appear after store change')
    assert.ok(!view.el.querySelector('.add-btn'), 'add button should be gone')
    assert.equal(rerenderCount, 0, 'toggling conditional slot via store should NOT trigger full rerender')

    // Type into draft — branch-only store key should not cause rerender
    formStore.draftTitle = 'New task'
    await flushMicrotasks()
    assert.equal(rerenderCount, 0, 'changing draftTitle (branch-only store key) should NOT trigger full rerender')

    // Toggle back
    formStore.activeColumnId = null
    await flushMicrotasks()
    assert.ok(view.el.querySelector('.add-btn'), 'add button should reappear')
    assert.ok(!view.el.querySelector('.add-form'), 'add form should be gone')
    assert.equal(rerenderCount, 0, 'toggling slot back should NOT trigger full rerender')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('map item event handler resolves item on initial render before any list rebuild', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-map-event-initial-render`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      tasks: {
        t1: { id: 't1', title: 'Task A' },
        t2: { id: 't2', title: 'Task B' },
      } as Record<string, any>,
    })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ column }) {
            const taskIds = column.taskIds
            return (
              <div class="column">
                <div class="body">
                  {taskIds.map(taskId =>
                    store.tasks[taskId] ? (
                      <div
                        key={taskId}
                        class="card"
                        draggable="true"
                        dragstart={(e) => {
                          if (e.dataTransfer) {
                            e.dataTransfer.setData('text/plain', taskId)
                          }
                        }}
                        click={() => store.__clicked = taskId}
                      >
                        {store.tasks[taskId].title}
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new MyColumn({ column: { id: 'col-1', title: 'Backlog', taskIds: ['t1', 't2'] } })
    view.render(root)
    await flushMicrotasks()

    const cards = view.el.querySelectorAll('.card')
    assert.equal(cards.length, 2, 'should render 2 cards')

    assert.ok(!(cards[0] as any).__geaItem, 'initial render DOM elements should NOT have __geaItem set')

    const helperName = Object.getOwnPropertyNames(Object.getPrototypeOf(view)).find((n: string) =>
      n.startsWith('__getMapItemFromEvent'),
    )
    assert.ok(helperName, 'compiled component should have a __getMapItemFromEvent helper')
    const fakeEvent = { target: cards[0] }
    const resolved = (view as any)[helperName!](fakeEvent)
    assert.ok(resolved, 'helper should resolve a non-null value on initial render')
    assert.equal(String(resolved), 't1', 'helper should resolve to the item ID string')

    const fakeEvent2 = { target: cards[1] }
    const resolved2 = (view as any)[helperName!](fakeEvent2)
    assert.ok(resolved2, 'helper should resolve second item')
    assert.equal(String(resolved2), 't2', 'helper should resolve to t2')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('drop scenario: move task between columns uses incremental DOM updates with zero full rebuilds', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-drop-zero-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      tasks: {
        t1: { id: 't1', title: 'Task A' },
        t2: { id: 't2', title: 'Task B' },
        t3: { id: 't3', title: 'Task C' },
        t4: { id: 't4', title: 'Task D' },
      } as Record<string, any>,
    })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ column }) {
            const taskIds = column.taskIds
            return (
              <div class="column">
                <div class="header">{column.title}</div>
                <div class="body">
                  {taskIds.map(taskId =>
                    store.tasks[taskId] ? (
                      <div key={taskId} class="card">{store.tasks[taskId].title}</div>
                    ) : null
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const colA = { id: 'col-a', title: 'Backlog', taskIds: ['t1', 't2', 't3'] }
    const colB = { id: 'col-b', title: 'In Progress', taskIds: ['t4'] }
    const colC = { id: 'col-c', title: 'Done', taskIds: [] as string[] }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const viewA = new MyColumn({ column: colA })
    viewA.render(root)
    const viewB = new MyColumn({ column: colB })
    viewB.render(root)
    const viewC = new MyColumn({ column: colC })
    viewC.render(root)

    await flushMicrotasks()

    const bodyA = viewA.el.querySelector('.body')!
    const bodyB = viewB.el.querySelector('.body')!
    const bodyC = viewC.el.querySelector('.body')!

    assert.equal(bodyA.querySelectorAll('.card').length, 3, 'column A starts with 3 cards')
    assert.equal(bodyB.querySelectorAll('.card').length, 1, 'column B starts with 1 card')
    assert.equal(bodyC.querySelectorAll('.card').length, 0, 'column C starts empty')

    const origCardA0 = bodyA.querySelector('.card')!
    const origCardA2 = bodyA.querySelectorAll('.card')[2]!
    const origCardB0 = bodyB.querySelector('.card')!

    assert.equal(origCardA0.textContent, 'Task A')
    assert.equal(origCardA2.textContent, 'Task C')
    assert.equal(origCardB0.textContent, 'Task D')

    // --- Move t2 from A to B (splice from middle, push to end) ---
    const idx = colA.taskIds.indexOf('t2')
    colA.taskIds.splice(idx, 1)
    colB.taskIds.push('t2')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    viewC.__geaUpdateProps({ column: colC })
    await flushMicrotasks()

    const cardsA = bodyA.querySelectorAll('.card')
    const cardsB = bodyB.querySelectorAll('.card')
    assert.equal(cardsA.length, 2, 'column A has 2 cards after move')
    assert.equal(cardsB.length, 2, 'column B has 2 cards after move')
    assert.equal(cardsA[0].textContent, 'Task A', 'A: first card is t1')
    assert.equal(cardsA[1].textContent, 'Task C', 'A: second card is t3')
    assert.equal(cardsB[0].textContent, 'Task D', 'B: first card is t4')
    assert.equal(cardsB[1].textContent, 'Task B', 'B: second card is t2 (moved)')

    assert.equal(cardsA[0], origCardA0, 'A: t1 card is the SAME DOM node (not recreated)')
    assert.equal(cardsA[1], origCardA2, 'A: t3 card is the SAME DOM node (not recreated)')
    assert.equal(cardsB[0], origCardB0, 'B: t4 card is the SAME DOM node (not recreated)')

    assert.equal(bodyC.querySelectorAll('.card').length, 0, 'C: still empty, unaffected')

    // --- Move t3 from A to C (first move into empty column) ---
    const idx2 = colA.taskIds.indexOf('t3')
    colA.taskIds.splice(idx2, 1)
    colC.taskIds.push('t3')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    viewC.__geaUpdateProps({ column: colC })
    await flushMicrotasks()

    const cardsA2 = bodyA.querySelectorAll('.card')
    const cardsC2 = bodyC.querySelectorAll('.card')
    assert.equal(cardsA2.length, 1, 'column A has 1 card')
    assert.equal(cardsC2.length, 1, 'column C has 1 card')
    assert.equal(cardsA2[0].textContent, 'Task A')
    assert.equal(cardsC2[0].textContent, 'Task C')

    assert.equal(cardsA2[0], origCardA0, 'A: t1 card still the SAME DOM node after second move')

    const cardsB2 = bodyB.querySelectorAll('.card')
    assert.equal(cardsB2[0], origCardB0, 'B: t4 card still the SAME DOM node after second move')

    // --- Move t4 from B to A (moves card back, column B loses its only card) ---
    const idx3 = colB.taskIds.indexOf('t4')
    colB.taskIds.splice(idx3, 1)
    colA.taskIds.push('t4')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    viewC.__geaUpdateProps({ column: colC })
    await flushMicrotasks()

    const cardsA3 = bodyA.querySelectorAll('.card')
    const cardsB3 = bodyB.querySelectorAll('.card')
    const cardsC3 = bodyC.querySelectorAll('.card')
    assert.equal(cardsA3.length, 2, 'A has 2 cards after receiving t4')
    assert.equal(cardsB3.length, 1, 'B has 1 card (only t2 remains)')
    assert.equal(cardsC3.length, 1, 'C still has 1 card')

    assert.equal(cardsA3[0].textContent, 'Task A')
    assert.equal(cardsA3[1].textContent, 'Task D')
    assert.equal(cardsB3[0].textContent, 'Task B')

    assert.equal(cardsA3[0], origCardA0, 'A: t1 card STILL the same DOM node through all moves')

    // --- No-op: update props without any array change ---
    const headerA = viewA.el.querySelector('.header')!
    const headerTextBefore = headerA.textContent
    viewA.__geaUpdateProps({ column: colA })
    await flushMicrotasks()

    const cardsA4 = bodyA.querySelectorAll('.card')
    assert.equal(cardsA4.length, 2, 'A still has 2 cards after no-op update')
    assert.equal(cardsA4[0], origCardA0, 'A: t1 card unchanged after no-op')
    assert.equal(headerA.textContent, headerTextBefore, 'header text unchanged')

    viewA.dispose()
    viewB.dispose()
    viewC.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('local state attribute bindings and conditional slot patch without full rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `local-state-attrs-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const CopyButton = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CopyButton extends Component {
          copied = false

          doCopy() {
            this.copied = true
          }

          resetCopy() {
            this.copied = false
          }

          template() {
            const copied = this.copied
            return (
              <div class="wrapper">
                <button
                  class={\`copy-btn\${copied ? ' copied' : ''}\`}
                  title={copied ? 'Copied!' : 'Copy'}
                  click={() => this.doCopy()}
                >
                  <svg viewBox="0 0 24 24">
                    {copied ? (
                      <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="green" />
                    ) : (
                      <path d="M16 1H6v12h2V3h8zm3 4H10v14h9V5z" fill="gray" />
                    )}
                  </svg>
                </button>
              </div>
            )
          }
        }
      `,
      '/virtual/CopyButton.jsx',
      'CopyButton',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new CopyButton()
    view.render(root)
    await flushMicrotasks()

    let rerenders = 0
    const origRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      rerenders++
      return origRender()
    }

    const btn = root.querySelector('button') as HTMLElement
    assert.ok(btn, 'button exists')
    assert.equal(btn.className, 'copy-btn', 'initial class has no "copied"')
    assert.equal(btn.getAttribute('title'), 'Copy', 'initial title is "Copy"')

    const svgPath = root.querySelector('svg path') as SVGPathElement
    assert.ok(svgPath, 'svg path exists')
    assert.equal(svgPath.getAttribute('fill'), 'gray', 'initial icon is gray')

    const btnRef = btn
    const wrapperRef = root.querySelector('.wrapper') as HTMLElement

    view.doCopy()
    await flushMicrotasks()

    assert.equal(rerenders, 0, 'no full rerender after state change')
    assert.equal(btn.className, 'copy-btn copied', 'class updated to include "copied"')
    assert.equal(btn.getAttribute('title'), 'Copied!', 'title updated to "Copied!"')

    const svgPathAfter = root.querySelector('svg path') as SVGPathElement
    assert.ok(svgPathAfter, 'svg path still exists after state change')
    assert.equal(svgPathAfter.getAttribute('fill'), 'green', 'icon switched to green checkmark')

    assert.equal(root.querySelector('button'), btnRef, 'button DOM node preserved')
    assert.equal(root.querySelector('.wrapper'), wrapperRef, 'wrapper DOM node preserved')

    view.resetCopy()
    await flushMicrotasks()

    assert.equal(rerenders, 0, 'no full rerender after resetting state')
    assert.equal(btn.className, 'copy-btn', 'class back to no "copied"')
    assert.equal(btn.getAttribute('title'), 'Copy', 'title back to "Copy"')

    const svgPathReset = root.querySelector('svg path') as SVGPathElement
    assert.equal(svgPathReset.getAttribute('fill'), 'gray', 'icon back to gray')
    assert.equal(root.querySelector('button'), btnRef, 'button still same DOM node')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('__onPropChange does not crash when an object prop becomes null', async () => {
  const restoreDom = installDom()

  try {
    const seed = `null-prop-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const BoardingCard = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class BoardingCard extends Component {
          copied = false

          doCopy() { this.copied = true }
          resetCopy() { this.copied = false }

          template({ pass }) {
            const copied = this.copied
            return (
              <div class="card">
                <span class="route">{pass.departure} → {pass.arrival}</span>
                <span class="code">{pass.confirmationCode}</span>
                <span class="pax">{pass.passengerName}</span>
                <button class={copied ? 'btn copied' : 'btn'}>
                  <svg viewBox="0 0 24 24">
                    {copied ? (
                      <path d="M9 16L5 12l-1 1L9 19 21 7l-1-1z" fill="green" />
                    ) : (
                      <path d="M16 1H6v12h2V3h8zm3 4H10v14h9V5z" fill="gray" />
                    )}
                  </svg>
                </button>
              </div>
            )
          }
        }
      `,
      '/virtual/BoardingCard.jsx',
      'BoardingCard',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new BoardingCard()
    view.props = { pass: { departure: 'IST', arrival: 'JFK', confirmationCode: 'ABC123', passengerName: 'Jane' } }
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelector('.route')!.textContent!.trim(), 'IST → JFK')
    assert.equal(root.querySelector('.code')!.textContent, 'ABC123')
    assert.equal(root.querySelector('.pax')!.textContent, 'Jane')

    assert.doesNotThrow(() => {
      view.__geaUpdateProps({ pass: null })
    }, 'setting object prop to null must not throw')

    assert.equal(
      root.querySelector('.route')!.textContent!.trim(),
      'IST → JFK',
      'DOM stays unchanged when prop becomes null',
    )

    assert.doesNotThrow(() => {
      view.__geaUpdateProps({
        pass: { departure: 'LAX', arrival: 'ORD', confirmationCode: 'XYZ', passengerName: 'Bob' },
      })
    }, 'restoring prop must not throw')
    assert.equal(root.querySelector('.route')!.textContent!.trim(), 'LAX → ORD', 'DOM updates when prop is restored')
    assert.equal(root.querySelector('.pax')!.textContent, 'Bob')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('store getter props produce surgical DOM patches without full rerender', async () => {
  const restoreDom = installDom()
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-surgical-'))

  try {
    const seed = `runtime-${Date.now()}-getter-surgical`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    await writeFile(
      join(dir, 'todo-store.ts'),
      `import { Store } from '@geajs/core'
export default class TodoStore extends Store {
  todos = [] as Array<{ id: number; text: string; done: boolean }>
  draft = ''
  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
  get completedCount(): number {
    return this.todos.filter(t => t.done).length
  }
}`,
    )

    const store = new Store({
      todos: [] as Array<{ id: number; text: string; done: boolean }>,
      draft: '',
    }) as any

    Object.defineProperty(store, 'activeCount', {
      get() {
        return store.todos.filter((t: any) => !t.done).length
      },
    })
    Object.defineProperty(store, 'completedCount', {
      get() {
        return store.todos.filter((t: any) => t.done).length
      },
    })

    const TodoFilters = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoFilters extends Component {
          template({ activeCount, completedCount }) {
            return (
              <div class="todo-filters">
                <span class="active-count">{activeCount} items left</span>
                <span class="completed-count">{completedCount} completed</span>
              </div>
            )
          }
        }
      `,
      join(dir, 'TodoFilters.jsx'),
      'TodoFilters',
      { Component },
    )

    const TodoApp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store'
        import TodoFilters from './TodoFilters'

        export default class TodoApp extends Component {
          template() {
            const { activeCount, completedCount } = todoStore
            return (
              <div class="todo-app">
                <TodoFilters activeCount={activeCount} completedCount={completedCount} />
              </div>
            )
          }
        }
      `,
      join(dir, 'TodoApp.jsx'),
      'TodoApp',
      { Component, todoStore: store, TodoFilters },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TodoApp()
    view.render(root)
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /0 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /0 completed/)

    let parentRerenders = 0
    const origParentRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      parentRerenders++
      return origParentRender()
    }

    const filtersChild = view._todoFilters
    assert.ok(filtersChild, 'TodoFilters child must exist after render')
    let childRerenders = 0
    const origChildRender = filtersChild.__geaRequestRender.bind(filtersChild)
    filtersChild.__geaRequestRender = () => {
      childRerenders++
      return origChildRender()
    }

    const filtersElBefore = root.querySelector('.todo-filters')
    assert.ok(filtersElBefore, 'todo-filters element should exist')

    store.todos = [
      { id: 1, text: 'buy milk', done: false },
      { id: 2, text: 'walk dog', done: true },
    ]
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /1 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /1 completed/)

    assert.equal(parentRerenders, 0, 'parent must NOT call __geaRequestRender')
    assert.equal(childRerenders, 0, 'child must NOT call __geaRequestRender (should use surgical prop patches)')

    const filtersElAfter = root.querySelector('.todo-filters')
    assert.equal(filtersElAfter, filtersElBefore, 'TodoFilters DOM element must be the same object (not replaced)')

    parentRerenders = 0
    childRerenders = 0
    store.todos = store.todos.map((t: any) => (t.id === 1 ? { ...t, done: true } : t))
    await flushMicrotasks()

    assert.match(root.querySelector('.active-count')?.textContent || '', /0 items left/)
    assert.match(root.querySelector('.completed-count')?.textContent || '', /2 completed/)
    assert.equal(parentRerenders, 0, 'parent must NOT rerender on toggle')
    assert.equal(childRerenders, 0, 'child must NOT rerender on toggle (should use surgical prop patches)')

    parentRerenders = 0
    childRerenders = 0
    let childRefreshCalled = false
    const refreshMethodName = Object.keys(view).find((k) => k.startsWith('__refreshChildProps_'))
    if (refreshMethodName) {
      const origRefresh = (view as any)[refreshMethodName].bind(view)
      ;(view as any)[refreshMethodName] = () => {
        childRefreshCalled = true
        return origRefresh()
      }
    }

    store.draft = 'some text'
    await flushMicrotasks()

    assert.equal(
      childRefreshCalled,
      false,
      'draft mutation must NOT trigger __refreshChildProps (observer targets ["todos"], not root [])',
    )
    assert.equal(parentRerenders, 0, 'draft mutation must NOT rerender parent')
    assert.equal(childRerenders, 0, 'draft mutation must NOT rerender child')

    view.dispose()
    await flushMicrotasks()
  } finally {
    await rm(dir, { recursive: true, force: true })
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Real-file store tests: exercise the OPTIMIZED observer path
// (analyzeStoreGetters + analyzeStoreReactiveFields succeed because the
// store file exists on disk, unlike virtual-file tests that always fall
// back to root observers)
// ---------------------------------------------------------------------------

test('real-file store: conditional child renders when getter-source array grows (todo-app pattern)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-realfile-todo`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const store = new Store({
      todos: [] as Array<{ id: number; text: string; done: boolean }>,
      filter: 'all' as 'all' | 'active' | 'completed',
      draft: '',
      nextId: 1,
    }) as any

    Object.defineProperty(store, 'filteredTodos', {
      get() {
        const { todos, filter } = store
        if (filter === 'active') return todos.filter((t: any) => !t.done)
        if (filter === 'completed') return todos.filter((t: any) => t.done)
        return todos
      },
    })
    Object.defineProperty(store, 'activeCount', {
      get() {
        return store.todos.filter((t: any) => !t.done).length
      },
    })
    Object.defineProperty(store, 'completedCount', {
      get() {
        return store.todos.filter((t: any) => t.done).length
      },
    })

    store.add = (text: string) => {
      store.todos = [...store.todos, { id: store.nextId++, text, done: false }]
    }
    store.toggle = (id: number) => {
      const todo = store.todos.find((t: any) => t.id === id)
      if (todo) todo.done = !todo.done
    }
    store.remove = (id: number) => {
      store.todos = store.todos.filter((t: any) => t.id !== id)
    }
    store.setFilter = (f: string) => {
      store.filter = f
    }

    const fixtureDir = join(__dirname, 'fixtures')

    const TodoItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoItem extends Component {
          template({ todo, onToggle, onRemove }) {
            return (
              <li class={\`todo-item \${todo.done ? 'done' : ''}\`}>
                <span class="todo-text">{todo.text}</span>
                <button class="todo-remove" click={onRemove}>x</button>
              </li>
            )
          }
        }
      `,
      join(fixtureDir, 'TodoItem.jsx'),
      'TodoItem',
      { Component },
    )

    const TodoFilters = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TodoFilters extends Component {
          template({ activeCount, completedCount, filter }) {
            return (
              <div class="todo-filters">
                <span class="count">{activeCount} left</span>
                <span class="completed">{completedCount} done</span>
              </div>
            )
          }
        }
      `,
      join(fixtureDir, 'TodoFilters.jsx'),
      'TodoFilters',
      { Component },
    )

    const TodoApp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store.ts'
        import TodoItem from './TodoItem.jsx'
        import TodoFilters from './TodoFilters.jsx'

        export default class TodoApp extends Component {
          template() {
            const { filteredTodos, activeCount, completedCount } = todoStore
            return (
              <div class="todo-app">
                <h1>Todo</h1>
                <ul class="todo-list">
                  {filteredTodos.map(todo => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={() => todoStore.toggle(todo.id)}
                      onRemove={() => todoStore.remove(todo.id)}
                    />
                  ))}
                </ul>
                {todoStore.todos.length > 0 && (
                  <TodoFilters
                    activeCount={activeCount}
                    completedCount={completedCount}
                    filter={todoStore.filter}
                  />
                )}
              </div>
            )
          }
        }
      `,
      join(fixtureDir, 'TodoApp.jsx'),
      'TodoApp',
      { Component, todoStore: store, TodoItem, TodoFilters },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new TodoApp()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.todo-filters'), null, 'filters hidden when no todos')

    store.add('Buy groceries')
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.todo-item').length, 1, 'one todo rendered')
    assert.ok(view.el.querySelector('.todo-filters'), 'filters MUST appear after adding a todo')
    assert.match(view.el.querySelector('.count')?.textContent || '', /1 left/)

    store.add('Walk the dog')
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.todo-item').length, 2, 'two todos rendered')
    assert.match(view.el.querySelector('.count')?.textContent || '', /2 left/)

    view.dispose()
  } finally {
    restoreDom()
  }
})

test('local state change patches DOM without full rerender (editing toggle)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-local-state-patch`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableItem extends Component {
          editing = false
          editText = ''

          startEditing() {
            if (this.editing) return
            this.editing = true
            this.editText = this.props.label
          }

          handleInput(e) {
            this.editText = e.target.value
          }

          template({ label }) {
            const { editing, editText } = this
            return (
              <li class={\`item \${editing ? 'editing' : ''}\`}>
                <span class="label">{label}</span>
                <input class="edit-input" type="text" value={editText} input={this.handleInput} />
              </li>
            )
          }
        }
      `,
      '/virtual/EditableItem.jsx',
      'EditableItem',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const item = new EditableItem({ label: 'Buy groceries' })
    item.render(root)
    await flushMicrotasks()

    assert.ok(item.el, 'item rendered')
    assert.ok(!item.el.className.includes('editing'), 'not editing initially')

    let rerenders = 0
    const origRerender = item.__geaRequestRender.bind(item)
    item.__geaRequestRender = () => {
      rerenders++
      return origRerender()
    }

    item.startEditing()
    await flushMicrotasks()

    assert.ok(item.el.className.includes('editing'), 'editing class added')
    assert.equal(rerenders, 0, 'editing toggle must patch class without full rerender')

    item.dispose()
  } finally {
    restoreDom()
  }
})

test('conditional slot with local-state destructured guard renders without ReferenceError', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-local-destr`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableItem extends Component {
          editing = false
          editText = ''

          startEditing() {
            this.editing = true
            this.editText = this.props.label
          }

          handleInput(e) {
            this.editText = e.target.value
          }

          template({ label }) {
            const { editing, editText } = this
            return (
              <li class={\`item \${editing ? 'editing' : ''}\`}>
                <span class="label">{label}</span>
                {editing && <input class="edit-input" type="text" value={editText} input={this.handleInput} />}
              </li>
            )
          }
        }
      `,
      '/virtual/EditableItemCond.jsx',
      'EditableItem',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const item = new EditableItem({ label: 'Buy groceries' })
    item.render(root)
    await flushMicrotasks()

    assert.ok(item.el, 'item rendered without constructor ReferenceError')
    assert.ok(!item.el.querySelector('.edit-input'), 'edit input absent when not editing')

    item.startEditing()
    await flushMicrotasks()

    assert.ok(item.el.className.includes('editing'), 'editing class added')
    const editInput = item.el.querySelector('.edit-input') as any
    assert.ok(editInput, 'edit input appears after startEditing')
    assert.equal(
      editInput.getAttribute('value'),
      'Buy groceries',
      'edit input value must reflect the label set in startEditing',
    )

    item.editText = 'Buy milk'
    await flushMicrotasks()

    const updatedInput = item.el.querySelector('.edit-input') as any
    assert.ok(updatedInput, 'edit input still present after editText change')
    assert.equal(
      updatedInput.getAttribute('value'),
      'Buy milk',
      'edit input value must update when editText changes while slot is visible',
    )

    item.dispose()
  } finally {
    restoreDom()
  }
})

test('kanban add-form: typing in draftTitle input must NOT trigger full rerender', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-kanban-draft-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const kanbanStore = new Store({
      addingToColumnId: null as string | null,
      draftTitle: '',
      draggingTaskId: null as string | null,
      dragOverColumnId: null as string | null,
    }) as {
      addingToColumnId: string | null
      draftTitle: string
      draggingTaskId: string | null
      dragOverColumnId: string | null
      setDraftTitle: (e: { target: { value: string } }) => void
    }
    kanbanStore.setDraftTitle = function (e: { target: { value: string } }) {
      ;(this as any).draftTitle = e.target.value
    }

    const KanbanColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import kanbanStore from './kanban-store'

        export default class KanbanColumn extends Component {
          template({ column }) {
            const isDragOver = kanbanStore.dragOverColumnId === column.id
            const isAdding = kanbanStore.addingToColumnId === column.id
            return (
              <div class={\`col \${isDragOver ? 'drag-over' : ''}\`}>
                <div class="header">{column.title}</div>
                <div class="body">
                  {isAdding ? (
                    <div class="kanban-add-form">
                      <input
                        type="text"
                        placeholder="Task title"
                        value={kanbanStore.draftTitle}
                        input={kanbanStore.setDraftTitle}
                      />
                      <div class="kanban-add-form-actions">
                        <button class="add-btn">Add</button>
                        <button class="cancel-btn">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button class="add-task">+ Add task</button>
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/KanbanColumnDraft.jsx',
      'KanbanColumn',
      { Component, kanbanStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new KanbanColumn({ column: { id: 'col-1', title: 'Backlog' } })
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.add-task'), 'initially shows add-task button')
    assert.ok(!view.el.querySelector('.kanban-add-form'), 'initially no add form')

    // Open the add form
    kanbanStore.addingToColumnId = 'col-1'
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.kanban-add-form'), 'add form should appear')
    assert.ok(!view.el.querySelector('.add-task'), 'add-task button should be gone')

    const inputBefore = view.el.querySelector('input[type="text"]') as HTMLElement | null
    assert.ok(inputBefore, 'input must be present in add form')

    // Spy on full rerenders AFTER the form is open
    let rerenderCount = 0
    const origRender = view.__geaRequestRender.bind(view)
    view.__geaRequestRender = () => {
      rerenderCount++
      return origRender()
    }

    // Simulate typing — change draftTitle in the store
    kanbanStore.draftTitle = 'N'
    await flushMicrotasks()
    assert.equal(rerenderCount, 0, 'typing first char must NOT trigger full rerender')

    kanbanStore.draftTitle = 'Ne'
    await flushMicrotasks()
    assert.equal(rerenderCount, 0, 'typing second char must NOT trigger full rerender')

    kanbanStore.draftTitle = 'New task'
    await flushMicrotasks()
    assert.equal(rerenderCount, 0, 'typing full title must NOT trigger full rerender')

    // The input element should be the same DOM node (not replaced)
    const inputAfter = view.el.querySelector('input[type="text"]') as HTMLElement | null
    assert.ok(inputAfter, 'input must still be present')
    assert.equal(inputAfter, inputBefore, 'input DOM node must be preserved (not replaced by rerender)')

    view.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Inline children click handlers inside compiled child component
// ---------------------------------------------------------------------------

test('click handler on inline child inside compiled child component fires on parent', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-inline-child-click`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Wrapper = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      export default class Wrapper extends Component {
        template(props) {
          return (
            <div class="wrapper">
              <div class="wrapper-body">{props.children}</div>
            </div>
          )
        }
      }
    `,
      '/virtual/Wrapper.jsx',
      'Wrapper',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
      import { Component } from '@geajs/core'
      import Wrapper from './Wrapper'
      export default class Parent extends Component {
        lastAction = 'none'
        template() {
          return (
            <div class="parent">
              <Wrapper>
                <button class="action-btn" click={() => (this.lastAction = 'clicked')}>
                  Do it
                </button>
              </Wrapper>
              <span class="result">{this.lastAction}</span>
            </div>
          )
        }
      }
    `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Wrapper },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.result')?.textContent, 'none')

    const btn = view.el.querySelector('.action-btn') as HTMLElement
    assert.ok(btn, 'inline button should exist inside the wrapper')
    assert.ok(btn.getAttribute('data-gea-event'), 'button should have data-gea-event for event delegation')

    // Simulate Zag's spreadProps overwriting the id — data-gea-event should survive.
    // In real usage, our Dialog override replaces Zag's onclick (which calls stopPropagation)
    // with a version that doesn't — so the spread here omits stopPropagation.
    const { spreadProps } = await import('@zag-js/vanilla')
    spreadProps(btn, {
      'data-scope': 'dialog',
      'data-part': 'close-trigger',
      id: 'dialog:overwrite:close-trigger',
      type: 'button',
      onclick() {},
    })
    assert.equal(btn.id, 'dialog:overwrite:close-trigger', 'spreadProps overwrites the id')
    assert.ok(btn.getAttribute('data-gea-event'), 'data-gea-event survives spreadProps')

    btn.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(
      view.el.querySelector('.result')?.textContent,
      'clicked',
      'click handler fires even after spreadProps overwrites id (uses data-gea-event)',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('real-file store: getter accessed via direct member expression updates when dependency changes', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-getter-member-access`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const store = new Store({ count: 0 }) as any
    Object.defineProperty(store, 'doubled', {
      get() {
        return store.count * 2
      },
    })
    store.increment = () => {
      store.count++
    }

    const fixtureDir = join(__dirname, 'fixtures')

    const CounterDisplay = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import counterStore from './counter-store'

        export default class CounterDisplay extends Component {
          template() {
            return (
              <div>
                <span class="count">{counterStore.count}</span>
                <span class="doubled">{counterStore.doubled}</span>
              </div>
            )
          }
        }
      `,
      join(fixtureDir, 'CounterDisplay.jsx'),
      'CounterDisplay',
      { Component, counterStore: store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new CounterDisplay()
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '0', 'initial count')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '0', 'initial doubled')

    store.increment()
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '1', 'count after increment')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '2', 'doubled updates after increment')

    store.increment()
    await flushMicrotasks()

    assert.equal(view.el.querySelector('.count')?.textContent, '2', 'count after second increment')
    assert.equal(view.el.querySelector('.doubled')?.textContent, '4', 'doubled updates after second increment')

    view.dispose()
  } finally {
    restoreDom()
  }
})

/** Mirrors jira_clone Select: class getter + nested span + {this.displayLabel}; label must update after __geaUpdateProps. */
test('component getter displayLabel text updates when value prop changes (Select pattern)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-select-display-label`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SelectLike = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SelectLike extends Component {
          get displayLabel() {
            const { options = [], value, placeholder = 'Select...' } = this.props
            if (value === undefined || value === null || value === '') return placeholder
            const opt = options.find((o) => o.value === value)
            return opt ? opt.label : String(value)
          }

          template({
            options = [],
            value,
            placeholder = 'Select...',
          }) {
            return (
              <div class="select">
                <div class="select-value">
                  <span class="select-value-text">{this.displayLabel}</span>
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/SelectDisplayLabel.jsx',
      'SelectLike',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
    ]

    const view = new SelectLike({
      options,
      value: 'a',
      placeholder: 'Select...',
    })
    view.render(root)
    await flushMicrotasks()

    const labelEl = () => view.el.querySelector('.select-value-text')
    assert.equal(labelEl()?.textContent, 'Alpha', 'initial label matches selected option')

    view.__geaUpdateProps({ value: 'b', options })
    await flushMicrotasks()

    assert.equal(
      labelEl()?.textContent,
      'Bravo',
      'label text must update after value prop changes (getter + this.displayLabel patch)',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('jira_clone: Board keeps data-gea-compiled-child-root after Project.__geaRequestRender', async () => {
  const restoreDom = installDom()
  let Outlet: any = null
  let router: any = null

  try {
    const { default: ComponentManager } = await import('../../gea/src/lib/base/component-manager')
    ComponentManager.instance = undefined
    const { default: Component } = await import('../../gea/src/lib/base/component.tsx')
    const { Store } = await import('../../gea/src/lib/store.ts')

    const { readFileSync } = await import('node:fs')
    const jiraRoot = join(__dirname, '../../../examples/jira_clone/src')
    const readJira = (rel: string) => readFileSync(join(jiraRoot, rel), 'utf8')

    // --- Real stores (fresh Store instances with same shape) ---
    const projectStore = new Store({
      project: null as any,
      isLoading: true,
      error: null as any,
    }) as any
    projectStore.updateLocalProjectIssues = (issueId: string, fields: any) => {
      if (!projectStore.project) return
      for (const issue of projectStore.project.issues) {
        if (issue.id === issueId) {
          Object.assign(issue, fields)
          break
        }
      }
    }

    const filtersStore = new Store({
      searchTerm: '',
      userIds: [] as string[],
      myOnly: false,
      recentOnly: false,
    }) as any
    Object.defineProperty(filtersStore, 'areFiltersCleared', {
      get() {
        return (
          !filtersStore.searchTerm &&
          filtersStore.userIds.length === 0 &&
          !filtersStore.myOnly &&
          !filtersStore.recentOnly
        )
      },
    })
    filtersStore.setSearchTerm = (val: string) => {
      filtersStore.searchTerm = val
    }
    filtersStore.toggleUserId = (id: string) => {
      const idx = filtersStore.userIds.indexOf(id)
      if (idx >= 0) filtersStore.userIds.splice(idx, 1)
      else filtersStore.userIds.push(id)
    }
    filtersStore.toggleMyOnly = () => {
      filtersStore.myOnly = !filtersStore.myOnly
    }
    filtersStore.toggleRecentOnly = () => {
      filtersStore.recentOnly = !filtersStore.recentOnly
    }
    filtersStore.clearAll = () => {
      filtersStore.searchTerm = ''
      filtersStore.userIds = []
      filtersStore.myOnly = false
      filtersStore.recentOnly = false
    }

    const authStore = new Store({
      token: null as string | null,
      currentUser: null as any,
      isAuthenticating: false,
    }) as any

    const issueStore = new Store({
      issue: null as any,
      isLoading: false,
    }) as any
    issueStore.clear = () => {
      issueStore.issue = null
      issueStore.isLoading = false
    }
    issueStore.updateIssue = async (fields: any) => {
      if (!issueStore.issue) return
      Object.assign(issueStore.issue, fields)
      projectStore.updateLocalProjectIssues(issueStore.issue.id, fields)
    }
    issueStore.createComment = async (_issueId: string, body: string) => {
      if (!issueStore.issue) return
      if (!issueStore.issue.comments) issueStore.issue.comments = []
      issueStore.issue.comments.push({
        id: `c${Date.now()}`,
        body,
        userId: 'u1',
        createdAt: new Date().toISOString(),
      })
    }

    const { Router } = await import('../../gea/src/lib/router/router.ts')
    const { matchRoute } = await import('../../gea/src/lib/router/match.ts')
    Outlet = (await import('../../gea/src/lib/router/outlet.ts')).default
    router = new Router()
    Outlet._router = router

    const IssueStatus = { BACKLOG: 'backlog', SELECTED: 'selected', INPROGRESS: 'inprogress', DONE: 'done' }
    const IssueStatusCopy: Record<string, string> = {
      backlog: 'Backlog',
      selected: 'Selected for development',
      inprogress: 'In progress',
      done: 'Done',
    }

    // --- Compile real components ---

    // Functional components (plugin converts them to class extends Component)
    const Icon = await compileJsxComponent(
      readJira('components/Icon.tsx'),
      join(jiraRoot, 'components/Icon.tsx'),
      'Icon',
      { Component },
    )

    const Spinner = await compileJsxComponent(
      readJira('components/Spinner.tsx'),
      join(jiraRoot, 'components/Spinner.tsx'),
      'Spinner',
      { Component },
    )

    const PageLoader = await compileJsxComponent(
      readJira('components/PageLoader.tsx'),
      join(jiraRoot, 'components/PageLoader.tsx'),
      'PageLoader',
      { Component, Spinner },
    )

    const Breadcrumbs = await compileJsxComponent(
      readJira('components/Breadcrumbs.tsx'),
      join(jiraRoot, 'components/Breadcrumbs.tsx'),
      'Breadcrumbs',
      { Component },
    )

    const IssuePriorityIcon = await compileJsxComponent(
      readJira('components/IssuePriorityIcon.tsx'),
      join(jiraRoot, 'components/IssuePriorityIcon.tsx'),
      'IssuePriorityIcon',
      { Component },
    )

    const IssueTypeIcon = await compileJsxComponent(
      readJira('components/IssueTypeIcon.tsx'),
      join(jiraRoot, 'components/IssueTypeIcon.tsx'),
      'IssueTypeIcon',
      { Component },
    )

    // Avatar — use real @geajs/ui source
    const geaUiRoot = join(__dirname, '../../../packages/gea-ui/src')
    const zagAvatarSrc = readFileSync(join(geaUiRoot, 'components/avatar.tsx'), 'utf8')
    let avatar: any, normalizeProps: any, ZagComponent: any

    try {
      avatar = await import('@zag-js/avatar')
      ;({ normalizeProps } = await import('@zag-js/vanilla'))
      const zagMod = await import('../../gea-ui/src/primitives/zag-component.ts')
      ZagComponent = zagMod.default
    } catch {
      // If zag not available, use a simple stub
      ZagComponent = class extends Component {
        onAfterRender() {
          this.el?.setAttribute('data-mounted', 'true')
        }
      }
      avatar = { machine: null, connect: () => ({}) }
      normalizeProps = (v: any) => v
    }

    const Avatar = await compileJsxComponent(zagAvatarSrc, join(geaUiRoot, 'components/avatar.tsx'), 'Avatar', {
      Component,
      ZagComponent,
      avatar,
      normalizeProps,
    })

    // IssueCard — real source
    const IssueCard = await compileJsxComponent(
      readJira('components/IssueCard.tsx'),
      join(jiraRoot, 'components/IssueCard.tsx'),
      'IssueCard',
      { Component, router, IssueTypeIcon, IssuePriorityIcon, Avatar },
    )

    // BoardColumn — real source
    const BoardColumn = await compileJsxComponent(
      readJira('components/BoardColumn.tsx'),
      join(jiraRoot, 'components/BoardColumn.tsx'),
      'BoardColumn',
      { Component, IssueStatusCopy, projectStore, IssueCard },
    )

    // Board — real source
    const Board = await compileJsxComponent(readJira('views/Board.tsx'), join(jiraRoot, 'views/Board.tsx'), 'Board', {
      Component,
      projectStore,
      filtersStore,
      authStore,
      IssueStatus,
      Avatar,
      Breadcrumbs,
      BoardColumn,
    })

    // QuillEditor — real source
    let Quill: any
    try {
      Quill = (await import('quill')).default
    } catch {
      Quill = class {
        constructor() {}
        on() {}
        focus() {}
        root = { innerHTML: '' }
        clipboard = { dangerouslyPasteHTML() {} }
      }
    }
    const QuillEditor = await compileJsxComponent(
      readJira('components/QuillEditor.tsx'),
      join(jiraRoot, 'components/QuillEditor.tsx'),
      'QuillEditor',
      { Component, Quill },
    )

    // Set up routes so Outlet can resolve components
    router.setRoutes({
      '/project/board': Board,
      '/project/board/issues/:issueId': Board,
    })

    // Sidebar — real source
    const Sidebar = await compileJsxComponent(
      readJira('views/Sidebar.tsx'),
      join(jiraRoot, 'views/Sidebar.tsx'),
      'Sidebar',
      { Component, router, projectStore, Icon },
    )

    // NavbarLeft — real source
    const NavbarLeft = await compileJsxComponent(
      readJira('views/NavbarLeft.tsx'),
      join(jiraRoot, 'views/NavbarLeft.tsx'),
      'NavbarLeft',
      { Component },
    )

    // Real Dialog from @geajs/ui
    let dialog: any, Dialog: any
    try {
      dialog = await import('@zag-js/dialog')
      const dialogSrc = readFileSync(join(geaUiRoot, 'components/dialog.tsx'), 'utf8')
      Dialog = await compileJsxComponent(dialogSrc, join(geaUiRoot, 'components/dialog.tsx'), 'Dialog', {
        Component,
        ZagComponent,
        dialog,
        normalizeProps,
      })
    } catch {
      // Fallback stub if zag-js/dialog is unavailable
      Dialog = await compileJsxComponent(
        `import { Component } from '@geajs/core'
         export default class Dialog extends Component {
           template(props) { return <div class="dialog-stub">{props.children}</div> }
         }`,
        join(jiraRoot, 'views/_DialogStub.tsx'),
        'Dialog',
        { Component },
      )
    }

    // Mock issueStore.fetchIssue — return data matching the project issue
    const makeIssueDetail = (id: string) => {
      const projectIssue = mockProject.issues.find((i: any) => i.id === id)
      return {
        id,
        title: projectIssue?.title || 'Test issue ' + id,
        description: 'A test description',
        type: projectIssue?.type || 'task',
        status: projectIssue?.status || 'backlog',
        priority: projectIssue?.priority || '3',
        userIds: projectIssue?.userIds || [],
        reporterId: 'u1',
        comments: [],
        estimate: 4,
        timeSpent: 0,
        timeRemaining: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
    issueStore.fetchIssue = async (id: string) => {
      issueStore.isLoading = true
      await Promise.resolve()
      issueStore.issue = makeIssueDetail(id)
      issueStore.isLoading = false
    }

    // Select — real @geajs/ui source
    let selectZag: any, Select: any
    try {
      selectZag = await import('@zag-js/select')
      Select = await compileJsxComponent(
        readFileSync(join(geaUiRoot, 'components/select.tsx'), 'utf8'),
        join(geaUiRoot, 'components/select.tsx'),
        'Select',
        { Component, ZagComponent, select: selectZag, normalizeProps },
      )
    } catch (e) {
      Select = await compileJsxComponent(
        `import { Component } from '@geajs/core'\nexport default class Select extends Component { template(props) { return <div class="select-stub">{props.placeholder}</div> } }`,
        join(geaUiRoot, 'components/select.tsx'),
        'Select',
        { Component },
      )
    }

    // Button — real @geajs/ui source
    const { cn } = await import('../../gea-ui/src/utils/cn')
    const Button = await compileJsxComponent(
      readFileSync(join(geaUiRoot, 'components/button.tsx'), 'utf8'),
      join(geaUiRoot, 'components/button.tsx'),
      'Button',
      { Component, cn },
    )

    // toastStore — lightweight mock (no real ToastStore in test env)
    const toastStore = { success(_title: string) {}, error(_err: unknown) {} }

    // CommentCreate — real jira source
    const CommentCreate = await compileJsxComponent(
      readJira('views/CommentCreate.tsx'),
      join(jiraRoot, 'views/CommentCreate.tsx'),
      'CommentCreate',
      { Component, issueStore, authStore, Avatar, Button, Spinner },
    )

    // CommentItem — real jira source
    const { formatDateTimeConversational } = await import('../../../examples/jira_clone/src/utils/dateTime')
    const CommentItem = await compileJsxComponent(
      readJira('views/CommentItem.tsx'),
      join(jiraRoot, 'views/CommentItem.tsx'),
      'CommentItem',
      { Component, issueStore, projectStore, formatDateTimeConversational, Avatar, Button },
    )

    // Issue constants
    const {
      IssueType,
      IssueTypeCopy,
      IssueStatus: IssueStatusConst,
      IssueStatusCopy: IssueStatusCopyConst,
      IssuePriority,
      IssuePriorityCopy,
    } = await import('../../../examples/jira_clone/src/constants/issues')

    // IssueDetails — REAL source
    const IssueDetails = await compileJsxComponent(
      readJira('views/IssueDetails.tsx'),
      join(jiraRoot, 'views/IssueDetails.tsx'),
      'IssueDetails',
      {
        Component,
        issueStore,
        projectStore,
        toastStore,
        IssueType,
        IssueTypeCopy,
        IssueStatus: IssueStatusConst,
        IssueStatusCopy: IssueStatusCopyConst,
        IssuePriority,
        IssuePriorityCopy,
        formatDateTimeConversational,
        Select,
        Button,
        Dialog,
        Icon,
        IssueTypeIcon,
        IssuePriorityIcon,
        Spinner,
        CommentCreate,
        CommentItem,
        QuillEditor,
      },
    )

    // Validation utils for IssueCreate
    const { is, generateErrors } = await import('../../../examples/jira_clone/src/utils/validation')

    // IssueCreate — real jira source
    const IssueCreate = await compileJsxComponent(
      readJira('views/IssueCreate.tsx'),
      join(jiraRoot, 'views/IssueCreate.tsx'),
      'IssueCreate',
      {
        Component,
        projectStore,
        authStore,
        toastStore,
        IssueType,
        IssueTypeCopy,
        IssueStatus: IssueStatusConst,
        IssuePriority,
        IssuePriorityCopy,
        is,
        generateErrors,
        Button,
        Select,
        Spinner,
      },
    )

    // IssueSearch utils
    const { sortByNewest } = await import('../../../examples/jira_clone/src/utils/javascript')
    const api = {
      get: async () => ({ issues: [] }),
      post: async () => ({}),
      put: async () => ({}),
      delete: async () => ({}),
    }

    // IssueSearch — real jira source
    const IssueSearch = await compileJsxComponent(
      readJira('views/IssueSearch.tsx'),
      join(jiraRoot, 'views/IssueSearch.tsx'),
      'IssueSearch',
      { Component, router, projectStore, api, sortByNewest, Icon, IssueTypeIcon, Spinner },
    )

    // Project — real source
    const Project = await compileJsxComponent(
      readJira('views/Project.tsx'),
      join(jiraRoot, 'views/Project.tsx'),
      'Project',
      {
        Component,
        Outlet,
        router,
        matchRoute,
        Dialog,
        projectStore,
        issueStore,
        NavbarLeft,
        Sidebar,
        Board,
        ProjectSettings: IssueCreate,
        IssueDetails,
        IssueCreate,
        IssueSearch,
        PageLoader,
      },
    )

    // --- Setup mock data ---
    const mockProject = {
      id: 'p1',
      name: 'Project Singularity',
      category: 'software',
      url: '',
      description: '',
      users: [
        { id: 'u1', name: 'Pickle Rick', avatarUrl: 'https://i.ibb.co/7JM1P2r/picke-rick.jpg' },
        { id: 'u2', name: 'Lord Gaben', avatarUrl: 'https://i.ibb.co/6RJ5hq6/gaben.jpg' },
        { id: 'u3', name: 'Baby Yoda', avatarUrl: 'https://i.ibb.co/6n0hLML/baby-yoda.jpg' },
      ],
      issues: [
        {
          id: '1',
          title: 'Investigate login',
          type: 'task',
          priority: '4',
          status: 'backlog',
          listPosition: 1,
          userIds: ['u1', 'u2'],
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          title: 'Add search',
          type: 'story',
          priority: '4',
          status: 'backlog',
          listPosition: 2,
          userIds: ['u1', 'u3'],
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          title: 'Fix registration',
          type: 'bug',
          priority: '5',
          status: 'selected',
          listPosition: 1,
          userIds: ['u2'],
          updatedAt: new Date().toISOString(),
        },
        {
          id: '4',
          title: 'Dark mode toggle',
          type: 'story',
          priority: '4',
          status: 'inprogress',
          listPosition: 1,
          userIds: ['u1', 'u3'],
          updatedAt: new Date().toISOString(),
        },
      ],
    }

    projectStore.project = mockProject
    projectStore.isLoading = false
    await flushMicrotasks()

    // --- Render ---
    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Project()
    view.render(root)

    router.replace('/project/board')
    await flushMicrotasks()
    await flushMicrotasks()

    // Board must be rendered and have the attribute
    const boardEl = view.el.querySelector('.board')
    assert.ok(boardEl, 'Board element must exist after render')
    assert.equal(
      boardEl!.hasAttribute('data-gea-compiled-child-root'),
      true,
      'Board must have data-gea-compiled-child-root after initial render',
    )

    // Issue cards must exist
    const cardsBefore = view.el.querySelectorAll('.issue-card')
    assert.ok(cardsBefore.length > 0, 'Issue cards must exist after initial render')

    // Capture Board element reference to check it survives
    const boardIdBefore = boardEl!.id

    // --- Simulate route change — open issue 2 (userIds: ['u1', 'u3']) ---
    router.replace('/project/board/issues/2')
    await flushMicrotasks()
    await flushMicrotasks()

    // Board must STILL have data-gea-compiled-child-root
    const boardElAfter = view.el.querySelector('.board')
    assert.ok(boardElAfter, 'Board element must still exist after route change')
    assert.equal(
      boardElAfter!.hasAttribute('data-gea-compiled-child-root'),
      true,
      'Board must keep data-gea-compiled-child-root after route change (no unnecessary rerender)',
    )

    // Board element should be the SAME node (not recreated)
    assert.equal(boardElAfter!.id, boardIdBefore, 'Board element ID must not change — Board must not be recreated')

    // Issue cards must still be present
    const cardsAfter = view.el.querySelectorAll('.issue-card')
    assert.equal(cardsAfter.length, cardsBefore.length, 'Issue cards must survive route change')

    // Check Dialog mounting
    const dialogInstance = (view as any)._dialog
    assert.ok(dialogInstance, 'Dialog instance must exist after route to issue')
    const dialogElById = document.getElementById(dialogInstance.id)
    assert.ok(dialogElById, `Dialog element must exist in DOM (id=${dialogInstance.id})`)
    assert.ok(dialogInstance.__geaCompiledChild, 'Dialog must have __geaCompiledChild')
    assert.equal(dialogInstance.parentComponent, view, 'Dialog parentComponent must be Project')
    assert.equal(dialogInstance.rendered_, true, `Dialog must be rendered after conditional slot activation`)

    // Wait for fetchIssue to resolve and IssueDetails to rerender
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // IssueDetails must have loaded past the spinner
    const detailsEl = view.el.querySelector('.issue-details')
    assert.ok(detailsEl, 'Issue detail must load (not stuck on spinner)')
    const titleEl = view.el.querySelector('.issue-title-text')
    assert.ok(titleEl, 'Issue title must be rendered after fetch completes')
    assert.ok(titleEl!.textContent!.includes('Add search'), 'Issue title must contain fetched data')

    // IssueDetails right panel must have field labels
    const fieldLabels = detailsEl!.querySelectorAll('.issue-details-field-label')
    assert.ok(fieldLabels.length > 0, `IssueDetails must render field labels (found ${fieldLabels.length})`)

    // --- Changing assignees must NOT trigger a board rerender ---
    const boardNodeBefore = view.el.querySelector('.board')!

    // Simulate real scenario: issue 2 has userIds ['u1','u3'], user adds 'u2' as 3rd assignee.
    // The new array ['u1','u3','u2'] is an append of the old ['u1','u3'] — triggers Store
    // append optimization which produces a change WITHOUT isArrayItemPropUpdate.
    await issueStore.updateIssue({
      userIds: ['u1', 'u3', 'u2'],
      users: [{ id: 'u1' }, { id: 'u3' }, { id: 'u2' }],
    })
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const boardNodeAfter = view.el.querySelector('.board')
    assert.ok(boardNodeAfter, 'Board must still exist after assignee change')
    assert.strictEqual(
      boardNodeAfter,
      boardNodeBefore,
      'Board DOM node must be the SAME reference — assignee change must not cause Project rerender',
    )

    // Dialog must still show the issue details (not spinner)
    const detailsAfterAssignees = view.el.querySelector('.issue-details')
    assert.ok(detailsAfterAssignees, 'IssueDetails must still show full details after assignee change (not spinner)')

    // --- Creating a comment must not break IssueDetails ---
    await issueStore.createComment('2', 'Hello world')
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const detailsAfterComment = view.el.querySelector('.issue-details')
    assert.ok(detailsAfterComment, 'IssueDetails must still show full details after adding a comment (not spinner)')

    // --- Close the dialog and verify body styles are cleaned up ---
    router.replace('/project/board')
    issueStore.clear()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const bodyStyle = document.body.getAttribute('style') || ''
    assert.ok(
      !bodyStyle.includes('overflow') || bodyStyle.includes('overflow: visible') || bodyStyle === '',
      'Body must not have overflow:hidden after dialog closes (got: ' + bodyStyle + ')',
    )

    view.dispose()
    await flushMicrotasks()
    await flushMicrotasks()
  } finally {
    if (Outlet) Outlet._router = null
    if (router) router.dispose()
    restoreDom()
  }
})

// create*Item patch path must rewrite destructured template props like render*Item (jira_clone Select).
test('map createItem patch path rewrites template props after __geaUpdateProps (Select isMulti)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-conditional-map-ismulti-props`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SelectLike = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SelectLike extends Component {
          template({ options = [], isMulti = false, value }) {
            return (
              <div class="select">
                <div class="options">
                  {options.map((opt) => (
                    <div
                      key={opt.value}
                        class={\`opt \${isMulti ? ((value || []).includes(opt.value) ? 'on' : '') : opt.value === value ? 'on' : ''}\`}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/SelectLikeMapProps.jsx',
      'SelectLike',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new SelectLike({
      options: [{ value: '1', label: 'One' }],
      isMulti: true,
      value: ['1'],
    })
    view.render(root)
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.opt').length, 1)

    view.__geaUpdateProps({
      options: [
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
      ],
    })
    await flushMicrotasks()

    assert.equal(view.el.querySelectorAll('.opt').length, 2)

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('disabled={false} on a <button> must NOT produce a disabled attribute in the DOM', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-button-disabled-false`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const geaUiRoot = join(dirname(fileURLToPath(import.meta.url)), '../../gea-ui/src')
    const { cn } = await import('../../gea-ui/src/utils/cn')

    const Button = await compileJsxComponent(
      readFileSync(join(geaUiRoot, 'components/button.tsx'), 'utf8'),
      join(geaUiRoot, 'components/button.tsx'),
      'Button',
      { Component, cn },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const btn = new Button({ disabled: false, variant: 'default' })
    btn.render(root)
    await flushMicrotasks()

    const el = btn.el.querySelector('button') || btn.el
    assert.ok(el, 'button element must exist')
    assert.equal(
      el.hasAttribute('disabled'),
      false,
      'button with disabled={false} must NOT have the disabled attribute',
    )

    btn.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional textarea value binding: textarea.value must reflect state set before conditional flip', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-textarea-value`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableTitle = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableTitle extends Component {
          isEditing = false
          editTitle = ''

          startEditing() {
            this.editTitle = 'Hello World'
            this.isEditing = true
          }

          startEditingFlagFirst() {
            this.isEditing = true
            this.editTitle = 'Flag First'
          }

          template() {
            return (
              <div class="wrapper">
                {!this.isEditing && (
                  <h2 class="title-display">Some Title</h2>
                )}
                {this.isEditing && (
                  <textarea class="title-input" value={this.editTitle}></textarea>
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/EditableTitle.jsx',
      'EditableTitle',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const comp = new EditableTitle()
    comp.render(root)
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.title-display'), 'h2 visible initially')
    assert.ok(!comp.el.querySelector('.title-input'), 'textarea absent initially')

    comp.startEditing()
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.title-display'), 'h2 hidden after startEditing')
    const textarea = comp.el.querySelector('.title-input') as HTMLTextAreaElement
    assert.ok(textarea, 'textarea appears after startEditing')
    assert.equal(
      textarea.value,
      'Hello World',
      'textarea.value must equal editTitle set in startEditing (data before flag)',
    )

    // Reset and test the other assignment order (flag first, then data)
    comp.isEditing = false
    await flushMicrotasks()

    comp.startEditingFlagFirst()
    await flushMicrotasks()

    const textarea2 = comp.el.querySelector('.title-input') as HTMLTextAreaElement
    assert.ok(textarea2, 'textarea appears after startEditingFlagFirst')
    assert.equal(
      textarea2.value,
      'Flag First',
      'textarea.value must work regardless of assignment order (flag before data)',
    )

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('children prop update must render as HTML, not textContent', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-children-html`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Wrapper = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Wrapper extends Component {
          template(props) {
            return (
              <div class="wrapper">
                <div class="body">{props.children}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/Wrapper.jsx',
      'Wrapper',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Wrapper from './Wrapper'

        export default class Parent extends Component {
          count = 0

          template() {
            return (
              <div class="parent">
                <Wrapper>
                  <span class="inner">Count: {this.count}</span>
                </Wrapper>
              </div>
            )
          }
        }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Wrapper },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const body = view.el.querySelector('.body')
    assert.ok(body, '.body element must exist')
    assert.ok(body!.querySelector('.inner'), 'children must render as HTML elements, not text')
    assert.ok(body!.querySelector('.inner')!.textContent!.includes('Count: 0'), 'initial children content')

    view.count = 1
    await flushMicrotasks()

    assert.ok(
      body!.querySelector('.inner'),
      'after state change, children must still be rendered as HTML (not raw text)',
    )
    assert.ok(body!.querySelector('.inner')!.textContent!.includes('Count: 1'), 'children must reflect updated state')
    assert.ok(!body!.textContent!.includes('<span'), 'body must NOT contain raw HTML tags as text (textContent leak)')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional slot index mismatch: local-var conditional must not be toggled by this.xxx conditional', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-index`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class ItemStore extends Store {
      item = { description: 'A real description' }
    }

    const itemStore = new ItemStore()

    const Panel = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Panel extends Component {
          openDropdown = null

          template() {
            const item = itemStore.item
            const desc = item.description || ''

            return (
              <div class="panel">
                <div class="left">
                  {desc && <div class="desc">{desc}</div>}
                  {!desc && <p class="no-desc">No description</p>}
                </div>
                <div class="right">
                  {this.openDropdown && <div class="overlay">overlay</div>}
                  {this.openDropdown === 'status' && <div class="dropdown">dropdown</div>}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/Panel.jsx',
      'Panel',
      { Component, itemStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new Panel()
    comp.render(root)
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.desc'), 'description must be visible initially')
    assert.ok(!comp.el.querySelector('.no-desc'), 'placeholder must be hidden initially')
    assert.ok(!comp.el.querySelector('.overlay'), 'overlay must be hidden initially')
    assert.ok(!comp.el.querySelector('.dropdown'), 'dropdown must be hidden initially')

    comp.openDropdown = 'status'
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.overlay'), 'overlay must appear when dropdown opens')
    assert.ok(comp.el.querySelector('.dropdown'), 'dropdown must appear when dropdown opens')
    assert.ok(
      comp.el.querySelector('.desc'),
      'description must STILL be visible after opening dropdown (slot index mismatch bug)',
    )

    comp.openDropdown = null
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.overlay'), 'overlay must disappear when dropdown closes')
    assert.ok(!comp.el.querySelector('.dropdown'), 'dropdown must disappear when dropdown closes')
    assert.ok(comp.el.querySelector('.desc'), 'description must STILL be visible after closing dropdown (toggle bug)')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('Link child component must not collide with native <link> tag', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-link-child`
    const [{ default: Component }] = await Promise.all([import(`../../gea/src/lib/base/component.tsx?${seed}`)])
    const { default: Link } = await import(`../../gea/src/lib/router/link.ts?${seed}`)

    const Parent = await compileJsxComponent(
      `
        import { Component, Link } from '@geajs/core'

        export default class Parent extends Component {
          template() {
            return (
              <div class="parent">
                <Link to="/target" class="nav-link">
                  <span class="inner">Target</span>
                </Link>
              </div>
            )
          }
        }
      `,
      '/virtual/ParentWithLink.jsx',
      'Parent',
      { Component, Link },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const anchor = view.el.querySelector('a.nav-link') as HTMLAnchorElement | null
    assert.ok(anchor, 'Link child component must instantiate into an <a> element')
    assert.equal(anchor.getAttribute('href'), '/target')
    assert.equal(anchor.querySelector('.inner')?.textContent, 'Target')
    assert.equal(view.el.querySelector('link'), null, 'raw native <link> tag must not remain in DOM')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('nested Link inside unresolved .map() item preserves children content', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-nested-link-map`
    const [{ default: Component }] = await Promise.all([import(`../../gea/src/lib/base/component.tsx?${seed}`)])
    const { default: Link } = await import(`../../gea/src/lib/router/link.ts?${seed}`)

    const Parent = await compileJsxComponent(
      `
        import { Component, Link } from '@geajs/core'

        export default class Parent extends Component {
          items = [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }]

          template() {
            return (
              <div class="results">
                {this.items.map((item) => (
                  <div key={item.id} class="row">
                    <Link to={\`/items/\${item.id}\`} class="row-link">
                      <span class="title">{item.title}</span>
                    </Link>
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentWithNestedLinkMap.jsx',
      'Parent',
      { Component, Link },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const links = Array.from(view.el.querySelectorAll('a.row-link')) as HTMLAnchorElement[]
    assert.equal(links.length, 2, 'expected both Link components to mount as anchors')
    assert.equal(links[0]?.getAttribute('href'), '/items/1')
    assert.equal(links[1]?.getAttribute('href'), '/items/2')
    assert.equal(links[0]?.querySelector('.title')?.textContent, 'First', 'first nested Link must keep children')
    assert.equal(links[1]?.querySelector('.title')?.textContent, 'Second', 'second nested Link must keep children')
    assert.equal(view.el.querySelector('gea-link'), null, 'raw gea-link placeholder must not remain')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('dialog progress bar must update when local edit state changes (time tracking)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-tracking-bar`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const Wrapper = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Wrapper extends Component {
          template(props) {
            return (
              <div class="wrapper">
                <div class="body">{props.children}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/Wrapper.jsx',
      'Wrapper',
      { Component },
    )

    function getTrackingPercent(spent: number, remaining: number) {
      const total = spent + remaining
      return total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
    }

    const TrackingEditor = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Wrapper from './Wrapper'

        function getTrackingPercent(spent, remaining) {
          const total = spent + remaining
          return total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
        }

        export default class TrackingEditor extends Component {
          editTimeSpent = 2
          editTimeRemaining = 4

          template() {
            return (
              <div class="editor">
                <Wrapper>
                  <div class="tracking-bar-fill" style={\`width:\${getTrackingPercent(this.editTimeSpent, this.editTimeRemaining)}%\`}></div>
                  <span class="spent-label">{this.editTimeSpent}h logged</span>
                </Wrapper>
                <input
                  class="time-input"
                  type="number"
                  value={this.editTimeSpent}
                  input={(e) => { this.editTimeSpent = Number(e.target.value) || 0 }}
                />
              </div>
            )
          }
        }
      `,
      '/virtual/TrackingEditor.jsx',
      'TrackingEditor',
      { Component, Wrapper, getTrackingPercent },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new TrackingEditor()
    view.render(root)
    await flushMicrotasks()

    const bar = view.el.querySelector('.tracking-bar-fill')
    assert.ok(bar, 'progress bar must exist')
    assert.equal(bar!.style.width, '33%', 'initial bar: 2/(2+4)=33%')

    view.editTimeSpent = 6
    await flushMicrotasks()

    const barAfter = view.el.querySelector('.tracking-bar-fill')
    assert.ok(barAfter, 'progress bar must still exist after state change')
    assert.equal(barAfter!.style.width, '60%', 'bar must update to 6/(6+4)=60% after local state change')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('inner conditional inside slot content must not steal later slots (priority/reporter mismatch)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-inner-cond-steal`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class ItemStore extends Store {
      item = { status: 'backlog', priority: '3', reporterId: 'u1' }
      users = [
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ]
    }

    const itemStore = new ItemStore()

    const Detail = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Detail extends Component {
          openDropdown = null

          template() {
            const item = itemStore.item
            const users = itemStore.users
            const reporter = users.find(u => u.id === item.reporterId)

            return (
              <div class="detail">
                {this.openDropdown && <div class="overlay">overlay</div>}

                <div class="field field-assignees">
                  <button class="btn-assignees" click={() => { this.openDropdown = this.openDropdown === 'assignees' ? null : 'assignees' }}>Assignees</button>
                  {this.openDropdown === 'assignees' && (
                    <div class="dropdown-assignees">
                      {users.map(u => <div key={u.id} class="user-option">{u.name}</div>)}
                      {users.filter(u => u.id === 'nobody').length === 0 && <div class="no-match">No match</div>}
                    </div>
                  )}
                </div>

                <div class="field field-reporter">
                  <span class="reporter-name">{reporter ? reporter.name : 'Unassigned'}</span>
                  <button class="btn-reporter" click={() => { this.openDropdown = this.openDropdown === 'reporter' ? null : 'reporter' }}>Reporter</button>
                  {this.openDropdown === 'reporter' && (
                    <div class="dropdown-reporter">
                      {users.map(u => <div key={u.id} class="reporter-option">{u.name}</div>)}
                    </div>
                  )}
                </div>

                <div class="field field-priority">
                  <button class="btn-priority" click={() => { this.openDropdown = this.openDropdown === 'priority' ? null : 'priority' }}>Priority</button>
                  {this.openDropdown === 'priority' && (
                    <div class="dropdown-priority">
                      <div class="priority-option">High</div>
                      <div class="priority-option">Low</div>
                    </div>
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/Detail.jsx',
      'Detail',
      { Component, itemStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new Detail()
    comp.render(root)
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.overlay'), 'overlay hidden initially')
    assert.ok(!comp.el.querySelector('.dropdown-assignees'), 'assignees dropdown hidden initially')
    assert.ok(!comp.el.querySelector('.dropdown-reporter'), 'reporter dropdown hidden initially')
    assert.ok(!comp.el.querySelector('.dropdown-priority'), 'priority dropdown hidden initially')

    comp.openDropdown = 'reporter'
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.overlay'), 'overlay must appear for reporter')
    assert.ok(comp.el.querySelector('.dropdown-reporter'), 'reporter dropdown must open')
    assert.ok(!comp.el.querySelector('.dropdown-assignees'), 'assignees dropdown must stay closed')
    assert.ok(!comp.el.querySelector('.dropdown-priority'), 'priority dropdown must stay closed')

    comp.openDropdown = null
    await flushMicrotasks()

    comp.openDropdown = 'priority'
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.overlay'), 'overlay must appear for priority')
    assert.ok(
      comp.el.querySelector('.dropdown-priority'),
      'priority dropdown must open (not reporter — inner conditional must not steal slots)',
    )
    assert.ok(!comp.el.querySelector('.dropdown-reporter'), 'reporter dropdown must stay closed when priority opens')
    assert.ok(!comp.el.querySelector('.dropdown-assignees'), 'assignees dropdown must stay closed when priority opens')

    comp.openDropdown = null
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.dropdown-priority'), 'priority dropdown closes')
    assert.ok(!comp.el.querySelector('.dropdown-reporter'), 'reporter dropdown stays closed')
    assert.ok(!comp.el.querySelector('.overlay'), 'overlay hidden after close')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('store nested field change via destructured local must update DOM (status badge pattern)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-nested-store-field`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class ItemStore extends Store {
      issue = { status: 'backlog', priority: '3' }
    }

    const itemStore = new ItemStore()

    const Badge = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import itemStore from './item-store'

        const StatusCopy = { backlog: 'Backlog', selected: 'Selected', inprogress: 'In progress', done: 'Done' }

        export default class Badge extends Component {
          template() {
            const issue = itemStore.issue
            const issueStatus = issue.status || 'backlog'

            return (
              <div class="badge">
                <span class="status-text">{(StatusCopy[issueStatus] || 'Backlog').toUpperCase()}</span>
                <span class="priority-text">{issue.priority}</span>
              </div>
            )
          }
        }
      `,
      '/virtual/Badge.jsx',
      'Badge',
      { Component, itemStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new Badge()
    comp.render(root)
    await flushMicrotasks()

    assert.equal(comp.el.querySelector('.status-text')!.textContent, 'BACKLOG', 'initial status must be BACKLOG')
    assert.equal(comp.el.querySelector('.priority-text')!.textContent, '3', 'initial priority must be 3')

    itemStore.issue.status = 'done'
    await flushMicrotasks()

    assert.equal(
      comp.el.querySelector('.status-text')!.textContent,
      'DONE',
      'status must update to DONE after store change',
    )

    itemStore.issue.priority = '1'
    await flushMicrotasks()

    assert.equal(
      comp.el.querySelector('.priority-text')!.textContent,
      '1',
      'priority must update to 1 after store change',
    )

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('text binding in mixed-content element must not destroy sibling elements', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-mixed-content-text`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class BadgeStore extends Store {
      status = 'backlog'
    }

    const badgeStore = new BadgeStore()

    const Badge = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import badgeStore from './badge-store'

        const StatusCopy = { backlog: 'Backlog', done: 'Done', inprogress: 'In Progress' }

        export default class Badge extends Component {
          template() {
            const status = badgeStore.status
            return (
              <div class="wrapper">
                <button class="status-badge">
                  {(StatusCopy[status] || 'Backlog').toUpperCase()}
                  <span class="arrow">▼</span>
                </button>
              </div>
            )
          }
        }
      `,
      '/virtual/Badge.jsx',
      'Badge',
      { Component, badgeStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new Badge()
    comp.render(root)
    await flushMicrotasks()

    const btn = comp.el.querySelector('.status-badge')!
    const arrow = btn.querySelector('.arrow')
    assert.ok(arrow, 'arrow span must exist initially')
    assert.ok(btn.textContent!.includes('BACKLOG'), 'initial text must be BACKLOG')

    badgeStore.status = 'done'
    await flushMicrotasks()

    const arrowAfter = btn.querySelector('.arrow')
    assert.ok(arrowAfter, 'arrow span must survive text update')
    assert.equal(arrowAfter!.textContent, '▼', 'arrow content must be preserved')
    assert.ok(btn.textContent!.includes('DONE'), 'text must update to DONE')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('destructured store field update must not destroy sibling child components (IssueDetails pattern)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-issue-details-pattern`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class DetailStore extends Store {
      issue: any = {
        id: '1',
        status: 'backlog',
        priority: '3',
        title: 'Test issue',
        comments: [{ id: 'c1', body: 'Hello' }],
      }
      isLoading = false
      updateIssue(fields: any) {
        Object.assign(this.issue, fields)
      }
    }

    const detailStore = new DetailStore()

    const CommentComp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CommentComp extends Component {
          template({ body }) {
            return <div class="comment">{body}</div>
          }
        }
      `,
      '/virtual/CommentComp.jsx',
      'CommentComp',
      { Component },
    )

    const IssueDetail = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import detailStore from './detail-store'
        import CommentComp from './CommentComp.jsx'

        const StatusCopy = { backlog: 'Backlog', done: 'Done' }

        export default class IssueDetail extends Component {
          openDropdown = null

          toggleDropdown(name) {
            this.openDropdown = this.openDropdown === name ? null : name
          }

          template() {
            const { issue } = detailStore
            const issueStatus = issue.status || 'backlog'

            return (
              <div class="detail">
                <div class="left">
                  <h2 class="title-text">{issue.title}</h2>
                  <div class="comments-section">
                    {issue.comments && issue.comments.map(c => (
                      <CommentComp key={c.id} body={c.body} />
                    ))}
                  </div>
                </div>
                <div class="right">
                  <div class="field">
                    <span class="status-label">{(StatusCopy[issueStatus] || 'Backlog').toUpperCase()}</span>
                    <button class="status-btn" click={() => this.toggleDropdown('status')}>Toggle</button>
                    {this.openDropdown === 'status' && (
                      <div class="dropdown">
                        <div class="opt" click={() => { detailStore.updateIssue({ status: 'done' }); this.openDropdown = null }}>Done</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/IssueDetail.jsx',
      'IssueDetail',
      { Component, detailStore, CommentComp },
    )

    Component._register(CommentComp)

    const root = document.createElement('div')
    document.body.appendChild(root)
    const comp = new IssueDetail()
    comp.render(root)
    await flushMicrotasks()

    assert.equal(comp.el.querySelector('.status-label')!.textContent, 'BACKLOG', 'initial status')
    assert.equal(comp.el.querySelectorAll('.comment').length, 1, 'comment rendered initially')
    assert.equal(comp.el.querySelector('.comment')!.textContent, 'Hello', 'comment body')

    detailStore.updateIssue({ status: 'done' })
    await flushMicrotasks()

    assert.equal(comp.el.querySelector('.status-label')!.textContent, 'DONE', 'status must update to DONE')
    assert.equal(comp.el.querySelectorAll('.comment').length, 1, 'comment must survive status update')
    assert.equal(comp.el.querySelector('.comment')!.textContent, 'Hello', 'comment body preserved')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('real IssueDetails: clicking status dropdown option updates badge and preserves comments', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-real-issue-details`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    // --- Fake stores matching the real store shapes ---

    class FakeIssueStore extends Store {
      issue: any = null
      isLoading = false
      fetchIssue(_id: string) {
        // no-op in test — we set data directly
      }
      updateIssue(fields: any) {
        if (!this.issue) return
        Object.assign(this.issue, fields)
      }
    }
    const issueStore = new FakeIssueStore()
    issueStore.issue = {
      id: 'ISS-42',
      title: 'Fix login flow',
      description: 'The login is broken',
      type: 'task',
      status: 'backlog',
      priority: '3',
      estimate: 8,
      userIds: ['u1'],
      reporterId: 'u1',
      timeSpent: 2,
      timeRemaining: 6,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [
        { id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() },
        { id: 'c2', body: 'Second comment', userId: 'u2', createdAt: new Date().toISOString() },
      ],
    }

    class FakeProjectStore extends Store {
      project: any = null
      isLoading = false
      updateLocalProjectIssues() {}
      deleteIssue() {}
    }
    const projectStore = new FakeProjectStore()
    projectStore.project = {
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
      ],
      issues: [],
    }

    const toastStore = { success() {}, error() {} }

    const IssueType = { TASK: 'task', BUG: 'bug', STORY: 'story' }
    const IssueStatus = { BACKLOG: 'backlog', SELECTED: 'selected', INPROGRESS: 'inprogress', DONE: 'done' }
    const IssuePriority = { HIGHEST: '5', HIGH: '4', MEDIUM: '3', LOW: '2', LOWEST: '1' }
    const IssueTypeCopy: Record<string, string> = { task: 'Task', bug: 'Bug', story: 'Story' }
    const IssueStatusCopy: Record<string, string> = {
      backlog: 'Backlog',
      selected: 'Selected for development',
      inprogress: 'In progress',
      done: 'Done',
    }
    const IssuePriorityCopy: Record<string, string> = {
      '5': 'Highest',
      '4': 'High',
      '3': 'Medium',
      '2': 'Low',
      '1': 'Lowest',
    }

    function formatDateTimeConversational() {
      return 'a few seconds ago'
    }

    // --- Stub child components (compiled through the plugin so they're proper Gea components) ---

    const stubDir = join(__dirname, 'fixtures')

    const Icon = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Icon extends Component { template({ type }) { return <span class="icon-stub"></span> } }`,
      join(stubDir, 'Icon.jsx'),
      'Icon',
      { Component },
    )
    const IssueTypeIcon = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class IssueTypeIcon extends Component { template() { return <span class="issue-type-icon"></span> } }`,
      join(stubDir, 'IssueTypeIcon.jsx'),
      'IssueTypeIcon',
      { Component },
    )
    const IssuePriorityIcon = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class IssuePriorityIcon extends Component { template() { return <span class="priority-icon"></span> } }`,
      join(stubDir, 'IssuePriorityIcon.jsx'),
      'IssuePriorityIcon',
      { Component },
    )
    const Spinner = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Spinner extends Component { template() { return <span class="spinner"></span> } }`,
      join(stubDir, 'Spinner.jsx'),
      'Spinner',
      { Component },
    )
    const CommentCreate = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class CommentCreate extends Component { template() { return <div class="comment-create-stub"></div> } }`,
      join(stubDir, 'CommentCreate.jsx'),
      'CommentCreate',
      { Component },
    )
    const CommentItem = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class CommentItem extends Component { template({ body }) { return <div class="comment-item">{body}</div> } }`,
      join(stubDir, 'CommentItem.jsx'),
      'CommentItem',
      { Component },
    )
    const Button = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Button extends Component { template() { return <button class="btn"><slot /></button> } }`,
      join(stubDir, 'Button.jsx'),
      'Button',
      { Component },
    )
    const Dialog = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Dialog extends Component { template() { return <div class="dialog"><slot /></div> } }`,
      join(stubDir, 'Dialog.jsx'),
      'Dialog',
      { Component },
    )

    // --- The REAL IssueDetails source (verbatim from the app) ---

    const issueDetailsSource = `
import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import projectStore from '../stores/project-store'
import toastStore from '../stores/toast-store'
import { IssueTypeCopy, IssueStatus, IssueStatusCopy, IssuePriority, IssuePriorityCopy } from '../constants/issues'
import { formatDateTimeConversational } from '../utils/dateTime'
import { Button, Dialog } from '@geajs/ui'
import Icon from '../components/Icon'
import IssueTypeIcon from '../components/IssueTypeIcon'
import IssuePriorityIcon from '../components/IssuePriorityIcon'
import Spinner from '../components/Spinner'
import CommentCreate from './CommentCreate'
import CommentItem from './CommentItem'

function getTrackingPercent(spent, remaining) {
  const total = spent + remaining
  return total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
}

const statusOptions = Object.values(IssueStatus).map((s) => ({ value: s, label: IssueStatusCopy[s] }))
const priorityOptions = Object.values(IssuePriority).map((p) => ({ value: p, label: IssuePriorityCopy[p] }))

const statusColors = {
  backlog: { bg: 'var(--color-bg-medium)', color: 'var(--color-text-darkest)' },
  selected: { bg: 'var(--color-bg-light-primary)', color: 'var(--color-primary)' },
  inprogress: { bg: 'var(--color-primary)', color: '#fff' },
  done: { bg: 'var(--color-success)', color: '#fff' },
}

export default class IssueDetails extends Component {
  isEditingTitle = false
  editTitle = ''
  confirmingDelete = false
  isEditingTracking = false
  editTimeSpent = 0
  editTimeRemaining = 0
  openDropdown = null
  assigneeSearch = ''

  created(props) {
    if (props.issueId) {
      issueStore.fetchIssue(props.issueId)
    }
  }

  startEditTitle() {
    this.editTitle = issueStore.issue?.title || ''
    this.isEditingTitle = true
  }

  saveTitle() {
    this.isEditingTitle = false
    if (this.editTitle.trim() && this.editTitle !== issueStore.issue?.title) {
      issueStore.updateIssue({ title: this.editTitle.trim() })
    }
  }

  toggleDropdown(name) {
    this.openDropdown = this.openDropdown === name ? null : name
    this.assigneeSearch = ''
  }

  closeDropdown() {
    this.openDropdown = null
    this.assigneeSearch = ''
  }

  removeAssignee(userId) {
    const issue = issueStore.issue
    if (!issue) return
    const newIds = (issue.userIds || []).filter((id) => id !== userId)
    issueStore.updateIssue({ userIds: newIds, users: newIds.map((id) => ({ id })) })
  }

  addAssignee(userId) {
    const issue = issueStore.issue
    if (!issue) return
    const currentIds = issue.userIds || []
    if (currentIds.includes(userId)) return
    const newIds = [...currentIds, userId]
    issueStore.updateIssue({ userIds: newIds, users: newIds.map((id) => ({ id })) })
    this.closeDropdown()
  }

  startEditTracking() {
    const issue = issueStore.issue
    this.editTimeSpent = issue?.timeSpent || 0
    this.editTimeRemaining = issue?.timeRemaining || issue?.estimate || 0
    this.isEditingTracking = true
  }

  saveTracking() {
    this.isEditingTracking = false
    issueStore.updateIssue({
      timeSpent: this.editTimeSpent,
      timeRemaining: this.editTimeRemaining,
    })
  }

  handleDeleteIssue() {
    const issue = issueStore.issue
    if (!issue) return
    projectStore.deleteIssue(issue.id)
    this.props.onClose?.()
    toastStore.success('Issue has been successfully deleted.')
  }

  template({ onClose }) {
    const { isLoading, issue } = issueStore
    const project = projectStore.project
    const users = project ? project.users : []

    if (isLoading || !issue) {
      return (
        <div class="issue-details-loader">
          <Spinner size={40} />
        </div>
      )
    }

    const issueTitle = issue.title || ''
    const issueDescription = issue.description || ''
    const issueType = issue.type || 'task'
    const issueStatus = issue.status || 'backlog'
    const issuePriority = issue.priority || '3'
    const issueEstimate = issue.estimate || 0
    const issueUserIds = issue.userIds || []
    const issueReporterId = issue.reporterId || ''
    const timeSpent = issue.timeSpent || 0
    const timeRemaining = issue.timeRemaining || issue.estimate || 0
    const trackPercent = getTrackingPercent(timeSpent, timeRemaining)
    const createdAgo = formatDateTimeConversational(issue.createdAt)
    const updatedAgo = formatDateTimeConversational(issue.updatedAt)
    const reporter = users.find((u) => u.id === issueReporterId)

    return (
      <div class="issue-details">
        <div class="issue-details-top-actions">
          <div class="issue-details-type">
            <IssueTypeIcon type={issueType} size={16} />
            <span class="issue-details-type-label">
              {(IssueTypeCopy[issueType] || 'Task').toUpperCase()}-{issue.id}
            </span>
          </div>
          <div class="issue-details-top-right">
            <button class="issue-details-action-btn">
              <Icon type="feedback" size={14} />
              <span>Give feedback</span>
            </button>
            <button class="issue-details-action-btn">
              <Icon type="link" size={14} />
              <span>Copy link</span>
            </button>
            <button
              class="issue-details-action-btn"
              click={() => {
                this.confirmingDelete = true
              }}
            >
              <Icon type="trash" size={16} />
            </button>
            <button class="issue-details-action-btn" click={onClose}>
              <Icon type="close" size={20} />
            </button>
          </div>
        </div>

        {this.confirmingDelete && (
          <div class="confirm-inline">
            <p>Are you sure you want to delete this issue?</p>
            <div class="confirm-inline-actions">
              <Button variant="destructive" click={() => this.handleDeleteIssue()}>
                Delete
              </Button>
              <Button
                variant="ghost"
                click={() => {
                  this.confirmingDelete = false
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div class="issue-details-body">
          <div class="issue-details-left">
            <div class="issue-details-title">
              {!this.isEditingTitle && (
                <h2 class="issue-title-text" click={() => this.startEditTitle()}>
                  {issueTitle}
                </h2>
              )}
              {this.isEditingTitle && (
                <textarea
                  class="issue-title-input"
                  value={this.editTitle}
                  input={(e) => {
                    this.editTitle = e.target.value
                  }}
                  blur={() => this.saveTitle()}
                  keydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      this.saveTitle()
                    }
                  }}
                ></textarea>
              )}
            </div>

            <div class="issue-details-description">
              <h4 class="issue-details-section-title">Description</h4>
              {issueDescription && <div class="text-edited-content">{issueDescription}</div>}
              {!issueDescription && <p class="issue-description-placeholder">Add a description...</p>}
            </div>

            <div class="issue-details-comments">
              <h4 class="issue-details-section-title">Comments</h4>
              <CommentCreate issueId={issue.id} />
              {issue.comments &&
                issue.comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    commentId={comment.id}
                    body={comment.body}
                    userId={comment.userId}
                    createdAt={comment.createdAt}
                    issueId={issue.id}
                  />
                ))}
            </div>
          </div>

          <div class="issue-details-right">
            {this.openDropdown && <div class="dropdown-overlay" click={() => this.closeDropdown()}></div>}

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Status</label>
              <button
                class="status-badge"
                style={\`background:\${statusColors[issueStatus]?.bg};color:\${statusColors[issueStatus]?.color}\`}
                click={() => this.toggleDropdown('status')}
              >
                {(IssueStatusCopy[issueStatus] || 'Backlog').toUpperCase()}
                <span class="status-badge-arrow">&#x25BC;</span>
              </button>
              {this.openDropdown === 'status' && (
                <div class="custom-dropdown">
                  {statusOptions.map((opt) => (
                    <div
                      key={opt.value}
                      class={\`custom-dropdown-item \${issueStatus === opt.value ? 'active' : ''}\`}
                      click={() => {
                        issueStore.updateIssue({ status: opt.value })
                        this.closeDropdown()
                      }}
                    >
                      <span class="status-dot" style={\`background:\${statusColors[opt.value]?.bg}\`}></span>
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Assignees</label>
              <div class="assignee-chips">
                {issueUserIds.map((uid) => {
                  const u = users.find((usr) => usr.id === uid)
                  if (!u) return null
                  return (
                    <div class="assignee-chip" key={uid}>
                      <img class="assignee-chip-avatar" src={u.avatarUrl} alt={u.name} />
                      <span class="assignee-chip-name">{u.name}</span>
                      <span class="assignee-chip-remove" click={() => this.removeAssignee(uid)}>
                        &times;
                      </span>
                    </div>
                  )
                })}
                <span class="assignee-add-more" click={() => this.toggleDropdown('assignees')}>
                  + Add more
                </span>
              </div>
              {this.openDropdown === 'assignees' && (
                <div class="custom-dropdown">
                  <div class="custom-dropdown-search">
                    <input
                      class="custom-dropdown-search-input"
                      type="text"
                      placeholder="Search"
                      value={this.assigneeSearch}
                      input={(e) => {
                        this.assigneeSearch = e.target.value
                      }}
                    />
                    <span class="custom-dropdown-search-clear" click={() => this.closeDropdown()}>
                      &times;
                    </span>
                  </div>
                  {users
                    .filter(
                      (u) =>
                        !issueUserIds.includes(u.id) &&
                        u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase()),
                    )
                    .map((u) => (
                      <div
                        key={u.id}
                        class="custom-dropdown-item"
                        click={() => {
                          this.addAssignee(u.id)
                        }}
                      >
                        <img class="custom-dropdown-avatar" src={u.avatarUrl} alt={u.name} />
                        <span>{u.name}</span>
                      </div>
                    ))}
                  {users.filter(
                    (u) =>
                      !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase()),
                  ).length === 0 && <div class="custom-dropdown-empty">No users available</div>}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Reporter</label>
              <div class="reporter-display" click={() => this.toggleDropdown('reporter')}>
                {reporter && <img class="reporter-avatar" src={reporter.avatarUrl} alt={reporter.name} />}
                <span class="reporter-name">{reporter ? reporter.name : 'Unassigned'}</span>
              </div>
              {this.openDropdown === 'reporter' && (
                <div class="custom-dropdown">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      class={\`custom-dropdown-item \${issueReporterId === u.id ? 'active' : ''}\`}
                      click={() => {
                        issueStore.updateIssue({ reporterId: u.id })
                        this.closeDropdown()
                      }}
                    >
                      <img class="custom-dropdown-avatar" src={u.avatarUrl} alt={u.name} />
                      <span>{u.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Priority</label>
              <div class="priority-display" click={() => this.toggleDropdown('priority')}>
                <IssuePriorityIcon priority={issuePriority} />
                <span class="priority-name">{IssuePriorityCopy[issuePriority] || 'Medium'}</span>
              </div>
              {this.openDropdown === 'priority' && (
                <div class="custom-dropdown">
                  {priorityOptions.map((opt) => (
                    <div
                      key={opt.value}
                      class={\`custom-dropdown-item \${issuePriority === opt.value ? 'active' : ''}\`}
                      click={() => {
                        issueStore.updateIssue({ priority: opt.value })
                        this.closeDropdown()
                      }}
                    >
                      <IssuePriorityIcon priority={opt.value} />
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field">
              <label class="issue-details-field-label">Original Estimate (hours)</label>
              <input
                class="input"
                type="number"
                value={issueEstimate}
                change={(e) => issueStore.updateIssue({ estimate: Number(e.target.value) || null })}
              />
            </div>

            <div class="issue-details-field">
              <label class="issue-details-field-label">Time Tracking</label>
              <div class="tracking-widget tracking-widget--clickable" click={() => this.startEditTracking()}>
                <div class="tracking-bar-container">
                  <Icon type="stopwatch" size={20} />
                  <div class="tracking-bar">
                    <div class="tracking-bar-fill" style={\`width:\${trackPercent}%\`}></div>
                  </div>
                </div>
                <div class="tracking-values">
                  <span>{timeSpent ? \`\${timeSpent}h logged\` : 'No time logged'}</span>
                  <span>{timeRemaining}h remaining</span>
                </div>
              </div>
              {this.isEditingTracking && (
                <Dialog
                  open={true}
                  onOpenChange={(d) => {
                    if (!d.open) this.isEditingTracking = false
                  }}
                  class="dialog-tracking"
                >
                  <div class="tracking-dialog">
                    <div class="tracking-dialog-header">
                      <h3 class="tracking-dialog-title">Time tracking</h3>
                      <button
                        class="tracking-dialog-close"
                        click={() => {
                          this.isEditingTracking = false
                        }}
                      >
                        <Icon type="close" size={20} />
                      </button>
                    </div>
                    <div class="tracking-bar-container">
                      <Icon type="stopwatch" size={22} />
                      <div class="tracking-bar">
                        <div
                          class="tracking-bar-fill"
                          style={\`width:\${getTrackingPercent(this.editTimeSpent, this.editTimeRemaining)}%\`}
                        ></div>
                      </div>
                    </div>
                    <div class="tracking-values">
                      <span>{this.editTimeSpent ? \`\${this.editTimeSpent}h logged\` : 'No time logged'}</span>
                      <span>{this.editTimeRemaining}h remaining</span>
                    </div>
                    <div class="tracking-edit-fields">
                      <div class="tracking-edit-field">
                        <label class="tracking-edit-label">Time spent (hours)</label>
                        <input
                          class="input"
                          type="number"
                          min="0"
                          value={this.editTimeSpent}
                          input={(e) => {
                            this.editTimeSpent = Number(e.target.value) || 0
                          }}
                        />
                      </div>
                      <div class="tracking-edit-field">
                        <label class="tracking-edit-label">Time remaining (hours)</label>
                        <input
                          class="input"
                          type="number"
                          min="0"
                          value={this.editTimeRemaining}
                          input={(e) => {
                            this.editTimeRemaining = Number(e.target.value) || 0
                          }}
                        />
                      </div>
                    </div>
                    <div class="tracking-edit-actions">
                      <Button variant="default" click={() => this.saveTracking()}>
                        Done
                      </Button>
                    </div>
                  </div>
                </Dialog>
              )}
            </div>

            <div class="issue-details-dates">
              <div class="issue-details-date">Created at {createdAgo}</div>
              <div class="issue-details-date">Updated at {updatedAgo}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
`

    const IssueDetails = await compileJsxComponent(
      issueDetailsSource,
      join(__dirname, 'fixtures', 'IssueDetails.jsx'),
      'IssueDetails',
      {
        Component,
        issueStore,
        projectStore,
        toastStore,
        IssueType,
        IssueTypeCopy,
        IssueStatus,
        IssueStatusCopy,
        IssuePriority,
        IssuePriorityCopy,
        formatDateTimeConversational,
        Button,
        Dialog,
        Icon,
        IssueTypeIcon,
        IssuePriorityIcon,
        Spinner,
        CommentCreate,
        CommentItem,
      },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const comp = new IssueDetails()
    comp.render(root, { issueId: 'ISS-42', onClose: () => {} })
    await flushMicrotasks()

    // --- Initial render assertions ---
    const statusBadge = comp.el.querySelector('.status-badge')
    assert.ok(statusBadge, 'status badge must render')
    assert.ok(
      statusBadge!.textContent!.includes('BACKLOG'),
      `initial status badge must say BACKLOG, got: "${statusBadge!.textContent}"`,
    )

    const commentItems = comp.el.querySelectorAll('comment-item')
    assert.equal(commentItems.length, 2, 'both comments must render initially')
    assert.equal(commentItems[0].getAttribute('data-prop-body'), 'First comment', 'first comment body')
    assert.equal(commentItems[1].getAttribute('data-prop-body'), 'Second comment', 'second comment body')

    const commentCreate = comp.el.querySelector('.comment-create-stub')
    assert.ok(commentCreate, 'CommentCreate must render')

    // --- Click status button to open dropdown ---
    statusBadge!.click()
    await flushMicrotasks()

    const dropdown = comp.el.querySelector('.custom-dropdown')
    assert.ok(dropdown, 'status dropdown must open after click')

    // --- Click "Done" option ---
    const dropdownItems = comp.el.querySelectorAll('.custom-dropdown-item')
    assert.ok(dropdownItems.length > 0, 'dropdown items must exist')

    let doneItem: Element | null = null
    dropdownItems.forEach((item: Element) => {
      if (item.textContent?.includes('Done')) doneItem = item
    })
    assert.ok(doneItem, '"Done" option must exist in dropdown')
    ;(doneItem as unknown as HTMLElement).click()
    await flushMicrotasks()

    // --- After clicking "Done" ---
    assert.equal(issueStore.issue.status, 'done', 'store must have status=done after click')

    const updatedBadge = comp.el.querySelector('.status-badge')
    assert.ok(updatedBadge, 'status badge must still exist after update')
    assert.ok(
      updatedBadge!.textContent!.includes('DONE'),
      `status badge must say DONE after click, got: "${updatedBadge!.textContent}"`,
    )

    const closedDropdown = comp.el.querySelector('.custom-dropdown')
    assert.equal(closedDropdown, null, 'dropdown must close after selection')

    const updatedComments = comp.el.querySelectorAll('comment-item')
    assert.equal(updatedComments.length, 2, 'comments must survive status update')

    const updatedCommentCreate = comp.el.querySelector('.comment-create-stub')
    assert.ok(updatedCommentCreate, 'CommentCreate must survive status update')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('real IssueDetails with real CommentCreate/CommentItem: comments survive status change', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-real-comments`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    // --- Real stores ---

    class FakeProjectStore extends Store {
      project: any = null
      isLoading = false
      updateLocalProjectIssues(issueId: string, fields: any) {
        if (!this.project) return
        const issue = this.project.issues.find((i: any) => i.id === issueId)
        if (issue) Object.assign(issue, fields)
      }
      deleteIssue() {}
    }
    const projectStore = new FakeProjectStore()
    projectStore.project = {
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
      ],
      issues: [{ id: 'ISS-42', status: 'backlog', title: 'Fix login flow' }],
    }

    class FakeIssueStore extends Store {
      issue: any = null
      isLoading = false
      fetchIssue(_id: string) {}
      updateIssue(fields: any) {
        if (!this.issue) return
        Object.assign(this.issue, fields)
        projectStore.updateLocalProjectIssues(this.issue.id, fields)
      }
      async createComment() {}
      async updateComment() {}
      async deleteComment() {}
    }
    const issueStore = new FakeIssueStore()
    issueStore.issue = {
      id: 'ISS-42',
      title: 'Fix login flow',
      description: 'The login is broken',
      type: 'task',
      status: 'backlog',
      priority: '3',
      estimate: 8,
      userIds: ['u1'],
      reporterId: 'u1',
      timeSpent: 2,
      timeRemaining: 6,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
      comments: [
        { id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() },
        { id: 'c2', body: 'Second comment', userId: 'u2', createdAt: new Date().toISOString() },
      ],
    }

    class FakeAuthStore extends Store {
      currentUser: any = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }
    }
    const authStore = new FakeAuthStore()

    const toastStore = { success() {}, error() {} }

    const IssueType = { TASK: 'task', BUG: 'bug', STORY: 'story' }
    const IssueStatus = { BACKLOG: 'backlog', SELECTED: 'selected', INPROGRESS: 'inprogress', DONE: 'done' }
    const IssuePriority = { HIGHEST: '5', HIGH: '4', MEDIUM: '3', LOW: '2', LOWEST: '1' }
    const IssueTypeCopy: Record<string, string> = { task: 'Task', bug: 'Bug', story: 'Story' }
    const IssueStatusCopy: Record<string, string> = {
      backlog: 'Backlog',
      selected: 'Selected for development',
      inprogress: 'In progress',
      done: 'Done',
    }
    const IssuePriorityCopy: Record<string, string> = {
      '5': 'Highest',
      '4': 'High',
      '3': 'Medium',
      '2': 'Low',
      '1': 'Lowest',
    }

    function formatDateTimeConversational() {
      return 'a few seconds ago'
    }

    const stubDir = join(__dirname, 'fixtures')

    // Leaf components that are not relevant to the bug — stub them
    const Icon = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Icon extends Component { template({ type }) { return <span class="icon-stub"></span> } }`,
      join(stubDir, 'Icon.jsx'),
      'Icon',
      { Component },
    )
    const IssueTypeIcon = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class IssueTypeIcon extends Component { template() { return <span class="issue-type-icon"></span> } }`,
      join(stubDir, 'IssueTypeIcon.jsx'),
      'IssueTypeIcon',
      { Component },
    )
    const IssuePriorityIcon = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class IssuePriorityIcon extends Component { template() { return <span class="priority-icon"></span> } }`,
      join(stubDir, 'IssuePriorityIcon.jsx'),
      'IssuePriorityIcon',
      { Component },
    )
    const Spinner = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Spinner extends Component { template() { return <span class="spinner"></span> } }`,
      join(stubDir, 'Spinner.jsx'),
      'Spinner',
      { Component },
    )
    const Avatar = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Avatar extends Component { template(props) { return <span class="avatar-stub">{props.name || ''}</span> } }`,
      join(stubDir, 'Avatar.jsx'),
      'Avatar',
      { Component },
    )
    const Button = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Button extends Component { template() { return <button class="btn"><slot /></button> } }`,
      join(stubDir, 'Button.jsx'),
      'Button',
      { Component },
    )
    const Dialog = await compileJsxComponent(
      `import { Component } from '@geajs/core'\nexport default class Dialog extends Component { template() { return <div class="dialog"><slot /></div> } }`,
      join(stubDir, 'Dialog.jsx'),
      'Dialog',
      { Component },
    )

    // --- REAL CommentCreate (from jira_clone source) ---
    const commentCreateSource = `
import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import authStore from '../stores/auth-store'
import { Avatar, Button } from '@geajs/ui'
import Spinner from '../components/Spinner'

export default class CommentCreate extends Component {
  isFormOpen = false
  body = ''
  isCreating = false

  openForm() {
    if (this.isFormOpen) return
    this.isFormOpen = true
  }

  async handleSubmit() {
    if (!this.body.trim()) return
    this.isCreating = true
    try {
      await issueStore.createComment(this.props.issueId, this.body)
      this.body = ''
      this.isFormOpen = false
    } catch (e) {
      console.error(e)
    } finally {
      this.isCreating = false
    }
  }

  template({ issueId }) {
    const user = authStore.currentUser
    return (
      <div class="comment-create">
        {!this.isFormOpen && (
          <div class="comment-create-collapsed">
            <div class="comment-create-fake" click={() => this.openForm()}>
              <Avatar src={user?.avatarUrl} name={user?.name || ''} class="!h-8 !w-8" />
              <span class="comment-create-placeholder">Add a comment...</span>
            </div>
            <p class="comment-pro-tip">
              <strong>Pro tip:</strong> press <strong>M</strong> to comment
            </p>
          </div>
        )}
        {this.isFormOpen && (
          <div class="comment-create-form">
            <textarea
              class="textarea"
              placeholder="Add a comment..."
              autofocus
              value={this.body}
              input={(e) => { this.body = e.target.value }}
            ></textarea>
            <div class="comment-create-actions">
              <Button variant="default" disabled={this.isCreating} click={() => this.handleSubmit()}>
                {this.isCreating ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="ghost" click={() => { this.isFormOpen = false; this.body = '' }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }
}
`

    const CommentCreate = await compileJsxComponent(
      commentCreateSource,
      join(stubDir, 'CommentCreate.jsx'),
      'CommentCreate',
      { Component, issueStore, authStore, Avatar, Button, Spinner },
    )

    // --- REAL CommentItem (from jira_clone source) ---
    const commentItemSource = `
import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import projectStore from '../stores/project-store'
import { formatDateTimeConversational } from '../utils/dateTime'
import { Avatar, Button } from '@geajs/ui'

export default class CommentItem extends Component {
  isEditing = false
  editBody = ''

  get user() {
    const project = projectStore.project
    const users = project ? project.users : []
    return users.find((u) => u.id === this.props.userId)
  }

  get userName() {
    return this.user ? this.user.name : 'Unknown'
  }

  get userAvatar() {
    return this.user ? this.user.avatarUrl : ''
  }

  get dateText() {
    return formatDateTimeConversational(this.props.createdAt)
  }

  startEditing() {
    this.isEditing = true
    this.editBody = this.props.body || ''
  }

  async saveEdit() {
    if (!this.editBody.trim()) return
    await issueStore.updateComment(this.props.commentId, this.editBody, this.props.issueId)
    this.isEditing = false
  }

  async handleDelete() {
    await issueStore.deleteComment(this.props.commentId, this.props.issueId)
  }

  template({ commentId, body, userId, createdAt, issueId }) {
    return (
      <div class="comment">
        <Avatar src={this.userAvatar} name={this.userName} class="!h-8 !w-8" />
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-user-name">{this.userName}</span>
            <span class="comment-date">{this.dateText}</span>
          </div>
          {!this.isEditing && <div class="comment-body">{body}</div>}
          {this.isEditing && (
            <div class="comment-edit-form">
              <textarea
                class="textarea"
                value={this.editBody}
                input={(e) => { this.editBody = e.target.value }}
              ></textarea>
              <div class="comment-edit-actions">
                <Button variant="default" click={() => this.saveEdit()}>Save</Button>
                <Button variant="ghost" click={() => { this.isEditing = false }}>Cancel</Button>
              </div>
            </div>
          )}
          {!this.isEditing && (
            <div class="comment-actions">
              <span class="comment-action" click={() => this.startEditing()}>Edit</span>
              <span class="comment-action" click={() => this.handleDelete()}>Delete</span>
            </div>
          )}
        </div>
      </div>
    )
  }
}
`

    const CommentItem = await compileJsxComponent(commentItemSource, join(stubDir, 'CommentItem.jsx'), 'CommentItem', {
      Component,
      issueStore,
      projectStore,
      formatDateTimeConversational,
      Avatar,
      Button,
    })

    // --- REAL IssueDetails source ---
    const issueDetailsSource = `
import { Component } from '@geajs/core'
import issueStore from '../stores/issue-store'
import projectStore from '../stores/project-store'
import toastStore from '../stores/toast-store'
import { IssueTypeCopy, IssueStatus, IssueStatusCopy, IssuePriority, IssuePriorityCopy } from '../constants/issues'
import { formatDateTimeConversational } from '../utils/dateTime'
import { Button, Dialog } from '@geajs/ui'
import Icon from '../components/Icon'
import IssueTypeIcon from '../components/IssueTypeIcon'
import IssuePriorityIcon from '../components/IssuePriorityIcon'
import Spinner from '../components/Spinner'
import CommentCreate from './CommentCreate'
import CommentItem from './CommentItem'

function getTrackingPercent(spent, remaining) {
  const total = spent + remaining
  return total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0
}

const statusOptions = Object.values(IssueStatus).map((s) => ({ value: s, label: IssueStatusCopy[s] }))
const priorityOptions = Object.values(IssuePriority).map((p) => ({ value: p, label: IssuePriorityCopy[p] }))

const statusColors = {
  backlog: { bg: 'var(--color-bg-medium)', color: 'var(--color-text-darkest)' },
  selected: { bg: 'var(--color-bg-light-primary)', color: 'var(--color-primary)' },
  inprogress: { bg: 'var(--color-primary)', color: '#fff' },
  done: { bg: 'var(--color-success)', color: '#fff' },
}

export default class IssueDetails extends Component {
  isEditingTitle = false
  editTitle = ''
  confirmingDelete = false
  isEditingTracking = false
  editTimeSpent = 0
  editTimeRemaining = 0
  openDropdown = null
  assigneeSearch = ''

  created(props) {
    if (props.issueId) {
      issueStore.fetchIssue(props.issueId)
    }
  }

  startEditTitle() {
    this.editTitle = issueStore.issue?.title || ''
    this.isEditingTitle = true
  }

  saveTitle() {
    this.isEditingTitle = false
    if (this.editTitle.trim() && this.editTitle !== issueStore.issue?.title) {
      issueStore.updateIssue({ title: this.editTitle.trim() })
    }
  }

  toggleDropdown(name) {
    this.openDropdown = this.openDropdown === name ? null : name
    this.assigneeSearch = ''
  }

  closeDropdown() {
    this.openDropdown = null
    this.assigneeSearch = ''
  }

  removeAssignee(userId) {
    const issue = issueStore.issue
    if (!issue) return
    const newIds = (issue.userIds || []).filter((id) => id !== userId)
    issueStore.updateIssue({ userIds: newIds, users: newIds.map((id) => ({ id })) })
  }

  addAssignee(userId) {
    const issue = issueStore.issue
    if (!issue) return
    const currentIds = issue.userIds || []
    if (currentIds.includes(userId)) return
    const newIds = [...currentIds, userId]
    issueStore.updateIssue({ userIds: newIds, users: newIds.map((id) => ({ id })) })
    this.closeDropdown()
  }

  startEditTracking() {
    const issue = issueStore.issue
    this.editTimeSpent = issue?.timeSpent || 0
    this.editTimeRemaining = issue?.timeRemaining || issue?.estimate || 0
    this.isEditingTracking = true
  }

  saveTracking() {
    this.isEditingTracking = false
    issueStore.updateIssue({
      timeSpent: this.editTimeSpent,
      timeRemaining: this.editTimeRemaining,
    })
  }

  handleDeleteIssue() {
    const issue = issueStore.issue
    if (!issue) return
    projectStore.deleteIssue(issue.id)
    this.props.onClose?.()
    toastStore.success('Issue has been successfully deleted.')
  }

  template({ onClose }) {
    const { isLoading, issue } = issueStore
    const project = projectStore.project
    const users = project ? project.users : []

    if (isLoading || !issue) {
      return (
        <div class="issue-details-loader">
          <Spinner size={40} />
        </div>
      )
    }

    const issueTitle = issue.title || ''
    const issueDescription = issue.description || ''
    const issueType = issue.type || 'task'
    const issueStatus = issue.status || 'backlog'
    const issuePriority = issue.priority || '3'
    const issueEstimate = issue.estimate || 0
    const issueUserIds = issue.userIds || []
    const issueReporterId = issue.reporterId || ''
    const timeSpent = issue.timeSpent || 0
    const timeRemaining = issue.timeRemaining || issue.estimate || 0
    const trackPercent = getTrackingPercent(timeSpent, timeRemaining)
    const createdAgo = formatDateTimeConversational(issue.createdAt)
    const updatedAgo = formatDateTimeConversational(issue.updatedAt)
    const reporter = users.find((u) => u.id === issueReporterId)

    return (
      <div class="issue-details">
        <div class="issue-details-top-actions">
          <div class="issue-details-type">
            <IssueTypeIcon type={issueType} size={16} />
            <span class="issue-details-type-label">
              {(IssueTypeCopy[issueType] || 'Task').toUpperCase()}-{issue.id}
            </span>
          </div>
          <div class="issue-details-top-right">
            <button class="issue-details-action-btn">
              <Icon type="feedback" size={14} />
              <span>Give feedback</span>
            </button>
            <button class="issue-details-action-btn">
              <Icon type="link" size={14} />
              <span>Copy link</span>
            </button>
            <button class="issue-details-action-btn" click={() => { this.confirmingDelete = true }}>
              <Icon type="trash" size={16} />
            </button>
            <button class="issue-details-action-btn" click={onClose}>
              <Icon type="close" size={20} />
            </button>
          </div>
        </div>

        {this.confirmingDelete && (
          <div class="confirm-inline">
            <p>Are you sure you want to delete this issue?</p>
            <div class="confirm-inline-actions">
              <Button variant="destructive" click={() => this.handleDeleteIssue()}>Delete</Button>
              <Button variant="ghost" click={() => { this.confirmingDelete = false }}>Cancel</Button>
            </div>
          </div>
        )}

        <div class="issue-details-body">
          <div class="issue-details-left">
            <div class="issue-details-title">
              {!this.isEditingTitle && (
                <h2 class="issue-title-text" click={() => this.startEditTitle()}>{issueTitle}</h2>
              )}
              {this.isEditingTitle && (
                <textarea
                  class="issue-title-input"
                  value={this.editTitle}
                  input={(e) => { this.editTitle = e.target.value }}
                  blur={() => this.saveTitle()}
                  keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); this.saveTitle() } }}
                ></textarea>
              )}
            </div>

            <div class="issue-details-description">
              <h4 class="issue-details-section-title">Description</h4>
              {issueDescription && <div class="text-edited-content">{issueDescription}</div>}
              {!issueDescription && <p class="issue-description-placeholder">Add a description...</p>}
            </div>

            <div class="issue-details-comments">
              <h4 class="issue-details-section-title">Comments</h4>
              <CommentCreate issueId={issue.id} />
              {issue.comments && issue.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  commentId={comment.id}
                  body={comment.body}
                  userId={comment.userId}
                  createdAt={comment.createdAt}
                  issueId={issue.id}
                />
              ))}
            </div>
          </div>

          <div class="issue-details-right">
            {this.openDropdown && <div class="dropdown-overlay" click={() => this.closeDropdown()}></div>}

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Status</label>
              <button
                class="status-badge"
                style={\`background:\${statusColors[issueStatus]?.bg};color:\${statusColors[issueStatus]?.color}\`}
                click={() => this.toggleDropdown('status')}
              >
                {(IssueStatusCopy[issueStatus] || 'Backlog').toUpperCase()}
                <span class="status-badge-arrow">&#x25BC;</span>
              </button>
              {this.openDropdown === 'status' && (
                <div class="custom-dropdown">
                  {statusOptions.map((opt) => (
                    <div
                      key={opt.value}
                      class={\`custom-dropdown-item \${issueStatus === opt.value ? 'active' : ''}\`}
                      click={() => { issueStore.updateIssue({ status: opt.value }); this.closeDropdown() }}
                    >
                      <span class="status-dot" style={\`background:\${statusColors[opt.value]?.bg}\`}></span>
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Assignees</label>
              <div class="assignee-chips">
                {issueUserIds.map((uid) => {
                  const u = users.find((usr) => usr.id === uid)
                  if (!u) return null
                  return (
                    <div class="assignee-chip" key={uid}>
                      <img class="assignee-chip-avatar" src={u.avatarUrl} alt={u.name} />
                      <span class="assignee-chip-name">{u.name}</span>
                      <span class="assignee-chip-remove" click={() => this.removeAssignee(uid)}>&times;</span>
                    </div>
                  )
                })}
                <span class="assignee-add-more" click={() => this.toggleDropdown('assignees')}>+ Add more</span>
              </div>
              {this.openDropdown === 'assignees' && (
                <div class="custom-dropdown">
                  <div class="custom-dropdown-search">
                    <input
                      class="custom-dropdown-search-input"
                      type="text"
                      placeholder="Search"
                      value={this.assigneeSearch}
                      input={(e) => { this.assigneeSearch = e.target.value }}
                    />
                    <span class="custom-dropdown-search-clear" click={() => this.closeDropdown()}>&times;</span>
                  </div>
                  {users
                    .filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase()))
                    .map((u) => (
                      <div key={u.id} class="custom-dropdown-item" click={() => { this.addAssignee(u.id) }}>
                        <img class="custom-dropdown-avatar" src={u.avatarUrl} alt={u.name} />
                        <span>{u.name}</span>
                      </div>
                    ))}
                  {users.filter((u) => !issueUserIds.includes(u.id) && u.name.toLowerCase().includes(this.assigneeSearch.toLowerCase())).length === 0 && (
                    <div class="custom-dropdown-empty">No users available</div>
                  )}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Reporter</label>
              <div class="reporter-display" click={() => this.toggleDropdown('reporter')}>
                {reporter && <img class="reporter-avatar" src={reporter.avatarUrl} alt={reporter.name} />}
                <span class="reporter-name">{reporter ? reporter.name : 'Unassigned'}</span>
              </div>
              {this.openDropdown === 'reporter' && (
                <div class="custom-dropdown">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      class={\`custom-dropdown-item \${issueReporterId === u.id ? 'active' : ''}\`}
                      click={() => { issueStore.updateIssue({ reporterId: u.id }); this.closeDropdown() }}
                    >
                      <img class="custom-dropdown-avatar" src={u.avatarUrl} alt={u.name} />
                      <span>{u.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field issue-details-field--relative">
              <label class="issue-details-field-label">Priority</label>
              <div class="priority-display" click={() => this.toggleDropdown('priority')}>
                <IssuePriorityIcon priority={issuePriority} />
                <span class="priority-name">{IssuePriorityCopy[issuePriority] || 'Medium'}</span>
              </div>
              {this.openDropdown === 'priority' && (
                <div class="custom-dropdown">
                  {priorityOptions.map((opt) => (
                    <div
                      key={opt.value}
                      class={\`custom-dropdown-item \${issuePriority === opt.value ? 'active' : ''}\`}
                      click={() => { issueStore.updateIssue({ priority: opt.value }); this.closeDropdown() }}
                    >
                      <IssuePriorityIcon priority={opt.value} />
                      <span>{opt.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div class="issue-details-field">
              <label class="issue-details-field-label">Original Estimate (hours)</label>
              <input
                class="input"
                type="number"
                value={issueEstimate}
                change={(e) => issueStore.updateIssue({ estimate: Number(e.target.value) || null })}
              />
            </div>

            <div class="issue-details-field">
              <label class="issue-details-field-label">Time Tracking</label>
              <div class="tracking-widget tracking-widget--clickable" click={() => this.startEditTracking()}>
                <div class="tracking-bar-container">
                  <Icon type="stopwatch" size={20} />
                  <div class="tracking-bar">
                    <div class="tracking-bar-fill" style={\`width:\${trackPercent}%\`}></div>
                  </div>
                </div>
                <div class="tracking-values">
                  <span>{timeSpent ? \`\${timeSpent}h logged\` : 'No time logged'}</span>
                  <span>{timeRemaining}h remaining</span>
                </div>
              </div>
              {this.isEditingTracking && (
                <Dialog open={true} onOpenChange={(d) => { if (!d.open) this.isEditingTracking = false }} class="dialog-tracking">
                  <div class="tracking-dialog">
                    <div class="tracking-dialog-header">
                      <h3 class="tracking-dialog-title">Time tracking</h3>
                      <button class="tracking-dialog-close" click={() => { this.isEditingTracking = false }}>
                        <Icon type="close" size={20} />
                      </button>
                    </div>
                    <div class="tracking-bar-container">
                      <Icon type="stopwatch" size={22} />
                      <div class="tracking-bar">
                        <div class="tracking-bar-fill" style={\`width:\${getTrackingPercent(this.editTimeSpent, this.editTimeRemaining)}%\`}></div>
                      </div>
                    </div>
                    <div class="tracking-values">
                      <span>{this.editTimeSpent ? \`\${this.editTimeSpent}h logged\` : 'No time logged'}</span>
                      <span>{this.editTimeRemaining}h remaining</span>
                    </div>
                    <div class="tracking-edit-fields">
                      <div class="tracking-edit-field">
                        <label class="tracking-edit-label">Time spent (hours)</label>
                        <input class="input" type="number" min="0" value={this.editTimeSpent} input={(e) => { this.editTimeSpent = Number(e.target.value) || 0 }} />
                      </div>
                      <div class="tracking-edit-field">
                        <label class="tracking-edit-label">Time remaining (hours)</label>
                        <input class="input" type="number" min="0" value={this.editTimeRemaining} input={(e) => { this.editTimeRemaining = Number(e.target.value) || 0 }} />
                      </div>
                    </div>
                    <div class="tracking-edit-actions">
                      <Button variant="default" click={() => this.saveTracking()}>Done</Button>
                    </div>
                  </div>
                </Dialog>
              )}
            </div>

            <div class="issue-details-dates">
              <div class="issue-details-date">Created at {createdAgo}</div>
              <div class="issue-details-date">Updated at {updatedAgo}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
`

    const IssueDetails = await compileJsxComponent(
      issueDetailsSource,
      join(stubDir, 'IssueDetails.jsx'),
      'IssueDetails',
      {
        Component,
        issueStore,
        projectStore,
        toastStore,
        IssueType,
        IssueTypeCopy,
        IssueStatus,
        IssueStatusCopy,
        IssuePriority,
        IssuePriorityCopy,
        formatDateTimeConversational,
        Button,
        Dialog,
        Icon,
        IssueTypeIcon,
        IssuePriorityIcon,
        Spinner,
        CommentCreate,
        CommentItem,
      },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const comp = new IssueDetails()
    comp.render(root, { issueId: 'ISS-42', onClose: () => {} })
    await flushMicrotasks()

    // ====================================================================
    // ISSUE 1: Assignees section must show chips when userIds populated
    // ====================================================================
    const assigneeChips = comp.el.querySelectorAll('.assignee-chip')
    assert.equal(assigneeChips.length, 1, `assignees must show 1 chip for userIds=['u1'], got ${assigneeChips.length}`)
    const chipName = comp.el.querySelector('.assignee-chip-name')
    assert.ok(chipName, 'assignee chip must have a name element')
    assert.equal(chipName!.textContent, 'Alice', 'assignee chip must show Alice')

    // ====================================================================
    // ISSUE 2: Changing reporter must not remove comments section
    // ====================================================================

    // First verify comments are present
    const commentCreate = comp.el.querySelector('.comment-create')
    assert.ok(commentCreate, 'real CommentCreate must render initially')
    const commentItems = comp.el.querySelectorAll('comment-item')
    assert.equal(commentItems.length, 2, 'both real CommentItems must render initially')

    // Open reporter dropdown and pick Bob
    const reporterDisplay = comp.el.querySelector('.reporter-display')!
    assert.ok(reporterDisplay, 'reporter display must exist')
    reporterDisplay.click()
    await flushMicrotasks()

    const reporterDropdown = comp.el.querySelector('.custom-dropdown')
    assert.ok(reporterDropdown, 'reporter dropdown must open')

    const reporterItems = comp.el.querySelectorAll('.custom-dropdown-item')
    let bobItem: Element | null = null
    reporterItems.forEach((item: Element) => {
      if (item.textContent?.includes('Bob')) bobItem = item
    })
    assert.ok(bobItem, '"Bob" reporter option must exist')
    ;(bobItem as unknown as HTMLElement).click()
    await flushMicrotasks()

    assert.equal(issueStore.issue.reporterId, 'u2', 'reporter must be u2 (Bob) after click')

    // Comments must still be there
    const afterReporterCommentCreate = comp.el.querySelector('.comment-create')
    assert.ok(afterReporterCommentCreate, 'real CommentCreate must survive reporter change')
    const afterReporterCommentItems = comp.el.querySelectorAll('comment-item')
    assert.equal(afterReporterCommentItems.length, 2, 'both real CommentItems must survive reporter change')

    // Assignees must also still be there
    const afterReporterAssigneeChips = comp.el.querySelectorAll('.assignee-chip')
    assert.equal(afterReporterAssigneeChips.length, 1, 'assignee chip must survive reporter change')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

// ---------------------------------------------------------------------------
// Full hierarchy integration test: real Project → Board + Dialog → IssueDetails
// Uses esbuild to bundle the ENTIRE real jira_clone app through the gea
// vite plugin, then runs it in jsdom with pre-populated store data.
// ---------------------------------------------------------------------------

async function bundleJiraApp(): Promise<string> {
  const esbuild = await import('esbuild')
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')

  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler

  const geaTransformPlugin: import('esbuild').Plugin = {
    name: 'gea-transform',
    setup(build) {
      build.onResolve({ filter: /^virtual:gea-/ }, (args) => ({
        path: args.path,
        namespace: 'gea-virtual',
      }))
      build.onLoad({ filter: /.*/, namespace: 'gea-virtual' }, (args) => {
        if (args.path === 'virtual:gea-hmr') {
          return { contents: 'export function __geaHmrRegister() {} export function __geaHmrAccept() {}', loader: 'js' }
        }
        if (args.path === 'virtual:gea-reconcile') {
          return { contents: 'export default function reconcile() {}', loader: 'js' }
        }
        return { contents: '', loader: 'js' }
      })
      build.onLoad({ filter: /\.(tsx|jsx)$/ }, async (args) => {
        if (args.path.includes('node_modules')) return undefined
        const source = readFileSync(args.path, 'utf8')
        try {
          const result = await transform?.call({} as never, source, args.path)
          const code = result ? (typeof result === 'string' ? result : result.code) : source
          return { contents: code, loader: 'tsx' }
        } catch {
          return { contents: source, loader: 'tsx' }
        }
      })
    },
  }

  const monorepoRoot = resolve(__dirname, '..', '..', '..')
  const result = await esbuild.build({
    entryPoints: [resolve(__dirname, 'fixtures', 'jira-integration-entry.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__jiraApp',
    platform: 'browser',
    target: 'esnext',
    alias: {
      '@geajs/core': resolve(monorepoRoot, 'packages/gea/src'),
      '@geajs/ui': resolve(monorepoRoot, 'packages/gea-ui/src/index.ts'),
    },
    plugins: [geaTransformPlugin],
    define: {
      'import.meta.hot': 'undefined',
      'import.meta.url': '""',
    },
    logLevel: 'silent',
  })

  return result.outputFiles![0].text
}

test('full hierarchy: changing reporter inside real Project/Dialog must not destroy comments', async () => {
  const restoreDom = installDom()

  const fakeIssue = {
    id: 'ISS-42',
    status: 'backlog',
    title: 'Fix login flow',
    type: 'task',
    priority: '3',
    listPosition: 1,
    userIds: ['u1'],
    reporterId: 'u1',
    estimate: 8,
    timeSpent: 2,
    timeRemaining: 6,
    description: 'The login is broken',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [
      { id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() },
      { id: 'c2', body: 'Second comment', userId: 'u2', createdAt: new Date().toISOString() },
    ],
  }

  // Mock fetch to return proper data for API calls
  const origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (url: string) => {
    if (typeof url === 'string' && url.includes('/issues/')) {
      return new Response(JSON.stringify({ issue: fakeIssue }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  // Mock localStorage for authToken
  if (!(globalThis as any).localStorage) {
    const storage: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v
      },
      removeItem: (k: string) => {
        delete storage[k]
      },
    }
  }

  try {
    const bundledCode = await bundleJiraApp()

    const fn = new Function(bundledCode + '\nreturn typeof __jiraApp !== "undefined" ? __jiraApp : undefined;')
    const app = fn()
    const { Project, issueStore, projectStore, authStore, router } = app || (globalThis as any).__jiraApp

    // Pre-populate stores with fake data
    const fakeProject = {
      name: 'Test Project',
      category: 'software',
      description: 'A test project',
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
      ],
      issues: [{ ...fakeIssue }],
    }

    projectStore.isLoading = false
    projectStore.project = fakeProject
    issueStore.issue = { ...fakeIssue }
    authStore.currentUser = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }

    // Render Project into the DOM
    const root = document.createElement('div')
    root.id = 'app-root'
    document.body.appendChild(root)

    const projectComp = new Project()
    projectComp.render(root, {})

    router.replace('/project/board/issues/ISS-42')
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const issueDetails = document.querySelector('.issue-details')
    assert.ok(issueDetails, 'IssueDetails must render inside Project/Dialog')

    const commentCreate = document.querySelector('.comment-create')
    assert.ok(commentCreate, 'CommentCreate must render')

    const commentItems = document.querySelectorAll('.comment')
    assert.equal(commentItems.length, 2, 'both CommentItems must render initially')

    const assigneeChips = document.querySelectorAll('.assignee-chip')
    assert.equal(assigneeChips.length, 1, 'assignees must show 1 chip for userIds=["u1"]')

    // --- Open reporter dropdown and pick Bob ---
    const reporterDisplay = document.querySelector('.reporter-display') as HTMLElement
    assert.ok(reporterDisplay, 'reporter display must exist')
    reporterDisplay.click()
    await flushMicrotasks()

    const dropdownItems = document.querySelectorAll('.custom-dropdown-item')
    let bobItem: HTMLElement | null = null
    dropdownItems.forEach((item: Element) => {
      if (item.textContent?.includes('Bob')) bobItem = item as HTMLElement
    })
    assert.ok(bobItem, '"Bob" reporter option must exist in dropdown')
    bobItem!.click()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(issueStore.issue?.reporterId, 'u2', 'reporter must be u2 (Bob) after click')

    // --- CRITICAL: comments must still exist after reporter change ---
    const afterCommentCreate = document.querySelector('.comment-create')
    assert.ok(afterCommentCreate, 'CommentCreate must survive reporter change in full hierarchy')

    const afterCommentItems = document.querySelectorAll('.comment')
    assert.equal(afterCommentItems.length, 2, 'both CommentItems must survive reporter change')

    const afterAssigneeChips = document.querySelectorAll('.assignee-chip')
    assert.equal(afterAssigneeChips.length, 1, 'assignee chip must survive reporter change')

    projectComp.dispose()
    issueStore.issue = null
    projectStore.project = null
    await flushMicrotasks()
  } finally {
    ;(globalThis as any).fetch = origFetch
    restoreDom()
  }
})

test('full hierarchy: adding assignee must update chip list and preserve reporter', async () => {
  const restoreDom = installDom()

  const fakeIssue = {
    id: 'ISS-42',
    status: 'backlog',
    title: 'Fix login flow',
    type: 'task',
    priority: '3',
    listPosition: 1,
    userIds: ['u1'],
    reporterId: 'u1',
    estimate: 8,
    timeSpent: 2,
    timeRemaining: 6,
    description: 'The login is broken',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [{ id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() }],
  }

  const origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/issues/') && (!opts || opts.method === 'GET' || !opts.method)) {
      return new Response(JSON.stringify({ issue: fakeIssue }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  if (!(globalThis as any).localStorage) {
    const storage: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v
      },
      removeItem: (k: string) => {
        delete storage[k]
      },
    }
  }

  try {
    const bundledCode = await bundleJiraApp()

    const fn = new Function(bundledCode + '\nreturn typeof __jiraApp !== "undefined" ? __jiraApp : undefined;')
    const app = fn()
    const { Project, issueStore, projectStore, authStore, router } = app || (globalThis as any).__jiraApp

    const fakeProject = {
      name: 'Test Project',
      category: 'software',
      description: 'A test project',
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
        { id: 'u3', name: 'Charlie', avatarUrl: '/charlie.png' },
      ],
      issues: [{ ...fakeIssue }],
    }

    projectStore.isLoading = false
    projectStore.project = fakeProject
    issueStore.issue = { ...fakeIssue }
    authStore.currentUser = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }

    const root = document.createElement('div')
    root.id = 'app-root'
    document.body.appendChild(root)

    const projectComp = new Project()
    projectComp.render(root, {})

    router.replace('/project/board/issues/ISS-42')
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // --- Verify initial state ---
    const issueDetails = document.querySelector('.issue-details')
    assert.ok(issueDetails, 'IssueDetails must render')

    const initialChips = document.querySelectorAll('.assignee-chip')
    assert.equal(initialChips.length, 1, 'initially 1 assignee chip for userIds=["u1"]')

    const reporterName = document.querySelector('.reporter-name')
    assert.ok(reporterName, 'reporter name span must exist')
    assert.equal(reporterName!.textContent, 'Alice', 'reporter must be Alice initially')

    const reporterAvatar = document.querySelector('.reporter-avatar') as HTMLImageElement
    assert.ok(reporterAvatar, 'reporter avatar must exist initially')
    assert.equal(reporterAvatar!.getAttribute('alt'), 'Alice', 'reporter avatar alt must be Alice')

    // --- Open assignees dropdown ---
    const addMore = document.querySelector('.assignee-add-more') as HTMLElement
    assert.ok(addMore, '"+ Add more" link must exist')
    addMore.click()
    await flushMicrotasks()

    // --- Pick Bob from the dropdown ---
    const dropdownItems = document.querySelectorAll('.custom-dropdown-item')
    let bobItem: HTMLElement | null = null
    dropdownItems.forEach((item: Element) => {
      if (item.textContent?.includes('Bob')) bobItem = item as HTMLElement
    })
    assert.ok(bobItem, '"Bob" must appear in assignee dropdown')
    bobItem!.click()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // --- BUG 1: Assignee list must update after adding Bob ---
    const afterChips = document.querySelectorAll('.assignee-chip')
    assert.equal(afterChips.length, 2, 'assignee chips must be 2 after adding Bob')

    // --- BUG 2: Reporter must NOT become "Unassigned" ---
    const afterReporterName = document.querySelector('.reporter-name')
    assert.ok(afterReporterName, 'reporter name must still exist')
    assert.equal(afterReporterName!.textContent, 'Alice', 'reporter must still be Alice after adding assignee')

    const afterReporterAvatar = document.querySelector('.reporter-avatar') as HTMLImageElement
    assert.ok(afterReporterAvatar, 'reporter avatar must still exist after adding assignee')

    projectComp.dispose()
    issueStore.issue = null
    projectStore.project = null
    await flushMicrotasks()
  } finally {
    ;(globalThis as any).fetch = origFetch
    restoreDom()
  }
})

test('full hierarchy: assignee dropdown must remove added user from list', async () => {
  const restoreDom = installDom()

  const fakeIssue = {
    id: 'ISS-42',
    status: 'backlog',
    title: 'Fix login flow',
    type: 'task',
    priority: '3',
    listPosition: 1,
    userIds: ['u1'],
    reporterId: 'u1',
    estimate: 8,
    timeSpent: 2,
    timeRemaining: 6,
    description: 'The login is broken',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [{ id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() }],
  }

  const origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/issues/') && (!opts || opts.method === 'GET' || !opts.method)) {
      return new Response(JSON.stringify({ issue: fakeIssue }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  if (!(globalThis as any).localStorage) {
    const storage: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v
      },
      removeItem: (k: string) => {
        delete storage[k]
      },
    }
  }

  try {
    const bundledCode = await bundleJiraApp()

    const fn = new Function(bundledCode + '\nreturn typeof __jiraApp !== "undefined" ? __jiraApp : undefined;')
    const app = fn()
    const { Project, issueStore, projectStore, authStore, router } = app || (globalThis as any).__jiraApp

    const fakeProject = {
      name: 'Test Project',
      category: 'software',
      description: 'A test project',
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
        { id: 'u3', name: 'Charlie', avatarUrl: '/charlie.png' },
      ],
      issues: [{ ...fakeIssue }],
    }

    projectStore.isLoading = false
    projectStore.project = fakeProject
    issueStore.issue = { ...fakeIssue }
    authStore.currentUser = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }

    const root = document.createElement('div')
    root.id = 'app-root'
    document.body.appendChild(root)

    const projectComp = new Project()
    projectComp.render(root, {})

    router.replace('/project/board/issues/ISS-42')
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const issueDetails = document.querySelector('.issue-details')
    assert.ok(issueDetails, 'IssueDetails must render')

    // Open assignees dropdown
    const addMore = document.querySelector('.assignee-add-more') as HTMLElement
    assert.ok(addMore, '"+ Add more" link must exist')
    addMore.click()
    await flushMicrotasks()

    // Initially: Alice is assigned, dropdown should show Bob and Charlie
    const initialDropdownItems = document.querySelectorAll('.custom-dropdown-item')
    assert.equal(initialDropdownItems.length, 2, 'dropdown must show 2 unassigned users initially')

    // Pick Bob from the dropdown
    let bobItem: HTMLElement | null = null
    initialDropdownItems.forEach((item: Element) => {
      if (item.textContent?.includes('Bob')) bobItem = item as HTMLElement
    })
    assert.ok(bobItem, '"Bob" must appear in assignee dropdown')
    bobItem!.click()
    await flushMicrotasks()
    await flushMicrotasks()

    // Dropdown should close after picking
    const closedDropdownItems = document.querySelectorAll('.custom-dropdown-item')
    assert.equal(closedDropdownItems.length, 0, 'dropdown must close after picking an assignee')

    // Re-open dropdown to verify filtered list
    const addMore2 = document.querySelector('.assignee-add-more') as HTMLElement
    assert.ok(addMore2, '"+ Add more" link must still exist')
    addMore2.click()
    await flushMicrotasks()
    await flushMicrotasks()

    // After adding Bob: dropdown must show only Charlie
    const afterDropdownItems = document.querySelectorAll('.custom-dropdown-item')
    assert.equal(afterDropdownItems.length, 1, 'dropdown must show only 1 unassigned user after adding Bob')
    assert.ok(afterDropdownItems[0]?.textContent?.includes('Charlie'), 'remaining dropdown item must be Charlie')

    projectComp.dispose()
    issueStore.issue = null
    projectStore.project = null
    await flushMicrotasks()
  } finally {
    ;(globalThis as any).fetch = origFetch
    restoreDom()
  }
})

test('full hierarchy: clicking issue card on board must open IssueDetails dialog', async () => {
  const restoreDom = installDom()

  const fakeIssue = {
    id: 'ISS-42',
    status: 'backlog',
    title: 'Fix login flow',
    type: 'task',
    priority: '3',
    listPosition: 1,
    userIds: ['u1'],
    reporterId: 'u1',
    estimate: 8,
    timeSpent: 2,
    timeRemaining: 6,
    description: 'The login is broken',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [{ id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() }],
  }

  const origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/issues/') && (!opts || opts.method === 'GET' || !opts.method)) {
      return new Response(JSON.stringify({ issue: fakeIssue }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  if (!(globalThis as any).localStorage) {
    const storage: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v
      },
      removeItem: (k: string) => {
        delete storage[k]
      },
    }
  }

  try {
    const bundledCode = await bundleJiraApp()

    const fn = new Function(bundledCode + '\nreturn typeof __jiraApp !== "undefined" ? __jiraApp : undefined;')
    const app = fn()
    const { Project, issueStore, projectStore, authStore, router } = app || (globalThis as any).__jiraApp

    const fakeProject = {
      name: 'Test Project',
      category: 'software',
      description: 'A test project',
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
      ],
      issues: [{ ...fakeIssue }],
    }

    projectStore.isLoading = false
    projectStore.project = fakeProject
    authStore.currentUser = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }

    const root = document.createElement('div')
    root.id = 'app-root'
    document.body.appendChild(root)

    const projectComp = new Project()
    projectComp.render(root, {})

    // Start on the board view — no issue dialog
    router.replace('/project/board')

    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // --- Verify board rendered, no dialog ---
    assert.ok(projectComp.el, 'Project component must have rendered')
    const boardEl = document.querySelector('.board')
    assert.ok(boardEl, 'Board must be rendered')

    const issueCardsBefore = document.querySelectorAll('.issue-card')
    assert.ok(issueCardsBefore.length > 0, 'at least one issue card must be on the board')

    const dialogBefore = document.querySelector('.issue-details')
    assert.ok(!dialogBefore, 'IssueDetails must NOT be present before clicking an issue')

    // Pre-populate issue store so IssueDetails renders content immediately
    issueStore.issue = { ...fakeIssue }
    issueStore.isLoading = false

    // --- Click the first issue card ---
    const issueCard = issueCardsBefore[0] as HTMLElement
    issueCard.click()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // --- Verify the dialog opened ---
    assert.equal(router.path, '/project/board/issues/ISS-42', 'router.path must update after clicking issue card')

    const dialogWrapper = document.querySelector('.dialog-issue-detail')
    assert.ok(dialogWrapper, 'Dialog wrapper must appear after clicking an issue card')

    const issueDetails = document.querySelector('.issue-details') || document.querySelector('.issue-details-loader')
    assert.ok(
      issueDetails,
      'IssueDetails (or its loader) must render inside the dialog. DOM: ' + document.body.innerHTML.slice(0, 2000),
    )

    projectComp.dispose()
    issueStore.issue = null
    projectStore.project = null
    await flushMicrotasks()
  } finally {
    ;(globalThis as any).fetch = origFetch
    restoreDom()
  }
})

test('full hierarchy: dropdown closes after picking assignee and newly added chip is removable', async () => {
  const restoreDom = installDom()

  const fakeIssue = {
    id: 'ISS-42',
    status: 'backlog',
    title: 'Fix login flow',
    type: 'task',
    priority: '3',
    listPosition: 1,
    userIds: ['u1'],
    reporterId: 'u1',
    estimate: 8,
    timeSpent: 2,
    timeRemaining: 6,
    description: 'The login is broken',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [{ id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() }],
  }

  const origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (url: string, opts?: any) => {
    if (typeof url === 'string' && url.includes('/issues/') && (!opts || opts.method === 'GET' || !opts.method)) {
      return new Response(JSON.stringify({ issue: fakeIssue }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  if (!(globalThis as any).localStorage) {
    const storage: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v
      },
      removeItem: (k: string) => {
        delete storage[k]
      },
    }
  }

  try {
    const bundledCode = await bundleJiraApp()
    const fn = new Function(bundledCode + '\nreturn typeof __jiraApp !== "undefined" ? __jiraApp : undefined;')
    const app = fn()
    const { Project, issueStore, projectStore, authStore, router } = app || (globalThis as any).__jiraApp

    const fakeProject = {
      name: 'Test Project',
      category: 'software',
      description: 'A test project',
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
        { id: 'u3', name: 'Charlie', avatarUrl: '/charlie.png' },
      ],
      issues: [{ ...fakeIssue }],
    }

    projectStore.isLoading = false
    projectStore.project = fakeProject
    issueStore.issue = { ...fakeIssue }
    authStore.currentUser = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }

    const root = document.createElement('div')
    root.id = 'app-root'
    document.body.appendChild(root)

    const projectComp = new Project()
    projectComp.render(root, {})

    router.replace('/project/board/issues/ISS-42')
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const issueDetailEl = document.querySelector('.issue-details')
    assert.ok(issueDetailEl, 'IssueDetails must render')

    const initialChips = document.querySelectorAll('.assignee-chip')
    assert.equal(initialChips.length, 1, 'initially 1 assignee chip')

    // Open dropdown and add Bob
    const addMore = document.querySelector('.assignee-add-more') as HTMLElement
    assert.ok(addMore, '"+ Add more" must exist')
    addMore.click()
    await flushMicrotasks()

    let bobItem: HTMLElement | null = null
    document.querySelectorAll('.custom-dropdown-item').forEach((item: Element) => {
      if (item.textContent?.includes('Bob')) bobItem = item as HTMLElement
    })
    assert.ok(bobItem, 'Bob must appear in dropdown')
    bobItem!.click()
    await flushMicrotasks()
    await flushMicrotasks()

    // Dropdown must close after picking
    assert.equal(
      document.querySelectorAll('.custom-dropdown-item').length,
      0,
      'dropdown must close after picking an assignee',
    )

    // No orphaned dropdown items outside conditional slot
    const allDropdownItems = document.querySelectorAll('.custom-dropdown-item')
    assert.equal(allDropdownItems.length, 0, 'no orphaned dropdown items when dropdown is closed')

    // Chip list must show 2 chips
    const afterChips = document.querySelectorAll('.assignee-chip')
    assert.equal(afterChips.length, 2, 'must show 2 assignee chips after adding Bob')

    // New chip must have correct data-gea-item-id (not "undefined")
    const newChip = Array.from(afterChips).find((c) => c.textContent?.includes('Bob'))
    assert.ok(newChip, 'new chip for Bob must exist')
    const chipItemId = (newChip as HTMLElement).getAttribute('data-gea-item-id')
    assert.equal(chipItemId, 'u2', 'new chip data-gea-item-id must be "u2" (not "undefined")')

    // New chip must be removable via × button
    const removeBtn = (newChip as HTMLElement).querySelector('.assignee-chip-remove') as HTMLElement
    assert.ok(removeBtn, 'Bob chip must have a remove button')
    removeBtn.click()
    await flushMicrotasks()
    await flushMicrotasks()

    const finalChips = document.querySelectorAll('.assignee-chip')
    assert.equal(finalChips.length, 1, 'after removing Bob, only 1 chip must remain')
    assert.ok(finalChips[0]?.textContent?.includes('Alice'), 'remaining chip must be Alice')

    projectComp.dispose()
    issueStore.issue = null
    projectStore.project = null
    await flushMicrotasks()
  } finally {
    ;(globalThis as any).fetch = origFetch
    restoreDom()
  }
})

test('full hierarchy: adding a comment must be a surgical DOM update, not a full dialog re-render', async () => {
  const restoreDom = installDom()

  const fakeIssue = {
    id: 'ISS-42',
    status: 'backlog',
    title: 'Fix login flow',
    type: 'task',
    priority: '3',
    listPosition: 1,
    userIds: ['u1'],
    reporterId: 'u1',
    estimate: 8,
    timeSpent: 2,
    timeRemaining: 6,
    description: 'The login is broken',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [{ id: 'c1', body: 'First comment', userId: 'u1', createdAt: new Date().toISOString() }],
  }

  const origFetch = globalThis.fetch
  ;(globalThis as any).fetch = async (url: string, opts?: any) => {
    const method = opts?.method?.toUpperCase() || 'GET'
    if (typeof url === 'string' && url.includes('/issues/') && method === 'GET') {
      return new Response(JSON.stringify({ issue: fakeIssue }), { status: 200 })
    }
    if (typeof url === 'string' && url.includes('/comments') && method === 'POST') {
      const body = opts?.body ? JSON.parse(opts.body) : {}
      return new Response(
        JSON.stringify({
          comment: {
            id: 'c-new',
            body: body.body || 'New comment',
            userId: 'u1',
            issueId: body.issueId,
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({}), { status: 200 })
  }

  if (!(globalThis as any).localStorage) {
    const storage: Record<string, string> = {}
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v
      },
      removeItem: (k: string) => {
        delete storage[k]
      },
    }
  }

  try {
    const bundledCode = await bundleJiraApp()
    const fn = new Function(bundledCode + '\nreturn typeof __jiraApp !== "undefined" ? __jiraApp : undefined;')
    const app = fn()
    const { Project, issueStore, projectStore, authStore, router } = app || (globalThis as any).__jiraApp

    const fakeProject = {
      name: 'Test Project',
      category: 'software',
      description: 'A test project',
      users: [
        { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' },
        { id: 'u2', name: 'Bob', avatarUrl: '/bob.png' },
      ],
      issues: [{ ...fakeIssue }],
    }

    projectStore.isLoading = false
    projectStore.project = fakeProject
    issueStore.issue = { ...fakeIssue }
    authStore.currentUser = { id: 'u1', name: 'Alice', avatarUrl: '/alice.png' }

    const root = document.createElement('div')
    root.id = 'app-root'
    document.body.appendChild(root)

    const projectComp = new Project()
    projectComp.render(root, {})

    router.replace('/project/board/issues/ISS-42')
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    const issueDetailEl = document.querySelector('.issue-details')
    assert.ok(issueDetailEl, 'IssueDetails must render')

    // Grab stable DOM references to verify they survive the comment addition
    const titleEl = document.querySelector('.issue-details-title') as HTMLElement
    const descEl = document.querySelector('.issue-details-description') as HTMLElement
    const rightPanel = document.querySelector('.issue-details-right') as HTMLElement
    const bodyEl = document.querySelector('.issue-details-body') as HTMLElement
    assert.ok(titleEl, 'title section must exist')
    assert.ok(descEl, 'description section must exist')
    assert.ok(rightPanel, 'right panel must exist')
    assert.ok(bodyEl, 'body must exist')

    const initialComments = document.querySelectorAll('.comment')
    assert.equal(initialComments.length, 1, 'initially 1 comment')
    const firstCommentEl = initialComments[0] as HTMLElement

    // Push a new comment directly into the store (simulating what createComment now does)
    issueStore.issue.comments.push({
      id: 'c2',
      body: 'Second comment',
      userId: 'u2',
      createdAt: new Date().toISOString(),
    })

    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // The new comment must appear
    const afterComments = document.querySelectorAll('.comment')
    assert.equal(afterComments.length, 2, 'must show 2 comments after adding one')

    // Verify the second comment's content
    const secondComment = afterComments[1] as HTMLElement
    assert.ok(secondComment?.textContent?.includes('Second comment'), 'new comment body must appear')

    // CRITICAL: Verify DOM node identity — these must be the SAME nodes, not re-created
    assert.strictEqual(
      document.querySelector('.issue-details-title'),
      titleEl,
      'title DOM node must be preserved (not re-created) — surgical update only',
    )
    assert.strictEqual(
      document.querySelector('.issue-details-description'),
      descEl,
      'description DOM node must be preserved (not re-created) — surgical update only',
    )
    assert.strictEqual(
      document.querySelector('.issue-details-right'),
      rightPanel,
      'right panel DOM node must be preserved (not re-created) — surgical update only',
    )
    assert.strictEqual(
      document.querySelector('.issue-details-body'),
      bodyEl,
      'body DOM node must be preserved (not re-created) — surgical update only',
    )
    assert.strictEqual(
      afterComments[0],
      firstCommentEl,
      'first comment DOM node must be preserved (not re-created) — surgical update only',
    )

    // Verify the dialog never showed a spinner (isLoading was never set to true)
    const spinner = document.querySelector('.issue-details-loader')
    assert.equal(spinner, null, 'no spinner/loader should appear during comment addition')

    projectComp.dispose()
    issueStore.issue = null
    projectStore.project = null
    await flushMicrotasks()
  } finally {
    ;(globalThis as any).fetch = origFetch
    restoreDom()
  }
})
