import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import {
  transformComponentSource,
  transformWithPlugin,
  generate,
} from './plugin-helpers'

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
    // v2 keeps function components as functions (transforms JSX inline)
    assert.match(output, /export default function OptionStep/, 'should keep function component as a function')
    assert.match(output, /template\(/, 'should use template() calls for JSX elements')
    assert.match(output, /mount\(StepHeader/, 'should mount StepHeader child component')
    assert.match(output, /mount\(OptionItem/, 'should mount OptionItem child component')
    assert.match(output, /keyedList/, 'should use keyedList for .map() with keys')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
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

  // v2 uses mount for child components
  const mountCalls = output.match(/mount\(FancyCounter/g)
  assert.ok(mountCalls, 'should have mount(FancyCounter calls')
  assert.equal(mountCalls!.length, 2, 'should mount FancyCounter twice')
})

test('prop-based component uses reactiveContent for prop display', () => {
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

  // v2 uses reactiveContent or computation for prop display
  assert.match(output, /reactiveContent|computation/, 'should use reactiveContent or computation for prop display')
  assert.match(output, /__props/, 'should reference __props')
})

test('generated template distinguishes repeated sibling elements', () => {
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

  // v2 uses computation() for dynamic text with tree walker references
  const computations = output.match(/computation\(/g)
  assert.ok(computations, 'should have computation() calls')
  assert.ok(computations!.length >= 2, 'should have at least 2 computation() calls for left and right')
  // v2 navigates with firstElementChild/nextElementSibling
  assert.match(output, /firstElementChild/, 'should use DOM tree walking')
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

test('static string expressions in JSX children use createTextNode (safe by default)', () => {
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

  // v2 uses createTextNode or computation with .data = for static text,
  // which is inherently safe (DOM text nodes don't interpret HTML)
  assert.match(
    output,
    /createTextNode|\.data\s*=/,
    'static string expression should use createTextNode or .data = (safe text assignment)',
  )
  assert.ok(!output.includes('innerHTML'), 'static string should not use innerHTML')
})

test('static StringLiteral in JSX children uses createTextNode (safe by default)', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    export default class App extends Component {
      template() {
        return <div>{"<script>alert('xss')</script>"}</div>
      }
    }
  `)

  // v2 uses createTextNode for static strings — inherently XSS-safe
  assert.match(output, /createTextNode/, 'static string literal should use createTextNode')
  assert.ok(!output.includes('innerHTML'), 'static string should not use innerHTML')
})

test('two components in a single file are both transformed', () => {
  const output = transformComponentSource(`
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
  `)

  // v2 transforms both components
  assert.doesNotMatch(output, /return <header>/, 'Header template JSX should be transformed')
  assert.doesNotMatch(output, /return <div>/, 'App template JSX should be transformed')
  assert.match(output, /class Header/, 'Header class should still exist')
  assert.match(output, /class App/, 'App class should still exist')
  // Both should have GEA_CREATE_TEMPLATE
  const createTemplateCalls = output.match(/\[GEA_CREATE_TEMPLATE\]\(/g)
  assert.ok(createTemplateCalls, 'should have [GEA_CREATE_TEMPLATE] methods')
  assert.equal(createTemplateCalls!.length, 2, 'both components should have [GEA_CREATE_TEMPLATE]')
})

test('render prop arrow functions containing JSX are compiled to mount calls', () => {
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
  assert.match(output, /mount\(Avatar/, 'render prop must instantiate the component with mount(Avatar, ...)')
})

test('imported component tags compile successfully', () => {
  const output = transformComponentSource(
    `
      import { Component } from '@geajs/core'
      import Header from './Header'

      export default class Page extends Component {
        template() {
          return (
            <div>
              <Header title="Hello" />
            </div>
          )
        }
      }
    `,
  )
  assert.ok(output, 'Should compile without errors')
  assert.match(output, /mount\(Header/, 'Should use mount for imported component')
})

test('static text with single quotes uses createTextNode (safe by default)', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Quote extends Component {
      template() {
        return <div>{"it's a test"}</div>
      }
    }
  `)
  // v2 uses createTextNode for static text — quotes are naturally safe
  assert.match(output, /createTextNode.*it's a test/, 'Single quote text should use createTextNode')
})

// ---------------------------------------------------------------------------
// Render prop / dynamic content function calls
// ---------------------------------------------------------------------------

test('render prop call result does not use geaEscapeHtml (v2 uses DOM operations)', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'
    import SummaryContent from './SummaryContent'

    export default class Main extends Component {
      activeTabIndex = 0
      tabs = [
        { index: 0, title: "Summary", content: () => <SummaryContent /> },
      ]

      template() {
        const activeTab = this.tabs[this.activeTabIndex]
        return (
          <div class="main">
            <div class="tab-content">
              {activeTab.content()}
            </div>
          </div>
        )
      }
    }
  `)

  // v2 does not use geaEscapeHtml — it uses DOM operations
  assert.ok(
    !output.includes('geaEscapeHtml'),
    'v2 should not use geaEscapeHtml, uses DOM operations instead',
  )
})
