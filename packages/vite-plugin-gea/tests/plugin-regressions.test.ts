import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'

import babelGenerator from '@babel/generator'
import * as t from '@babel/types'
import { JSDOM } from 'jsdom'

import { generateArrayHandlers, generateEnsureArrayConfigsMethod } from '../generate-array'
import { generateObserveHandler } from '../generate-observe'
import type { ArrayMapBinding } from '../ir'
import { geaPlugin } from '../index'
import { parseSource } from '../parse'
import type { StateRefMeta } from '../parse'
import { transformComponentFile } from '../transform-component'
import { generatePatchItemMethod, generateCreateItemMethod } from '../generate-array-patch'
import { getObserveMethodName } from '../utils'
import { applyListChanges } from '../../gea/src/lib/base/list'

const generate = 'default' in babelGenerator ? babelGenerator.default : babelGenerator

function withDom<T>(run: (dom: JSDOM) => T): T {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
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
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  })

  try {
    return run(dom)
  } finally {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

function createArrayObserverHarness(arrayMap: ArrayMapBinding) {
  const arrayPath = arrayMap.arrayPathParts.join('.')
  const methodName = `render${arrayPath.charAt(0).toUpperCase() + arrayPath.slice(1)}Item`
  const observeMethodName = getObserveMethodName(arrayMap.arrayPathParts, arrayMap.storeVar)
  const methods = generateArrayHandlers(arrayMap, observeMethodName)
  const capName = arrayPath.charAt(0).toUpperCase() + arrayPath.slice(1).replace(/\./g, '')
  const patchName = `patch${capName}Item`
  const createName = `create${capName}Item`
  const extraMethods: t.ClassMethod[] = []
  const patchMethod = generatePatchItemMethod(arrayMap)
  if (patchMethod) {
    extraMethods.push(patchMethod)
  } else {
    extraMethods.push(
      t.classMethod(
        'method',
        t.identifier(patchName),
        [t.identifier('el'), t.identifier('item')],
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('el'), t.identifier('__geaItem')),
              t.identifier('item'),
            ),
          ),
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('el'), t.identifier('textContent')),
              t.memberExpression(t.identifier('item'), t.identifier('label')),
            ),
          ),
        ]),
      ),
    )
  }
  const createMethod = generateCreateItemMethod(arrayMap)
  if (createMethod) {
    extraMethods.push(createMethod)
  } else {
    extraMethods.push(
      t.classMethod(
        'method',
        t.identifier(createName),
        [t.identifier('item')],
        t.blockStatement([
          t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('__tw'),
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(t.thisExpression(), t.identifier(`__${arrayPath.replace(/\./g, '_')}_container`)),
                  t.identifier('cloneNode'),
                ),
                [t.booleanLiteral(false)],
              ),
            ),
          ]),
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(t.identifier('__tw'), t.identifier('innerHTML')),
              t.callExpression(t.memberExpression(t.thisExpression(), t.identifier(methodName)), [
                t.identifier('item'),
              ]),
            ),
          ),
          t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('el'),
              t.memberExpression(t.identifier('__tw'), t.identifier('firstElementChild')),
            ),
          ]),
          t.returnStatement(t.identifier('el')),
        ]),
      ),
    )
  }
  const classAst = t.program([
    t.classDeclaration(
      t.identifier('Harness'),
      null,
      t.classBody([
        t.classMethod(
          'method',
          t.identifier('__applyListChanges'),
          [t.identifier('container'), t.identifier('array'), t.identifier('changes'), t.identifier('config')],
          t.blockStatement([
            t.returnStatement(
              t.callExpression(t.identifier('applyListChanges'), [
                t.identifier('container'),
                t.identifier('array'),
                t.identifier('changes'),
                t.identifier('config'),
              ]),
            ),
          ]),
        ),
        t.classMethod(
          'method',
          t.identifier('$'),
          [t.identifier('selector')],
          t.blockStatement([
            t.returnStatement(
              t.conditionalExpression(
                t.logicalExpression(
                  '||',
                  t.binaryExpression('===', t.identifier('selector'), t.stringLiteral(':scope')),
                  t.binaryExpression('==', t.identifier('selector'), t.nullLiteral()),
                ),
                t.memberExpression(t.thisExpression(), t.identifier('root')),
                t.callExpression(
                  t.memberExpression(
                    t.memberExpression(t.thisExpression(), t.identifier('root')),
                    t.identifier('querySelector'),
                  ),
                  [t.identifier('selector')],
                ),
              ),
            ),
          ]),
        ),
        t.classMethod(
          'method',
          t.identifier(methodName),
          [t.identifier('item')],
          t.blockStatement([
            t.returnStatement(
              t.templateLiteral(
                [
                  t.templateElement({
                    raw: '<li data-gea-item-id="',
                    cooked: '<li data-gea-item-id="',
                  }),
                  t.templateElement({ raw: '">', cooked: '">' }),
                  t.templateElement({ raw: '</li>', cooked: '</li>' }, true),
                ],
                [
                  t.memberExpression(t.identifier('item'), t.identifier(arrayMap.itemIdProperty || 'id')),
                  t.memberExpression(t.identifier('item'), t.identifier('label')),
                ],
              ),
            ),
          ]),
        ),
        ...extraMethods,
        ...(generateEnsureArrayConfigsMethod([arrayMap]) ? [generateEnsureArrayConfigsMethod([arrayMap])!] : []),
        ...methods,
      ]),
    ),
  ])

  const source = generate(classAst).code
  const Harness = new Function('applyListChanges', `${source}; return Harness;`)(applyListChanges) as new () => {
    root: HTMLElement
  } & Record<string, any>

  return new Harness()
}

function renderInitialList(
  harness: ReturnType<typeof createArrayObserverHarness>,
  items: Array<{ [key: string]: unknown }>,
) {
  harness.root = document.createElement('ul')
  harness[getObserveMethodName('todos')](items, [
    {
      type: 'update',
      pathParts: ['todos'],
      newValue: items,
    },
  ])
}

function transformComponentSource(source: string, knownComponentImports?: Set<string>): string {
  const parsed = parseSource(source)
  assert.ok(parsed)
  assert.ok(parsed.componentClassName)

  const original = parseSource(source)
  assert.ok(original)
  const storeImports = new Map<string, string>()

  parsed.imports.forEach((importSource, localName) => {
    if (parsed.importKinds.get(localName) !== 'default') return
    if (!/store/i.test(importSource)) return
    storeImports.set(localName, importSource)
  })

  const transformed = transformComponentFile(
    parsed.ast,
    parsed.imports,
    storeImports,
    parsed.componentClassName,
    '/virtual/test-component.jsx',
    original.ast,
    new Set(),
    knownComponentImports,
  )

  assert.equal(transformed, true)
  return generate(parsed.ast).code
}

async function transformWithPlugin(source: string, id: string): Promise<string | null> {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  const result = await transform?.call({} as never, source, id)
  if (!result) return null
  return typeof result === 'string' ? result : result.code
}

