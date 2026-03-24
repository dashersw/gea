import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import {
  transformComponentSource,
  transformWithPlugin,
  parseSource,
  transformComponentFile,
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
    assert.match(output, /export default class OptionStep extends Component/)
    assert.match(output, /template\(/)
    assert.match(output, /import.*Component.*from ['"]@geajs\/core['"]/)
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

  assert.match(output, /this\._fancyCounter = this\.__child\(FancyCounter/)
  assert.match(output, /this\._fancyCounter2 = this\.__child\(FancyCounter/)
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
  const updateTextIds = Array.from(output.matchAll(/this\.__updateText\('([^']+)'/g)).map(
    (match) => match[1],
  )
  assert.equal(new Set(selectors).size >= 2 || new Set(bindingIds).size >= 2 || new Set(updateTextIds).size >= 2, true)
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

test('imported component tags do not throw dynamic component error', () => {
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
    new Set(['Header']),
  )
  assert.ok(output, 'Should compile without errors')
})

test('static text with single quotes is escaped as &#39;', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Quote extends Component {
      template() {
        return <div>{"it's a test"}</div>
      }
    }
  `)
  assert.match(output, /it&#39;s a test/, 'Single quote should be escaped to &#39;')
})

// ---------------------------------------------------------------------------
// JSXNamespacedName handling
// ---------------------------------------------------------------------------
