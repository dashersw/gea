import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformCompiledStoreModule } from '../../src/closure-codegen/transform/transform-store.ts'

describe('transformCompiledStoreModule', () => {
  it('should transform to CompiledStore without false positives from JSDoc comments containing Store.', () => {
    const input = `
      import { Store } from '@geajs/core'
      /**
       * JSDoc comment test: Store.property
       * This is Store.
       * .Store
       */
      export class MyStore extends Store {
        data = []
        selected = null
        run() {}
        runLots() {}
        add() {}
        update() {}
        clear() {}
        swapRows() {}
        select() {}
        remove() {}
      }
      export default new MyStore()
    `

    const result = transformCompiledStoreModule(input, 'MyStore.ts')
    assert.ok(result)
    assert.strictEqual(result.changed, true)
    assert.match(result.code, /extends Compiled(?:Lean)?Store/)
  })

  it('should transform without false positives from single-line comments containing Store.', () => {
    const input = `
      import { Store } from '@geajs/core'
      // FIXME: Store.reset() needs fix
      export class MyStore extends Store {
        data = []
        selected = null
        run() {}
        runLots() {}
        add() {}
        update() {}
        clear() {}
        swapRows() {}
        select() {}
        remove() {}
      }
      export default new MyStore()
    `

    const result = transformCompiledStoreModule(input, 'MyStore.ts')
    assert.ok(result)
    assert.strictEqual(result.changed, true)
    assert.match(result.code, /extends Compiled(?:Lean)?Store/)
  })

  it('should fall back when source code contains static Store. calls', () => {
    const input = `
      import { Store } from '@geajs/core'
      Store.someMethod()
      export class MyStore extends Store {}
      export default new MyStore()
    `

    const result = transformCompiledStoreModule(input, 'MyStore.ts')
    assert.ok(result)
    assert.strictEqual(result.changed, false)
    assert.doesNotMatch(result.code, /extends Compiled(?:Lean)?Store/)
  })

  it('should fall back when optional Store member access (Store?.someMethod) is present', () => {
    const input = `
      import { Store } from '@geajs/core'
      Store?.someMethod()
      export class MyStore extends Store {}
      export default new MyStore()
    `

    const result = transformCompiledStoreModule(input, 'MyStore.ts')
    assert.ok(result)
    assert.strictEqual(result.changed, false)
    assert.doesNotMatch(result.code, /extends Compiled(?:Lean)?Store/)
  })

  it('should fall back when Store. is called after // inside a string literal', () => {
    const input = `
      import { Store } from '@geajs/core'
      const url = "https://example.com"; Store.someMethod()
      export class MyStore extends Store {
        data = []
        run() {}
      }
      export default new MyStore()
    `
    const result = transformCompiledStoreModule(input, 'MyStore.ts')
    assert.ok(result)
    assert.strictEqual(result.changed, false)
    assert.doesNotMatch(result.code, /extends Compiled(?:Lean)?Store/)
  })
})