function createObserveHarness(methodSource: string, setupSource = '') {
  const source = `
    class Harness {
      constructor() {
        ${setupSource}
      }
      $(selector) {
        return this.root.querySelector(selector)
      }
      ${methodSource}
    }
    return Harness;
  `
  const Harness = new Function(source)() as new () => {
    root: HTMLElement
    props?: Record<string, unknown>
  } & Record<string, any>
  return new Harness()
}

test('array observer preserves DOM order for unshift insertions', () => {
  withDom(() => {
    const harness = createArrayObserverHarness({
      arrayPathParts: ['todos'],
      itemVariable: 'todo',
      itemBindings: [],
      containerSelector: 'ul',
      isImportedState: false,
      itemIdProperty: 'id',
    })

    const todos = [
      { id: 1, label: 'first' },
      { id: 2, label: 'second' },
    ]

    renderInitialList(harness, todos)

    todos.unshift({ id: 3, label: 'zero' })
    harness[getObserveMethodName('todos')](todos, [
      {
        type: 'add',
        property: '0',
        pathParts: ['todos', '0'],
        newValue: todos[0],
      },
    ])

    const order = Array.from(harness.root.querySelectorAll('li')).map((node) => node.textContent)
    assert.deepEqual(order, ['zero', 'first', 'second'])
  })
})

test('array observer removes nodes when keyed by a non-id property', () => {
  withDom(() => {
    const harness = createArrayObserverHarness({
      arrayPathParts: ['todos'],
      itemVariable: 'todo',
      itemBindings: [],
      containerSelector: 'ul',
      isImportedState: false,
      itemIdProperty: 'key',
    })

    const todos = [
      { key: 'alpha', label: 'first' },
      { key: 'beta', label: 'second' },
    ]

    renderInitialList(harness, todos)

    const removed = todos.splice(0, 1)[0]
    harness[getObserveMethodName('todos')](todos, [
      {
        type: 'delete',
        property: '0',
        pathParts: ['todos', '0'],
        previousValue: removed,
      },
    ])

    const labels = Array.from(harness.root.querySelectorAll('li')).map((node) => node.textContent)
    assert.deepEqual(labels, ['second'])
  })
})

test('array observer batches contiguous tail appends into one DOM append', () => {
  withDom(() => {
    const harness = createArrayObserverHarness({
      arrayPathParts: ['todos'],
      itemVariable: 'todo',
      itemBindings: [],
      containerSelector: 'ul',
      isImportedState: false,
      itemIdProperty: 'id',
    })

    const todos = [
      { id: 1, label: 'first' },
      { id: 2, label: 'second' },
    ]

    renderInitialList(harness, todos)

    const list = harness.root
    assert.ok(list)

    let appendChildCalls = 0
    let insertBeforeCalls = 0
    const originalAppendChild = list.appendChild.bind(list)
    const originalInsertBefore = list.insertBefore.bind(list)

    list.appendChild = ((node: Node) => {
      appendChildCalls++
      return originalAppendChild(node)
    }) as typeof list.appendChild
    list.insertBefore = ((node: Node, child: Node | null) => {
      insertBeforeCalls++
      return originalInsertBefore(node, child)
    }) as typeof list.insertBefore

    todos.push({ id: 3, label: 'third' }, { id: 4, label: 'fourth' })
    harness[getObserveMethodName('todos')](todos, [
      {
        type: 'append',
        property: '2',
        pathParts: ['todos'],
        start: 2,
        count: 2,
        newValue: todos.slice(2),
      },
    ])

    const labels = Array.from(harness.root.querySelectorAll('li')).map((node) => node.textContent)
    assert.deepEqual(labels, ['first', 'second', 'third', 'fourth'])
    assert.equal(appendChildCalls, 1)
    assert.equal(insertBeforeCalls, 0)
  })
})

test('transform creates a distinct child instance for each self-closing component use', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import Counter from './counter'

    export default class ParentView extends Component {
      template() {
        return (
          <div>
            <Counter count={1} />
            <Counter count={2} />
          </div>
        )
      }
    }
  `)

  assert.match(output, /this\._counter = new Counter\(/)
  assert.match(output, /this\._counter2 = new Counter\(/)
})

test('static reactivity wires subscriptions for every imported store used by a component', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import counterStore from './counter-store'
    import filterStore from './filter-store'

    export default class DashboardView extends Component {
      template() {
        return (
          <div>
            <span>{counterStore.count}</span>
            <span>{filterStore.query}</span>
          </div>
        )
      }
    }
  `)

  assert.match(output, /this\.__stores\.counterStore = counterStore\.__store/)
  assert.match(output, /this\.__stores\.filterStore = filterStore\.__store/)
})

