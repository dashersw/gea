import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { transformComponentSource, transformWithPlugin, parseSource, t } from './plugin-helpers'

test('spread attributes throw a compile error', () => {
  assert.throws(
    () =>
      transformComponentSource(`
        import { Component } from '@geajs/core'

        export default class Card extends Component {
          template() {
            return <div {...this.props} class="card">Hello</div>
          }
        }
      `),
    (err: Error) => {
      assert.ok(err.message.includes('[gea]'), 'Error should be prefixed with [gea]')
      assert.ok(err.message.includes('Spread attributes'), 'Error should mention spread attributes')
      assert.ok(err.message.includes('not supported'), 'Error should say not supported')
      return true
    },
  )
})

test('spread attributes error includes the element tag name', () => {
  assert.throws(
    () =>
      transformComponentSource(`
        import { Component } from '@geajs/core'

        export default class Btn extends Component {
          template() {
            return <button {...this.attrs}>Click</button>
          }
        }
      `),
    (err: Error) => {
      assert.ok(err.message.includes('button'), `Error should include the tag name "button", got: ${err.message}`)
      return true
    },
  )
})

test('dynamic component tags throw a compile error', () => {
  assert.throws(
    () =>
      transformComponentSource(`
        import { Component } from '@geajs/core'

        export default class Wrapper extends Component {
          template() {
            const Tag = this.as || 'div'
            return <Tag class="wrapper">Content</Tag>
          }
        }
      `),
    (err: Error) => {
      assert.ok(err.message.includes('[gea]'), 'Error should be prefixed with [gea]')
      assert.ok(err.message.includes('not imported'), 'Error should mention the component is not imported')
      assert.ok(err.message.includes('Tag'), `Error should include the tag name "Tag", got: ${err.message}`)
      return true
    },
  )
})

test('function-as-child throws a compile error', () => {
  assert.throws(
    () =>
      transformComponentSource(`
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
      `),
    (err: Error) => {
      assert.ok(err.message.includes('[gea]'), 'Error should be prefixed with [gea]')
      assert.ok(
        err.message.includes('Function-as-child'),
        `Error should mention function-as-child, got: ${err.message}`,
      )
      return true
    },
  )
})

test('function expression as child also throws', () => {
  assert.throws(
    () =>
      transformComponentSource(`
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
      `),
    (err: Error) => {
      assert.ok(err.message.includes('Function-as-child'), `Expected function-as-child error, got: ${err.message}`)
      return true
    },
  )
})

test('named JSX component exports throw a compile error', () => {
  assert.throws(
    () => {
      parseSource(`
        export const Header = ({ title }) => <h1>{title}</h1>
        export default function App() {
          return <div><Header title="hi" /></div>
        }
      `)
    },
    (err: Error) => {
      assert.ok(err.message.includes('[gea]'), 'Error should be prefixed with [gea]')
      assert.ok(err.message.includes('Header'), `Error should include component name, got: ${err.message}`)
      assert.ok(
        err.message.includes('Named JSX component export'),
        `Error should mention named export, got: ${err.message}`,
      )
      return true
    },
  )
})

test('named function declaration export returning JSX throws', () => {
  assert.throws(
    () => {
      parseSource(`
        export function Sidebar() {
          return <nav>Links</nav>
        }
        export default function App() {
          return <div>Main</div>
        }
      `)
    },
    (err: Error) => {
      assert.ok(err.message.includes('Sidebar'), `Error should include "Sidebar", got: ${err.message}`)
      return true
    },
  )
})

test('named export of non-JSX function does not throw', () => {
  const result = parseSource(`
    export const add = (a, b) => a + b
    export default function App() {
      return <div>Main</div>
    }
  `)
  assert.ok(result, 'parseSource should succeed for non-JSX named exports')
})

test('fragments as .map() item roots throw a compile error (key validation catches fragments first)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-frag-test-'))
  try {
    const storePath = join(dir, 'store.ts')
    await writeFile(storePath, 'export default { items: [{ id: 1, term: "a", def: "b" }] }')
    await assert.rejects(
      async () =>
        await transformWithPlugin(
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
        ),
      (err: Error) => {
        assert.ok(err.message.includes('[gea]'), `Error should be prefixed with [gea], got: ${err.message}`)
        assert.ok(
          err.message.includes('key') || err.message.includes('Fragments'),
          `Error should mention key or fragments, got: ${err.message}`,
        )
        return true
      },
    )
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('fragment root in generateRenderItemMethod throws fragment-specific error', async () => {
  const { generateRenderItemMethod } = await import('../../src/codegen/array-compiler.ts')
  const fragmentTemplate = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [
    t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('dt'), []), t.jsxClosingElement(t.jsxIdentifier('dt')), []),
  ])
  assert.throws(
    () =>
      generateRenderItemMethod(
        {
          arrayPathParts: ['items'],
          itemVariable: 'item',
          itemIdProperty: 'id',
          containerBindingId: 'b0',
          itemTemplate: fragmentTemplate,
        } as any,
        new Map(),
        { value: 0 },
      ),
    (err: Error) => {
      assert.ok(err.message.includes('Fragments'), `Error should mention fragments, got: ${err.message}`)
      assert.ok(err.message.includes('not supported'), `Error should say not supported, got: ${err.message}`)
      return true
    },
  )
})
