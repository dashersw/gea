/**
 * Regression: folder + label navigation should not duplicate rows in the derived list.
 * (Port of deleted example-email-client-jsdom “Sent → Travel → Inbox” scenario, store-level.)
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EmailStore } from '../../../../examples/email-client/store'

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('EmailStore – folder + label list integrity', () => {
  it('Sent → filter Travel (possibly empty) → Inbox: folderEmails has unique ids', async () => {
    const s = new EmailStore() as InstanceType<typeof EmailStore>
    s.selectFolder('sent')
    await flush()
    s.toggleLabelFilter('travel')
    await flush()
    s.selectFolder('inbox')
    await flush()
    const ids = s.folderEmails.map((e) => e.id)
    assert.equal(new Set(ids).size, ids.length, 'no duplicate rows in derived list')
  })
})