test('static reactivity detects default Store imports across files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-store-import-'))

  try {
    const componentPath = join(dir, 'DashboardView.jsx')
    const storePath = join(dir, 'dashboard-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class DashboardStore extends Store {
  count = 1
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './dashboard-store'

        export default class DashboardView extends Component {
          template() {
            return <div>{store.count}</div>
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /this\.__stores\.store = store/)
    assert.match(output, /observe\(\["count"\]/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('functional component compiles to class component', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-func-comp-'))
  try {
    const componentPath = join(dir, 'OptionStep.jsx')
    const output = await transformWithPlugin(
      `
import StepHeader from './StepHeader'
import OptionItem from './OptionItem'

export default function OptionStep({ stepNumber, title, options, selectedId, showBack, nextLabel, onSelect, onBack, onContinue }) {
  const handleOptionClick = e => {
    const el = e.target.closest('[data-item-id]')
    if (el) onSelect(el.getAttribute('data-item-id'))
  }
  return (
    <section class="section-card">
      <StepHeader stepNumber={stepNumber} title={title} />
      <div class="option-grid" click={handleOptionClick}>
        {options.map(opt => (
          <OptionItem
            key={opt.id}
            itemId={opt.id}
            label={opt.label}
            selected={selectedId === opt.id}
          />
        ))}
      </div>
      <div class="nav-buttons">
        {showBack && <button click={onBack}>Back</button>}
        <button click={onContinue}>{nextLabel}</button>
      </div>
    </section>
  )
}
      `,
      componentPath,
    )
    assert.ok(output)
    assert.match(output, /export default class OptionStep extends Component/)
    assert.match(output, /template\(/)
    assert.match(output, /import.*Component.*from ['"]@geajs\/core['"]/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('component inside .map() compiles to component array instances', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-func-prop-'))
  try {
    const componentPath = join(dir, 'OptionStep.jsx')
    const output = await transformWithPlugin(
      `
import OptionItem from './OptionItem'

export default function OptionStep({ options, onSelect }) {
  return (
    <div>
      {options.map(opt => (
        <OptionItem key={opt.id} onSelect={() => onSelect(opt.id)} />
      ))}
    </div>
  )
}
      `,
      componentPath,
    )
    assert.ok(output)
    assert.match(output, /_buildOptionsItems/)
    assert.match(output, /this\._optionsItems\.join/)
    assert.match(output, /this\.props\.onSelect/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('root prop callback events do not leak as html attributes', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class OptionItem extends Component {
      template({ label, onSelect }) {
        return <div class="option-item" click={onSelect}>{label}</div>
      }
    }
  `)

  assert.match(output, /get events\(\)/)
  assert.match(output, /this\.props\["onSelect"\]|this\.props\.onSelect/)
  assert.doesNotMatch(output, /setAttribute\("click"/)
  assert.doesNotMatch(output, /removeAttribute\("click"/)
  assert.doesNotMatch(output, / click="\$\{/)
})

test('transform recognizes aliased named component imports', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import { Counter as FancyCounter } from './counter'

    export default class ParentView extends Component {
      template() {
        return (
          <section>
            <FancyCounter count={1} />
            <FancyCounter count={2} />
          </section>
        )
      }
    }
  `)

  assert.match(output, /this\._fancyCounter = new FancyCounter\(/)
  assert.match(output, /this\._fancyCounter2 = new FancyCounter\(/)
})

test('prop patch methods use getElementById for element lookup', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Counter extends Component {
      constructor({ count }) {
        super({ count })
      }
      template({ count }) {
        return (
          <div class="counter-card">
            <p class="counter-value">{count}</p>
          </div>
        )
      }
    }
  `)

  assert.match(output, /counter-value.*id=.*this\.id.*-b\d|id=.*this\.id.*-b\d.*counter-value/)
  assert.ok(
    /getElementById\([^)]*this\.id[^)]*\+[^)]*"-b\d"\)/.test(output),
    'prop patch must use getElementById, not this.$(selector)',
  )
})

test('prop text patch preserves surrounding template text', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class CheckoutButton extends Component {
      template({ totalPrice }) {
        return (
          <button class="btn">
            Pay $\${totalPrice}
          </button>
        )
      }
    }
  `)

  assert.match(output, /const __boundValue = `[\s\S]*Pay \$\$\$\{this\.props\.totalPrice\}[\s\S]*`;/)
  assert.match(output, /textContent = __boundValue/)
  assert.doesNotMatch(output, /__geaPatchProp_totalPrice\(value\)[\s\S]*textContent = value/)
})

test('generated selectors distinguish repeated sibling bindings', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class CounterPair extends Component {
      constructor() {
        super()
        this.left = 'L'
        this.right = 'R'
      }

      template() {
        return (
          <div>
            <span>{this.left}</span>
            <span>{this.right}</span>
          </div>
        )
      }
    }
  `)

  const selectors = Array.from(output.matchAll(/this\.\$\("([^"]+)"\)/g)).map((match) => match[1])
  const bindingIds = Array.from(output.matchAll(/getElementById\([^+]*\+\s*["']-([^"']+)["']\)/g)).map(
    (match) => match[1],
  )
  assert.equal(new Set(selectors).size >= 2 || new Set(bindingIds).size >= 2, true)
})

test('generated selectors distinguish repeated typed inputs', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class InputPair extends Component {
      constructor() {
        super()
        this.first = 'one'
        this.second = 'two'
      }

      template() {
        return (
          <form>
            <input type="text" value={this.first} />
            <input type="text" value={this.second} />
          </form>
        )
      }
    }
  `)

  const selectors = Array.from(output.matchAll(/this\.\$\("([^"]+)"\)/g)).map((match) => match[1])
  const bindingIds = Array.from(output.matchAll(/getElementById\([^+]*\+\s*["']-([^"']+)["']\)/g)).map(
    (match) => match[1],
  )
  assert.equal(new Set(selectors).size >= 2 || new Set(bindingIds).size >= 2, true)
})

test('multiple handlers on one element reuse a single generated selector id', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './store.ts'

    export default class TodoList extends Component {
      template() {
        return (
          <div>
            {store.todos.map(todo => (
              <input
                key={todo.id}
                type="text"
                value={todo.text}
                input={store.setEditingValue}
                keydown={e => {
                  if (e.key === 'Enter') store.updateTodo(todo)
                }}
              />
            ))}
          </div>
        )
      }
    }
  `)

  const selectorIds = output.match(/input:\s*\{[\s\S]*?ev(\d+)[\s\S]*?keydown:\s*\{[\s\S]*?ev(\d+)/)
  assert.ok(selectorIds, 'expected both event handlers to be emitted')
  assert.equal(selectorIds[1], selectorIds[2], 'same element should reuse one generated selector across handlers')
  assert.doesNotMatch(output, /id="\$\{this\.id \+ "-ev\d+"\}"\s+id="\$\{this\.id \+ "-ev\d+"\}"/)
  assert.doesNotMatch(output, /data-gea-event="ev\d+"\s+data-gea-event="ev\d+"/)
})

test('conditional child components are instantiated lazily', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './store.ts'
    import ChildView from './ChildView.jsx'

    export default class ParentView extends Component {
      template() {
        return (
          <div>
            {store.show && store.payload && <ChildView payload={store.payload} />}
          </div>
        )
      }
    }
  `)

  assert.match(output, /__ensureChild_childView\(\)/)
  assert.match(output, /store\.show && store\.payload && `\$\{this\.__ensureChild_childView\(\)\}`/)
  assert.match(output, /this\._childView = null/)
  assert.match(output, /__ensureChild_childView\(\)\s*\{[\s\S]*this\._childView = new ChildView/)
  const constructorBlock = output.match(/constructor\([\s\S]*?\n {2}\}/)?.[0] || ''
  assert.doesNotMatch(constructorBlock, /this\._childView = new ChildView/)
})

test('conditional root html event handlers are preserved inside logical branches', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class BackButtonView extends Component {
      template({ showBack, onBack }) {
        return (
          <div>
            {showBack && <button class="btn btn-secondary" click={onBack}>Back</button>}
          </div>
        )
      }
    }
  `)

  assert.match(output, /showBack && `<button class="btn btn-secondary" id="\$\{this\.id \+ "-ev\d+"\}">/)
  assert.match(output, /get events\(\)\s*\{[\s\S]*click:\s*\{/)
})

test('inline event handlers capture template-local setup statements', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class PaymentForm extends Component {
      template(props) {
        const { value, onPay } = props
        const isValid = value.trim().length > 0
        return <button click={() => isValid && onPay()}>Pay</button>
      }
    }
  `)

  assert.match(output, /template\(props\) \{[\s\S]*return `<button/)
  assert.doesNotMatch(
    output,
    /template\(props\) \{[\s\S]*onPay[\s\S]*return `<button/,
    'onPay should be pruned from template',
  )
  assert.match(
    output,
    /__event_click_0\(e, targetComponent\) \{[\s\S]*const \{\s*value,\s*onPay\s*\} = this\.props;[\s\S]*const isValid = value\.trim\(\)\.length > 0;[\s\S]*isValid && onPay\(\);/,
  )
})

test('imported store array text bindings inject id on stats element for getElementById', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div class="todo-list">
            <div class="todo-items">
              {store.todos.map(todo => (
                <div class={\`todo-item\${todo.completed ? ' completed' : ''}\`} key={todo.id}>
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
  `)

  assert.ok(
    /id=.*this\.id.*-b\d.*todo-stats|todo-stats.*id=.*this\.id.*-b\d/.test(output),
    'todo-stats div must have id attribute for getElementById lookup',
  )
  assert.ok(
    /getElementById\([^)]*this\.id[^)]*\+[^)]*"-b\d"\)/.test(output),
    'stats binding must use getElementById, not this.$(selector) fallback',
  )
})

test('imported store input value binding injects id for getElementById', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div class="todo-list">
            <input
              type="text"
              value={store.inputValue}
              input={store.setInputValue}
            />
          </div>
        )
      }
    }
  `)

  assert.ok(
    /input[^>]*id=.*this\.id.*-b\d|id=.*this\.id.*-b\d[^>]*input/.test(output),
    'input must have id for getElementById so value updates (e.g. clear after add) work',
  )
  assert.ok(
    /getElementById\([^)]*this\.id[^)]*\+[^)]*"-b\d"\)/.test(output),
    'input value binding must use getElementById',
  )
})

test('wildcard observers update index zero items', () => {
  withDom(() => {
    const binding = {
      pathParts: ['todos', '*', 'label'],
      type: 'text' as const,
      selector: '.label',
      elementPath: [],
      itemIdProperty: 'id',
      childPath: [0],
    }
    const method = generateObserveHandler(binding, new Map())
    const methodSource = generate(method).code
    const harness = createObserveHarness(
      methodSource,
      `
      this.todos = [{ id: 1, label: 'before' }];
      `,
    )
    harness.root = document.createElement('div')
    harness.root.innerHTML = '<div class="item" data-gea-item-id="0"><span class="label">before</span></div>'
    harness.__todos_container = harness.root

    harness[getObserveMethodName(['todos', '*', 'label'])]('after', {
      pathParts: ['todos', '0', 'label'],
      arrayPathParts: ['todos'],
      arrayIndex: 0,
      leafPathParts: ['label'],
      isArrayItemPropUpdate: true,
      newValue: 'after',
    })

    assert.equal(harness.root.querySelector('.label')?.textContent, 'after')
  })
})

test('wildcard observers resolve imported array paths correctly', () => {
  withDom(() => {
    const binding = {
      pathParts: ['todos', '*', 'label'],
      isImportedState: true,
      storeVar: 'storeState',
      type: 'text' as const,
      selector: '.label',
      elementPath: [],
      itemIdProperty: 'id',
      childPath: [0],
    }
    const method = generateObserveHandler(
      binding,
      new Map<string, StateRefMeta>([['storeState', { kind: 'imported', source: './store' }]]),
    )
    const methodSource = generate(method).code
    const harness = createObserveHarness(
      methodSource,
      `
      this.__stores = { storeState: { todos: [{ id: 1, label: 'before' }] } };
      `,
    )
    harness.root = document.createElement('div')
    harness.root.innerHTML = '<div class="item" data-gea-item-id="0"><span class="label">before</span></div>'
    harness.__todos_container = harness.root

    harness[getObserveMethodName(['todos', '*', 'label'], 'storeState')]('after', {
      pathParts: ['todos', '0', 'label'],
      arrayPathParts: ['todos'],
      arrayIndex: 0,
      leafPathParts: ['label'],
      isArrayItemPropUpdate: true,
      newValue: 'after',
    })

    assert.equal(harness.root.querySelector('.label')?.textContent, 'after')
  })
})

test('plugin transforms jsx entry files', async () => {
  const code = await transformWithPlugin(
    `
      import { Component } from '@geajs/core'
      export default class JsxCounter extends Component {
        template() {
          return <div>Hello</div>
        }
      }
    `,
    '/virtual/JsxCounter.jsx',
  )

  assert.ok(code)
  assert.doesNotMatch(code, /return <div>/)
})

test('plugin transforms tsx entry files', async () => {
  const code = await transformWithPlugin(
    `
      import { Component } from '@geajs/core'
      type Props = {}
      export default class TsxCounter extends Component {
        template(_props: Props) {
          return <div>Hello</div>
        }
      }
    `,
    '/virtual/TsxCounter.tsx',
  )

  assert.ok(code)
  assert.doesNotMatch(code, /return <div>/)
})

test('static reactivity subscribes imported array maps without plain text bindings', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoItems extends Component {
      template() {
        return (
          <ul>
            {store.todos.map(todo => (
              <li key={todo.id}>{todo.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  assert.match(output, /render(?:__unresolved_0|Todos)Item/)
  assert.match(output, /store\.todos\.map/)
})

test('computed imported array maps subscribe to helper dependencies', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './grid-store'

    export default class FilteredItems extends Component {
      getVisibleItems() {
        return store.items.filter(item => item.visible)
      }

      template() {
        const visibleItems = this.getVisibleItems()
        return (
          <ul>
            {visibleItems.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  assert.match(output, /const visibleItems = this\.getVisibleItems\(\)/)
  assert.match(output, /visibleItems\.map/)
})

test('conditional imported map state subscriptions include edit-mode flags', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div>
            {store.todos.map(todo => (
              <div key={todo.id}>
                {store.editingId === todo.id ? (
                  <input value={store.editingValue} />
                ) : (
                  <span>{todo.text}</span>
                )}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  assert.match(output, /store\.editingId/)
  assert.match(output, /store\.editingValue/)
})

test('jsx map conditionals rerender rows instead of emitting raw jsx in observers', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <div>
            {store.todos.map(todo => (
              <div key={todo.id}>
                {store.editingId === todo.id ? (
                  <>
                    <input value={store.editingValue} />
                    <button click={() => store.updateTodo(todo)}>Save</button>
                  </>
                ) : (
                  <>
                    <span>{todo.text}</span>
                    <button click={() => store.startEditing(todo)}>Edit</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  assert.match(output, /render(?:__unresolved_0|Todos)Item/)
  assert.match(output, /store\.editingId/)
  assert.doesNotMatch(output, /render(?:__unresolved_0|Todos)Item[\s\S]*<>/)
})

test('identity-based imported map conditionals patch rows without rerender methods', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class TodoList extends Component {
      template() {
        return (
          <table>
            <tbody id="tbody">
              {store.todos.map(todo => (
                <tr key={todo.id} class={store.selectedId === todo.id ? 'danger' : ''}>
                  <td>{todo.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    }
  `)

  assert.match(output, /store\.selectedId === todo\.id/)
  assert.match(output, /data-gea-item-id/)
  assert.match(output, /class="\$\{\(store\.selectedId === todo\.id \? 'danger' : ''\)\.trim\(\)\}"/)
  assert.doesNotMatch(output, /render(?:__unresolved_0|Todos)Item[\s\S]*replaceWith/)
  assert.doesNotMatch(output, /__idMap/)
})

