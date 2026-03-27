import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('jsx-runtime', () => {
  it('exports jsx, jsxs, jsxDev, and Fragment', async () => {
    // Adding a timestamp to bypass module cache for a clean test
    const seed = `idx-${Date.now()}-${Math.random()}`
    const runtime = await import(`../src/jsx-runtime?${seed}`)

    assert.ok(runtime.jsx, 'jsx should be exported')
    assert.ok(runtime.jsxs, 'jsxs should be exported')
    assert.ok(runtime.jsxDev, 'jsxDev should be exported')
    assert.ok(runtime.Fragment, 'Fragment should be exported')

    assert.equal(typeof runtime.jsx, 'function')
    assert.equal(typeof runtime.jsxs, 'function')
    assert.equal(typeof runtime.jsxDev, 'function')
    assert.equal(typeof runtime.Fragment, 'function')
  })
})
