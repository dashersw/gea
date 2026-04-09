/**
 * Getter dependency analysis must track `this.__stack`, `this._items`, `this.name_`, etc.
 * as real backing paths (same issue class as GitHub #35).
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { transformWithPlugin } from './plugin-helpers'

test('getter reading this.__stack wires observe path __stack for .map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-__stack-'))

  try {
    const componentPath = join(dir, 'List.jsx')
    const storePath = join(dir, 'store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class S extends Store {
  __stack: Array<{ id: string }> = [{ id: '1' }]
  get stack() {
    return this.__stack
  }
}
`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class List extends Component {
          template() {
            return (
              <div>
                {store.stack.map((row) => (
                  <span key={row.id}>{row.id}</span>
                ))}
              </div>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.ok(
      output.includes('__stack'),
      'compiled output must reference backing field __stack (observe / map delegate / getter deps)',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getter reading this._items wires observe path _items for .map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-_items-'))

  try {
    const componentPath = join(dir, 'List.jsx')
    const storePath = join(dir, 'store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class S extends Store {
  _items: string[] = ['a']
  get items() {
    return this._items
  }
}
`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class List extends Component {
          template() {
            return (
              <ul>
                {store.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.ok(
      output.includes('_items'),
      'compiled output must reference backing field _items when getter reads this._items',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getter reading this.name_ wires observe path name_', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gea-getter-name_-'))

  try {
    const componentPath = join(dir, 'Row.jsx')
    const storePath = join(dir, 'store.ts')

    await writeFile(
      storePath,
      `import { Store } from '@geajs/core'
export default class S extends Store {
  name_ = 'x'
  get display() {
    return this.name_
  }
}
`,
    )

    const output = await transformWithPlugin(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class Row extends Component {
          template() {
            return <span>{store.display}</span>
          }
        }
      `,
      componentPath,
    )

    assert.ok(output)
    assert.ok(
      output.includes('name_'),
      'compiled output must reference backing field name_ when getter reads this.name_',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