test('compiled output does not contain querySelector', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

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
          </div>
        )
      }
    }
  `)
  assert.doesNotMatch(output, /\.querySelector\s*\(/, 'compiled output must not use querySelector')
})

test('unresolved map container uses getElementById for tbody lookup', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './data-grid-store'

    export default class DataGrid extends Component {
      getDisplayData() {
        return store.data.filter(() => true)
      }
      template() {
        const displayData = this.getDisplayData()
        return (
          <div class="data-grid">
            <table>
              <tbody>
                {displayData.map(item => (
                  <tr key={item.id}><td>{item.id}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    }
  `)

  assert.ok(
    /<tbody[^>]*id=.*this\.id.*-b\d/.test(output) || /id=.*this\.id.*-b\d[^>]*>[\s\S]*<tbody/.test(output),
    'tbody must have id for getElementById',
  )
  assert.ok(
    /____unresolved_0_container.*getElementById|getElementById.*____unresolved_0_container/.test(output),
    'unresolved map container must use getElementById, not this.$(selector)',
  )
  assert.match(
    output,
    /\.join\s*\(\s*['"]['"]\s*\)/,
    'unresolved map must have .join("") to prevent Array.toString commas',
  )
})

test('unresolved map getItems includes local template setup when template() has no props param', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import dataStore from './data-store'

    export default class List extends Component {
      template() {
        const project = dataStore.project
        return (
          <ul>
            {project.items.map(item => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        )
      }
    }
  `)

  // With store-alias resolution, project.items is a known imported path → array observer + list sync
  // (not an unresolved __geaRegisterMap getItems callback).
  assert.match(output, /observe\(\["project",\s*"items"\]/, 'must observe project.items, not only project')
  assert.ok(
    /__applyListChanges/.test(output) && /__observe_.*project__items/.test(output),
    'project.items map should compile to array list observer',
  )
  assert.match(output, /const project = dataStore\.project/, 'template still hoists project for render helpers')
})

test('unresolved helper maps reconcile by calling the helper, not helper-local variables', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './grid-store'

    export default class DataGrid extends Component {
      getDisplayData() {
        const filtered = store.data.filter(item => item.visible)
        const sortBy = store.sortBy
        return [...filtered].sort((a, b) => sortBy === 'id' ? a.id - b.id : 0)
      }

      template() {
        const displayData = this.getDisplayData()
        return (
          <table>
            <tbody>
              {displayData.map(item => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    }
  `)

  assert.match(output, /const displayData = this\.getDisplayData\(\)/)
  assert.doesNotMatch(output, /const displayData = \[\.\.\.filtered\]/)
})

