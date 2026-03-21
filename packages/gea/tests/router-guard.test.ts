import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runGuards } from '../src/lib/router/guard'
import NoAccess from '../../../examples/router-v2/src/views/NotFound'

describe('runGuards', () => {
  it('returns true for empty list', () => {
    assert.equal(runGuards([]), true)
  })

  it('returns true when all guards pass', () => {
    const guards = [() => true as const, () => true as const, () => true as const]
    assert.equal(runGuards(guards), true)
  })

  it('returns first non-true result (redirect string)', () => {
    const guards = [() => true as const, () => '/login', () => true as const]
    assert.equal(runGuards(guards), '/login')
  })

  it('returns first non-true result (component class)', () => {
    const guards = [() => true as const, () => NoAccess, () => true as const]
    assert.equal(runGuards(guards), NoAccess)
  })

  it('short-circuits at first non-true result', () => {
    let thirdCalled = false
    const guards = [
      () => true as const,
      () => '/denied',
      () => {
        thirdCalled = true
        return true as const
      },
    ]
    runGuards(guards)
    assert.equal(thirdCalled, false)
  })

  it('handles single guard that passes', () => {
    assert.equal(runGuards([() => true as const]), true)
  })

  it('handles single guard that fails', () => {
    assert.equal(runGuards([() => '/nope']), '/nope')
  })
})
