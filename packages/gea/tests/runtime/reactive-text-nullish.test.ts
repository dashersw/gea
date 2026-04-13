/**
 * Coercion edge cases for reactiveText getter mode (|| / null clearing).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveText } from '../../src/runtime/reactive-text'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveText – nullish / || semantics', () => {
  it('getter () => v || "" clears when v becomes null', async () => {
    const s = new Store({ v: 'X' as string | null }) as { v: string | null }
    const node = document.createTextNode('')
    const d = createDisposer()
    reactiveText(node, d, s, () => s.v || '')
    assert.equal(node.nodeValue, 'X')
    s.v = null
    await flush()
    assert.equal(node.nodeValue, '', 'null must not leave prior text in place')
  })
})
