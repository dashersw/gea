/**
 * runCreated — runs `created()` with prop reads marked as kept.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCreated } from '../../src/runtime/jsx-reads'

const CREATING = Symbol.for('gea.jsx.creating')
const depth = (): unknown => (globalThis as any)[CREATING]

describe('runCreated', () => {
  it('raises the depth compiled prop thunks read while created() runs', () => {
    const before = depth()
    const seen: unknown[] = []
    runCreated(
      {
        created(props: unknown) {
          seen.push(props, depth())
          runCreated({ created: () => seen.push(depth()) }, null)
          seen.push(depth())
        },
      },
      'props',
    )
    assert.deepEqual(seen, ['props', 1, 2, 1])
    assert.equal(depth(), before === undefined ? 0 : before)
  })

  it('restores the depth when created() throws', () => {
    runCreated({ created() {} }, null)
    assert.throws(() =>
      runCreated(
        {
          created() {
            throw new Error('boom')
          },
        },
        null,
      ),
    )
    assert.equal(depth(), 0)
  })
})
