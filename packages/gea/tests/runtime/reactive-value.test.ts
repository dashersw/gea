/**
 * reactiveValue — two-way bind input/textarea/select .value.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Store } from '../../src/store'
import { createDisposer } from '../../src/runtime/disposer'
import { reactiveValue } from '../../src/runtime/reactive-value'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('reactiveValue – store → el', () => {
  it('sets initial input.value from store', async () => {
    const s = new Store({ name: 'alice' }) as any
    const input = document.createElement('input') as HTMLInputElement
    const d = createDisposer()
    reactiveValue(input, d, s, ['name'])
    await flush()
    assert.equal(input.value, 'alice')
  })
  it('does not control an input while the source is initially undefined', async () => {
    const s = new Store({ name: undefined }) as any
    const input = document.createElement('input') as HTMLInputElement
    const d = createDisposer()
    reactiveValue(input, d, s, ['name'])
    await flush()

    input.value = 'typed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    assert.equal(input.value, 'typed')
  })
  it('updates input.value on store mutation', async () => {
    const s = new Store({ name: 'alice' }) as any
    const input = document.createElement('input') as HTMLInputElement
    const d = createDisposer()
    reactiveValue(input, d, s, ['name'])
    await flush()
    s.name = 'bob'
    await flush()
    assert.equal(input.value, 'bob')
  })
  it('dispose halts store → el updates', async () => {
    const s = new Store({ name: 'alice' }) as any
    const input = document.createElement('input') as HTMLInputElement
    const d = createDisposer()
    reactiveValue(input, d, s, ['name'])
    await flush()
    d.dispose()
    s.name = 'carol'
    await flush()
    assert.equal(input.value, 'alice')
  })
  it('does not reconcile browser input events unless requested', async () => {
    const s = new Store({ estimate: 8 }) as any
    const input = document.createElement('input') as HTMLInputElement
    document.body.appendChild(input)
    const d = createDisposer()
    reactiveValue(input, d, s, ['estimate'])
    await flush()

    input.value = '20'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()

    assert.equal(input.value, '20')
  })
})

describe('reactiveValue – el → store via writeBack', () => {
  it('writeBack receives input value on input event', async () => {
    const s = new Store({ name: '' }) as any
    const input = document.createElement('input') as HTMLInputElement
    document.body.appendChild(input)
    const d = createDisposer()
    const seen: string[] = []
    reactiveValue(input, d, s, ['name'], (v) => {
      seen.push(v)
      s.name = v
    })
    input.value = 'typed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    assert.deepEqual(seen, ['typed'])
  })
  it('dispose removes input listener', async () => {
    const s = new Store({ name: '' }) as any
    const input = document.createElement('input') as HTMLInputElement
    document.body.appendChild(input)
    const d = createDisposer()
    let count = 0
    reactiveValue(input, d, s, ['name'], () => {
      count++
    })
    input.value = 'a'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    d.dispose()
    input.value = 'b'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    assert.equal(count, 1)
  })
})

describe('reactiveValue – getter mode', () => {
  it('reacts to tracked getter deps', async () => {
    const s = new Store({ a: 'hello', b: 'world' }) as any
    const input = document.createElement('input') as HTMLInputElement
    const d = createDisposer()
    reactiveValue(input, d, s, () => s.a + ' ' + s.b)
    assert.equal(input.value, 'hello world')
    s.b = 'there'
    await flush()
    assert.equal(input.value, 'hello there')
  })
})