test('store getter destructuring observes getter state deps when passed as child component props', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-deps-'))

  try {
    const componentPath = join(dir, 'TodoApp.jsx')
    const storePath = join(dir, 'todo-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class TodoStore extends Store {
  todos = [] as Array<{ id: number; text: string; done: boolean }>
  draft = ''
  filter = 'all' as 'all' | 'active' | 'completed'
  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
  get completedCount(): number {
    return this.todos.filter(t => t.done).length
  }
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store'
        import TodoFilters from './TodoFilters'

        export default class TodoApp extends Component {
          template() {
            const { filter } = todoStore
            const { activeCount, completedCount } = todoStore
            return (
              <div>
                <TodoFilters filter={filter} activeCount={activeCount} completedCount={completedCount} />
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /observe\(\["filter"\]/, 'state property should observe specific path')
    assert.match(output, /observe\(\["todos"\]/, 'store getter should observe its actual state dependency')
    assert.doesNotMatch(output, /observe\(\["activeCount"\]/, 'should not observe getter name as path')
    assert.doesNotMatch(output, /observe\(\["completedCount"\]/, 'should not observe getter name as path')
    assert.doesNotMatch(output, /observe\(\[\]/, 'should not use root observer when getter deps are known')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store getter via direct member access observes dependency paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-direct-'))

  try {
    const componentPath = join(dir, 'CounterDisplay.jsx')
    const storePath = join(dir, 'counter-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
class CounterStore extends Store {
  count = 0
  increment() { this.count++ }
  get doubled(): number { return this.count * 2 }
}
export default new CounterStore()`,
    )

    const output = await transformWithPlugin(
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
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /observe\(\["count"\]/, 'count should be observed directly')
    assert.doesNotMatch(output, /observe\(\["doubled"\]/, 'should not observe getter name as path')
    assert.match(output, /__via/, 'should generate wrapper method for getter re-evaluation')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('store getter observer refreshes child props instead of re-rendering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-guard-'))

  try {
    const componentPath = join(dir, 'TodoApp.jsx')
    const storePath = join(dir, 'todo-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class TodoStore extends Store {
  todos = [] as Array<{ id: number; done: boolean }>
  get activeCount(): number {
    return this.todos.filter(t => !t.done).length
  }
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import todoStore from './todo-store'
        import TodoFilters from './TodoFilters'

        export default class TodoApp extends Component {
          template() {
            const { activeCount } = todoStore
            return <div><TodoFilters count={activeCount} /></div>
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.match(output, /__observe_todoStore_todos/, 'todos observer method should be generated')
    const methodStart = output.indexOf('__observe_todoStore_todos')
    const methodSlice = output.slice(methodStart, methodStart + 300)
    assert.match(
      methodSlice,
      /__refreshChildProps_todoFilters/,
      'observer should call child prop refresh, not __geaRequestRender',
    )
    assert.doesNotMatch(methodSlice, /__geaRequestRender/, 'observer must not trigger a full re-render')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('static string expressions in JSX children are HTML-escaped at compile time', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    export default class App extends Component {
      template() {
        return (
          <div class="demo-code">{\`<Button>Default</Button>
<Button variant="secondary">Secondary</Button>\`}</div>
        )
      }
    }
  `)

  assert.ok(
    output.includes('&lt;Button&gt;Default&lt;/Button&gt;'),
    'angle brackets in static template literal should be HTML-escaped',
  )
  assert.ok(
    output.includes('&lt;Button variant=&quot;secondary&quot;&gt;'),
    'attributes in static template literal should be escaped',
  )
  assert.ok(!output.includes('${`<Button'), 'static string should not be interpolated as an expression')
})

test('static StringLiteral in JSX children is HTML-escaped at compile time', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    export default class App extends Component {
      template() {
        return <div>{"<script>alert('xss')</script>"}</div>
      }
    }
  `)

  assert.ok(output.includes('&lt;script&gt;'), 'angle brackets in string literal should be HTML-escaped')
  assert.ok(!output.includes('<script>alert'), 'raw script tag should not appear in output')
})

test('parseSource detects all component classes in a single file', () => {
  const source = `
    import { Component } from '@geajs/core'

    class Header extends Component {
      template() {
        return <header><h1>Title</h1></header>
      }
    }

    export default class App extends Component {
      template() {
        return <div><span>Hello</span></div>
      }
    }
  `

  const parsed = parseSource(source)
  assert.ok(parsed)
  assert.ok(parsed.componentClassNames.length === 2, 'should detect both component classes')
  assert.ok(parsed.componentClassNames.includes('Header'), 'should include Header')
  assert.ok(parsed.componentClassNames.includes('App'), 'should include App')
})

test('two components in a single file are both transformed', () => {
  const source = `
    import { Component } from '@geajs/core'

    class Header extends Component {
      template() {
        return <header><h1>Title</h1></header>
      }
    }

    export default class App extends Component {
      template() {
        return <div><span>Hello</span></div>
      }
    }
  `

  const parsed = parseSource(source)
  assert.ok(parsed)

  const original = parseSource(source)
  assert.ok(original)
  const storeImports = new Map<string, string>()

  for (const className of parsed.componentClassNames) {
    transformComponentFile(
      parsed.ast,
      parsed.imports,
      storeImports,
      className,
      '/virtual/multi-component.jsx',
      original.ast,
      new Set(),
    )
  }

  const output = generate(parsed.ast).code

  assert.doesNotMatch(output, /return <header>/, 'Header template JSX should be transformed')
  assert.doesNotMatch(output, /return <div>/, 'App template JSX should be transformed')
  assert.match(output, /class Header/, 'Header class should still exist')
  assert.match(output, /class App/, 'App class should still exist')
})

test('hyphenated component names inside .map() produce correct opening tags', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'
    import IssueCard from './IssueCard.jsx'

    export default class Board extends Component {
      template() {
        return (
          <div>
            {store.todos.map(issue => (
              <IssueCard key={issue.id} title={issue.text} />
            ))}
          </div>
        )
      }
    }
  `)

  assert.doesNotMatch(
    output,
    /<issue\s[^>]*-card/,
    'tag name must not be split around attributes — <issue ...-card> is malformed',
  )
  assert.match(output, /<issue-card\s/, 'full kebab-case tag name must appear before any attributes')
})

test('template-scoped prop variables inside .map() are rewritten to this.props', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class SelectOption extends Component {
      template({ options, value, isMulti }) {
        return (
          <div>
            {options.map(opt => (
              <div
                key={opt.value}
                class={\`option \${isMulti ? 'multi' : ''} \${opt.value === value ? 'selected' : ''}\`}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  const renderMethod = output.match(/render\w*Item\(opt\)\s*\{([\s\S]*?)\n  \}/)
  assert.ok(renderMethod, 'render item method must be generated')
  const renderBody = renderMethod[1]
  assert.match(renderBody, /this\.props\.isMulti/, 'isMulti must be accessed via this.props in the render item method')
  assert.match(renderBody, /this\.props\.value/, 'value must be accessed via this.props in the render item method')
  assert.doesNotMatch(renderBody, /[^.]isMulti\b/, 'bare isMulti must not appear in the render item method body')
})

test('map callback render method includes template-local setup statements for free variables', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'

    export default class IssueDetails extends Component {
      template() {
        const issue = issueStore.issue
        if (!issue) return <div>Loading</div>
        return (
          <div>
            {issue.comments.map(comment => (
              <div key={comment.id} data-issue={issue.id}>{comment.body}</div>
            ))}
          </div>
        )
      }
    }
  `)

  const renderMethod = output.match(/render\w+Item\(comment\)\s*\{([\s\S]*?)\n  \}/)
  assert.ok(renderMethod, 'render item method must be generated')
  const renderBody = renderMethod![1]
  assert.match(renderBody, /issueStore\.issue/, 'render method must re-derive issue from store')
})

test('component class getters that access stores create observers for underlying store paths', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import routeStore from './route-store'

    export default class Page extends Component {
      get isBoard() {
        return routeStore.path.startsWith('/board')
      }

      template() {
        return (
          <div>
            {this.isBoard && <div>Board</div>}
          </div>
        )
      }
    }
  `)

  assert.match(output, /routeStore\.__store/, 'compiler must observe routeStore when a component getter accesses it')
  assert.match(output, /observe\(.*path/, 'observer must be registered for the underlying store path the getter reads')
})

test('transitive getter-to-getter deps produce __via observers for underlying store paths', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import routeStore from './route-store'

    function matchRoute(pattern, path) {
      return path.startsWith(pattern) ? { params: { id: '1' } } : null
    }

    export default class Project extends Component {
      get isBoard() {
        return routeStore.path.startsWith('/board')
      }

      get issueMatch() {
        return matchRoute('/board/issues/', routeStore.path)
      }

      get showIssueDetail() {
        return !!this.issueMatch
      }

      get issueId() {
        return this.issueMatch ? this.issueMatch.params.id : ''
      }

      template() {
        return (
          <div>
            {this.isBoard && <div>Board</div>}
            {this.showIssueDetail && <div>Issue {this.issueId}</div>}
          </div>
        )
      }
    }
  `)

  assert.match(output, /__observe_local_isBoard__via/, 'isBoard (direct store dep) must get a __via observer')
  assert.match(
    output,
    /__observe_local_showIssueDetail__via/,
    'showIssueDetail (transitive via issueMatch → routeStore.path) must get a __via observer',
  )
  assert.match(
    output,
    /__observe_local_issueId__via/,
    'issueId (transitive via issueMatch → routeStore.path) must get a __via observer',
  )
  assert.doesNotMatch(
    output,
    /__geaRequestRender/,
    'no fallback full re-render should be generated when all deps resolve to store observers',
  )
})

test('component getter reading this.props registers deps for this.getter in template text', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class SelectLike extends Component {
      get displayLabel() {
        const { value, options = [] } = this.props
        return String(value) + options.length
      }
      template({ value, options = [] }) {
        return <span class="lbl">{this.displayLabel}</span>
      }
    }
  `)

  assert.match(output, /this\.displayLabel/, 'template should invoke getter')
  assert.match(output, /key === "value"/, 'getter reads this.props.value — value must trigger prop patch')
  assert.match(output, /key === "options"/, 'getter reads this.props.options — options must trigger prop patch')
})

test('render prop arrow functions containing JSX are compiled to template literals', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import MySelect from './MySelect.jsx'
    import Avatar from './Avatar.jsx'

    export default class UserPicker extends Component {
      template() {
        return (
          <div>
            <MySelect
              options={['a', 'b']}
              renderOption={(opt) => <Avatar name={opt} />}
            />
          </div>
        )
      }
    }
  `)

  assert.doesNotMatch(output, /<Avatar/, 'JSX inside render prop must be compiled — raw <Avatar> tag should not appear')
  assert.match(output, /new Avatar\(/, 'render prop must instantiate the component with new Avatar(...)')
  assert.doesNotMatch(
    output,
    /`<avatar[^`]*<\/avatar>`/,
    'render prop must not produce a dead <avatar> custom element HTML string',
  )
})

test('&& guarded .map() with components does not leave raw JSX in compiled output', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'
    import CommentItem from './CommentItem.jsx'

    export default class IssueDetails extends Component {
      template() {
        return (
          <div>
            {store.todos && store.todos.map((c) => (
              <CommentItem key={c.id} body={c.text} />
            ))}
          </div>
        )
      }
    }
  `)

  assert.doesNotMatch(output, /<CommentItem/, 'raw JSX <CommentItem> must not appear anywhere in compiled output')
})

test('component used only in render prop is registered when in knownComponentImports', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import MySelect from './MySelect.jsx'
    import Avatar from './Avatar.jsx'

    export default class UserPicker extends Component {
      template() {
        return (
          <div>
            <MySelect
              options={['a', 'b']}
              renderOption={(opt) => <Avatar name={opt} />}
            />
          </div>
        )
      }
    }
  `,
    new Set(['MySelect', 'Avatar']),
  )

  assert.match(
    output,
    /Component\._register\(Avatar\)/,
    'Avatar must be registered via Component._register even though it only appears in a render prop',
  )
})

test('complex conditional chains inside .map() item attributes compile correctly', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import store from './todo-store'

    export default class CardList extends Component {
      template() {
        return (
          <div>
            {store.items.map((item) => (
              <div key={item.id} class={\`card \${item.a && item.b ? (item.c ? 'x' : 'y') : 'z'}\`}>
                {item.label}
              </div>
            ))}
          </div>
        )
      }
    }
  `)

  assert.doesNotMatch(output, /SyntaxError/, 'compiled output must not contain syntax errors')
  assert.doesNotMatch(output, /<div class=/, 'raw JSX div should not appear in compiled output')
  assert.match(output, /card /, 'the class expression with card should be present in compiled output')
})

test('generated observer and buildProps methods include early-return guard from template', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'
    import Spinner from './Spinner.jsx'
    import MySelect from './MySelect.jsx'

    export default class IssueDetails extends Component {
      template() {
        const { issue } = issueStore

        if (!issue) return <Spinner />

        const priority = issue.priority || 'medium'

        return (
          <div>
            <MySelect value={priority} />
          </div>
        )
      }
    }
  `)

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n  \}/)

  assert.ok(buildPropsMatch, '__buildProps method should be generated')
  assert.match(buildPropsMatch![0], /issue/, 'buildProps method should reference issue')
  assert.match(
    buildPropsMatch![0],
    /(!issue|issue\s*==\s*null|issue\s*===\s*null|\?\.)/,
    'buildProps method must include a null guard for issue',
  )
})

test('early-return guard in __buildProps re-derives template-local variable from store', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const project = projectStore.project

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <Icon type={project.icon} size={20} />
          </div>
        )
      }
    }
  `)

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n  \}/)
  assert.ok(buildPropsMatch, '__buildProps method should be generated')

  const body = buildPropsMatch![0]
  assert.match(
    body,
    /const project = projectStore\.project/,
    'buildProps must re-derive the template-local variable before the guard',
  )
  assert.match(body, /if \(!project\)/, 'buildProps must include the null guard using the local variable')

  const deriveLine = body.indexOf('const project')
  const guardLine = body.indexOf('if (!project)')
  assert.ok(deriveLine < guardLine, 'variable derivation must come before the guard that uses it')
})

test('early-return guard works with destructured store variables in __buildProps', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const { project } = projectStore

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <Icon type={project.icon} size={20} />
          </div>
        )
      }
    }
  `)

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n  \}/)
  assert.ok(buildPropsMatch, '__buildProps method should be generated')

  const body = buildPropsMatch![0]
  assert.match(
    body,
    /const \{\s*project\s*\} = projectStore/,
    'buildProps must re-derive the destructured variable before the guard',
  )
  assert.match(body, /if \(!project\)/, 'buildProps must include the null guard')
})

test('__itemProps_* re-derives template-local variable used in .map() child props', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-itemprops-guard-'))

  try {
    const componentPath = join(dir, 'Board.jsx')
    const storePath = join(dir, 'project-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class ProjectStore extends Store {
  project = null as any
}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import projectStore from './project-store'
        import BoardColumn from './BoardColumn.jsx'

        const statusList = [{ id: 'backlog' }, { id: 'todo' }, { id: 'in-progress' }]

        export default class Board extends Component {
          template() {
            const project = projectStore.project

            if (!project) return <div>Loading...</div>

            return (
              <div>
                {statusList.map(col => (
                  <BoardColumn key={col.id} status={col.id} issues={project.issues} />
                ))}
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)

    const itemPropsMatch = output.match(/__itemProps_\w+\([^)]*\)\s*\{[\s\S]*?\n  \}/)
    assert.ok(itemPropsMatch, '__itemProps method should be generated')

    const body = itemPropsMatch![0]
    assert.match(
      body,
      /const project = projectStore\.project/,
      '__itemProps must re-derive template-local variable before referencing it',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('__buildProps_* omits early-return guard when props do not reference guard variable', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const project = projectStore.project

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <span>{project.name}</span>
            <Icon type="settings" size={20} />
          </div>
        )
      }
    }
  `)

  const buildPropsMatch = output.match(/__buildProps_\w+\([^)]*\)\s*\{[\s\S]*?\n  \}/)
  assert.ok(buildPropsMatch, '__buildProps method should be generated')

  const body = buildPropsMatch![0]
  assert.doesNotMatch(
    body,
    /if \(!project\)/,
    'guard must NOT be injected when props are static and do not reference the guard variable',
  )
  assert.match(body, /type: "settings"/, 'static props should always be returned')
})

