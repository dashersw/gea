import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveLazy } from '../src/lib/router/lazy'
import Home from '../../../examples/router-simple/src/views/Home'

describe('resolveLazy', () => {
  it('resolves default export', async () => {
    const loader = () => Promise.resolve({ default: Home })
    const result = await resolveLazy(loader)
    assert.equal(result, Home)
  })

  it('resolves direct export (no default)', async () => {
    const loader = () => Promise.resolve(Home)
    const result = await resolveLazy(loader)
    assert.equal(result, Home)
  })

  it('throws on import failure', async () => {
    const loader = () => Promise.reject(new Error('chunk failed'))
    await assert.rejects(() => resolveLazy(loader, 0), {
      message: 'chunk failed',
    })
  })

  it('retries on failure then succeeds', async () => {
    let calls = 0
    const loader = () => {
      calls++
      if (calls < 3) return Promise.reject(new Error('network error'))
      return Promise.resolve({ default: Home })
    }
    const result = await resolveLazy(loader, 3, 0)
    assert.equal(result, Home)
    assert.equal(calls, 3)
  })
})
