import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runInSSRContext } from '../src/ssr-context.ts'
import getUid from '../../gea/src/lib/base/uid.ts'

describe('SSR UID isolation', () => {
  it('concurrent SSR contexts get independent UID sequences', async () => {
    const results: string[][] = []

    const run = async (index: number) => {
      return runInSSRContext([], () => {
        const ids = [getUid(), getUid(), getUid()]
        results[index] = ids
        return ids
      })
    }

    await Promise.all([run(0), run(1)])

    // Both contexts should produce the same deterministic sequence
    assert.deepEqual(results[0], results[1],
      'Concurrent SSR contexts should produce identical UID sequences')
  })

  it('UID sequence starts from seed 0 inside SSR context', () => {
    let ids: string[] = []
    runInSSRContext([], () => {
      ids = [getUid(), getUid()]
    })
    assert.equal(ids[0], '0', 'First UID in SSR context should be "0"')
    assert.equal(ids[1], '1', 'Second UID in SSR context should be "1"')
  })
})