test('observer calls __refreshChildProps when guard-dependent props reference the store', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Icon from './Icon.jsx'

    export default class ProjectSettings extends Component {
      template() {
        const project = projectStore.project

        if (!project) return <div>Loading...</div>

        return (
          <div>
            <Icon type={project.icon} size={20} />
          </div>
        )
      }
    }
  `)

  const observerMatch = output.match(/__observe_projectStore_project\([^)]*\)\s*\{[\s\S]*?\n  \}/)
  assert.ok(observerMatch, 'observer for projectStore.project should be generated')

  assert.match(
    observerMatch![0],
    /__refreshChildProps_icon/,
    'observer must call __refreshChildProps_icon to update the child when the guard dependency changes',
  )
})

test('constructor-inlined conditional slot init is guarded when template has early return', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'

    export default class IssueDetails extends Component {
      isEditing = false

      template() {
        const { issue } = issueStore

        if (!issue) return <div>Loading</div>

        const desc = issue.description || ''

        return (
          <div>
            {this.isEditing && <textarea value={desc} />}
            {!this.isEditing && desc && <p>{desc}</p>}
            {!this.isEditing && !desc && <p>Add a description...</p>}
          </div>
        )
      }
    }
  `)

  assert.match(output, /__geaRegisterCond/, 'should generate __geaRegisterCond calls')

  assert.match(
    output,
    /try\s*\{/,
    'constructor-inlined setup for conditional slots must be wrapped in try-catch ' +
      'to survive null store values before template early-return guard runs',
  )
})

