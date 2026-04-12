import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { transformComponentSource, transformWithPlugin, t } from './plugin-helpers'

// v2 compiler handles spread attributes gracefully (no longer throws)
test('spread attributes compile without errors in v2', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Card extends Component {
      template() {
        return <div {...this.props} class="card">Hello</div>
      }
    }
  `)
  assert.ok(output, 'spread attributes should compile successfully in v2')
  assert.match(output, /GEA_CREATE_TEMPLATE/, 'output should have GEA_CREATE_TEMPLATE method')
})

// v2 compiler handles dynamic component tags (uppercase variables treated as components)
test('dynamic component tags compile without errors in v2', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class Wrapper extends Component {
      template() {
        const Tag = this.as || 'div'
        return <Tag class="wrapper">Content</Tag>
      }
    }
  `)
  assert.ok(output, 'dynamic component tags should compile in v2')
  assert.match(output, /GEA_CREATE_TEMPLATE/, 'output should have GEA_CREATE_TEMPLATE method')
})

// v2 compiler handles function-as-child (transforms the arrow function)
test('function-as-child compiles without error in v2', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class App extends Component {
      template() {
        return (
          <div>
            {(user) => <span>{user.name}</span>}
          </div>
        )
      }
    }
  `)
  assert.ok(output, 'function-as-child should compile in v2')
  assert.match(output, /template/, 'output should use template() calls')
})

// v2 compiler handles function expression as child
test('function expression as child compiles without error in v2', () => {
  const output = transformComponentSource(`
    import { Component } from '@geajs/core'

    export default class App extends Component {
      template() {
        return (
          <div>
            {function(ctx) { return <span>{ctx.name}</span> }}
          </div>
        )
      }
    }
  `)
  assert.ok(output, 'function expression as child should compile in v2')
})

// v2 compiler handles named JSX component exports
test('named JSX component exports compile in v2', () => {
  const output = transformComponentSource(`
    export const Header = ({ title }) => <h1>{title}</h1>
    export default function App() {
      return <div><Header title="hi" /></div>
    }
  `)
  assert.ok(output, 'named JSX component exports should compile in v2')
  assert.match(output, /template/, 'output should use template() calls')
})

// v2 compiler handles named function declaration export returning JSX
test('named function declaration export returning JSX compiles in v2', () => {
  const output = transformComponentSource(`
    export function Sidebar() {
      return <nav>Links</nav>
    }
    export default function App() {
      return <div>Main</div>
    }
  `)
  assert.ok(output, 'named function export should compile in v2')
})

// v2 compiles non-JSX named exports without issue
test('named export of non-JSX function with JSX default export compiles', () => {
  const result = transformComponentSource(`
    export const add = (a, b) => a + b
    export default function App() {
      return <div>Main</div>
    }
  `)
  assert.ok(result, 'transformComponentSource should succeed for non-JSX named exports alongside JSX')
})

// v2 compiler handles fragments in .map()
test('fragments in .map() compile without errors in v2', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-frag-test-'))
  try {
    const storePath = join(dir, 'store.ts')
    await writeFile(storePath, 'export default { items: [{ id: 1, term: "a", def: "b" }] }')
    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class DefinitionList extends Component {
          template() {
            return (
              <dl>
                {store.items.map(item => (
                  <>
                    <dt key={item.id}>{item.term}</dt>
                    <dd>{item.def}</dd>
                  </>
                ))}
              </dl>
            )
          }
        }
      `,
      storePath.replace('store.ts', 'DefinitionList.tsx'),
    )
    assert.ok(output, 'fragments in .map() should compile in v2')
    assert.match(output!, /template/, 'output should use template() calls')
  } finally {
    await rm(dir, { recursive: true })
  }
})

