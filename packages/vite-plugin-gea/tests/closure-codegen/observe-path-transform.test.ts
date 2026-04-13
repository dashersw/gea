import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transformDottedObserveCalls } from '../../src/closure-codegen/transform/transform-observe-paths.ts'

describe('transformDottedObserveCalls', () => {
  it('rewrites dotted observe strings to array paths', () => {
    const source = `import store from './store'
store.observe('user.profile.name', (value) => console.log(value))
store.observe('count', () => {})
`
    const result = transformDottedObserveCalls(source)

    assert.ok(result?.changed)
    assert.match(result.code, /store\.observe\(\["user", "profile", "name"\]/)
    assert.match(result.code, /store\.observe\('count'/)
  })

  it('leaves dynamic and already-array observe paths alone', () => {
    const source = `const path = 'user.profile.name'
store.observe(path, fn)
store.observe(['user', 'profile', 'name'], fn)
`
    const result = transformDottedObserveCalls(source)

    assert.equal(result, null)
  })
})