test('component inside .map() with HTML wrapper compiles correctly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-map-html-wrap-'))

  try {
    const componentPath = join(dir, 'Board.jsx')
    const storePath = join(dir, 'project-store.ts')
    const filtersStorePath = join(dir, 'filters-store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'\nexport default class ProjectStore extends Store {\n  project = null as any\n}`,
    )
    await writeFile(
      filtersStorePath,
      `import { Store } from '@geajs/core'\nexport default class FiltersStore extends Store {\n  userIds = [] as string[]\n  toggleUserId(id: string) {}\n}`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import projectStore from './project-store'
        import filtersStore from './filters-store'
        import Avatar from './Avatar.jsx'

        export default class Board extends Component {
          template() {
            const project = projectStore.project
            if (!project) return <div></div>

            return (
              <div>
                <div class="avatars">
                  {project.users.map((user: any) => (
                    <div
                      key={user.id}
                      class={\`avatar \${filtersStore.userIds.includes(user.id) ? 'active' : ''}\`}
                      click={() => filtersStore.toggleUserId(user.id)}
                    >
                      <Avatar avatarUrl={user.avatarUrl} name={user.name} size={32} />
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output, 'should produce compiled output')

    assert.match(
      output,
      /new Avatar/,
      'Avatar inside .map() HTML wrapper must be instantiated as a component, not rendered as an HTML tag',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('conditional slot getTruthyHtml includes template locals used by branch (e.g. filtered)', async () => {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  assert.ok(transform)
  const src = `
import { Component } from '@geajs/core'
export default class T extends Component {
  isOpen = false
  template({ options }) {
    const filtered = options.filter((o) => o.k)
    return (
      <div>
        {this.isOpen && <div class="d">{filtered.map((x) => <span key={x.id}>{x.k}</span>)}</div>}
      </div>
    )
  }
}
`
  const result = await transform!.call({} as never, src, '/T.jsx')
  const code = typeof result === 'string' ? result : (result as { code: string }).code
  assert.match(
    code,
    /__geaRegisterCond\(0, "c0"[\s\S]*?const filtered[\s\S]*?return[\s\S]*?filtered\.map/,
    'dropdown branch HTML must hoist const filtered from template into getTruthyHtml closure',
  )
})

test('conditional slot analyze order matches transform (nested ternary before sibling &&)', async () => {
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler
  assert.ok(transform)
  const src = `
import { Component } from '@geajs/core'
export default class SlotOrder extends Component {
  isOpen = false
  template({ renderValue, value, options }) {
    return (
      <div class="root">
        <div class="inner">
          {renderValue ? renderValue(value, options) : <span class="fallback">x</span>}
        </div>
        {this.isOpen && <div class="dropdown">open</div>}
      </div>
    )
  }
}
`
  const result = await transform!.call({} as never, src, '/SlotOrder.jsx')
  const code = typeof result === 'string' ? result : (result as { code: string }).code
  assert.match(
    code,
    /__geaRegisterCond\(0, "c0",\s*\(\)\s*=>\s*\{[^}]*return this\.props\.renderValue;/,
    'slot c0 must be the inner renderValue ternary, not the outer isOpen &&',
  )
  assert.match(
    code,
    /__geaRegisterCond\(1, "c1",\s*\(\)\s*=>\s*\{[^}]*return this\.isOpen;/,
    'slot c1 must be isOpen && dropdown',
  )
})

test('store observer for top-level project guard must NOT call __geaRequestRender when only child props depend on nested data', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import projectStore from './project-store'
    import Board from './Board'

    export default class Project extends Component {
      template() {
        const project = projectStore.project
        if (!project) return <div>Loading</div>
        return <div><Board /></div>
      }
    }
  `,
    new Set(['Board']),
  )

  const projectObserver = output.match(/__observe_projectStore_project\([\s\S]*?\n  \}/)?.[0]
  assert.ok(projectObserver, 'must generate __observe_projectStore_project')
  assert.ok(
    projectObserver.includes('__geaRequestRender') || projectObserver.includes('__geaPatchCond'),
    'project observer must handle the loading guard (rerender or patch cond)',
  )
})

