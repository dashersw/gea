/**
 * v2 getter dependency tracking: store getters with underscore-prefixed backing fields.
 *
 * In v2, the compiled component accesses the getter at runtime (e.g. store.stack),
 * and the signal system automatically tracks dependencies on the underlying backing
 * signals (____stack, etc.). The compiled *store* uses wrapSignalValue for getters.
 *
 * These tests verify:
 * 1. The component compiles and uses the getter via computation/keyedList.
 * 2. The store getter compilation wraps backing fields with wrapSignalValue.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { transformComponentSource, transformWithPlugin } from './plugin-helpers'

test('getter reading this.__stack compiles store with wrapSignalValue and component with keyedList', async () => {
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
    // v2 component uses store.stack via keyedList — the getter is called at runtime
    assert.match(output, /keyedList\(/, 'component must use keyedList for .map()')
    assert.match(output, /store\.stack/, 'component must access the getter store.stack')

    // Also verify the store itself compiles the backing field correctly
    const storeOutput = await transformWithPlugin(
      `import { Store } from '@geajs/core'
export default class S extends Store {
  __stack: Array<{ id: string }> = [{ id: '1' }]
  get stack() {
    return this.__stack
  }
}
`,
      storePath,
    )

    assert.ok(storeOutput)
    assert.match(storeOutput, /wrapSignalValue/, 'store getter must use wrapSignalValue for reactive access')
    assert.match(storeOutput, /Symbol.for.*gea.field.__stack/, 'store must use Symbol.for for __stack field')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getter reading this._items compiles store with wrapSignalValue and component with keyedList', async () => {
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
    // v2 component uses store.items via keyedList
    assert.match(output, /keyedList\(/, 'component must use keyedList for .map()')
    assert.match(output, /store\.items/, 'component must access the getter store.items')

    // Verify store compilation
    const storeOutput = await transformWithPlugin(
      `import { Store } from '@geajs/core'
export default class S extends Store {
  _items: string[] = ['a']
  get items() {
    return this._items
  }
}
`,
      storePath,
    )

    assert.ok(storeOutput)
    assert.match(storeOutput, /wrapSignalValue/, 'store getter must use wrapSignalValue')
    assert.match(storeOutput, /Symbol.for.*gea.field._items/, 'store must use Symbol.for for _items field')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getter reading this.name_ compiles store with wrapSignalValue and component with computation', async () => {
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
    // v2 component uses store.display via computation — signal tracking handles dependency
    assert.match(output, /computation\(/, 'component must use computation for reactive text')
    assert.match(output, /store\.display/, 'component must access the getter store.display')

    // Verify store compilation
    const storeOutput = await transformWithPlugin(
      `import { Store } from '@geajs/core'
export default class S extends Store {
  name_ = 'x'
  get display() {
    return this.name_
  }
}
`,
      storePath,
    )

    assert.ok(storeOutput)
    assert.match(storeOutput, /wrapSignalValue/, 'store getter must use wrapSignalValue')
    assert.match(storeOutput, /Symbol.for.*gea.field.name_/, 'store must use Symbol.for for name_ field')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