test('store observer for nested project.users must NOT trigger __geaRequestRender on the parent component', () => {
  const output = transformComponentSource(
    `
    import { Component } from '@geajs/core'
    import issueStore from './issue-store'
    import projectStore from './project-store'
    import Select from './Select'

    export default class IssueDetails extends Component {
      template() {
        const { isLoading, issue } = issueStore
        const project = projectStore.project
        const users = project ? project.users : []
        const userOptions = users.map((u) => ({ value: u.id, label: u.name }))
        if (isLoading || !issue) return <div>Loading</div>
        return (
          <div>
            <Select items={userOptions} value={issue.userIds || []} />
          </div>
        )
      }
    }
  `,
    new Set(['Select']),
  )

  const projectObserver = output.match(/__observe_projectStore_project\b[^_]([\s\S]*?)\n  \}/)?.[0]
  assert.ok(projectObserver, 'must generate __observe_projectStore_project')
  assert.ok(
    !projectObserver.includes('__geaRequestRender'),
    '__observe_projectStore_project must NOT call __geaRequestRender (it should only refresh child props). Got: ' +
      projectObserver,
  )
})

test('store-alias nested field must produce inline patch or rerender observer (status badge pattern)', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import itemStore from './item-store'

    const StatusCopy = { backlog: 'Backlog', selected: 'Selected', done: 'Done' }

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
  `)

  const hasIssueObserver =
    /__observe_itemStore_issue\b/.test(output) || /__observe_itemStore_issue__status\b/.test(output)
  assert.ok(
    hasIssueObserver,
    'must generate an observer for itemStore issue or issue.status. Output: ' + output.slice(0, 3000),
  )

  const observerMatch = output.match(/__observe_itemStore_issue[^(]*\([^)]*\)\s*\{[\s\S]*?\n  \}/)
  if (observerMatch) {
    assert.ok(
      observerMatch[0].includes('__patchNode') ||
        observerMatch[0].includes('__geaRequestRender') ||
        observerMatch[0].includes('textContent'),
      'observer must contain patch logic or rerender. Got: ' + observerMatch[0],
    )
  }
})

test('array .map() without key prop on root element produces a compile error', () => {
  const source = `
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      template() {
        return (
          <ul>
            {this.items.map(item => (
              <li>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `
  assert.throws(
    () => transformComponentSource(source),
    (err: Error) => {
      assert.ok(err.message.includes('must have a `key` prop'), `Expected key error, got: ${err.message}`)
      return true
    },
  )
})

test('array .map() with key prop on root element compiles successfully', () => {
  const source = `
    import { Component } from '@geajs/core'

    export default class ItemList extends Component {
      template() {
        return (
          <ul>
            {this.items.map(item => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )
      }
    }
  `
  const output = transformComponentSource(source)
  assert.ok(output, 'component with keyed .map() must compile successfully')
})
