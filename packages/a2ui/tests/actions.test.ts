import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { createRootScope } from '../src/scope'
import { dispatchAction } from '../src/actions'
import type { ClientAction } from '../src/types'

function harness(data: Record<string, unknown> = {}) {
  const sent: ClientAction[] = []
  const store = new Store(data) as any
  return {
    sent,
    store,
    ctx: {
      surfaceId: 'contact_form_1',
      sourceComponentId: 'submit_button',
      binding: { store, scope: createRootScope(), functions: BUILTIN_FUNCTIONS },
      transport: { sendAction: (a: ClientAction) => sent.push(a) },
      now: () => '2026-07-09T00:00:00.000Z',
    },
  }
}

test('event action resolves context bindings and sends a schema-shaped message', () => {
  const { sent, ctx } = harness({ contact: { subscribe: true } })
  dispatchAction(
    {
      event: {
        name: 'submitContactForm',
        context: { isNewsletterSubscribed: { path: '/contact/subscribe' } },
      },
    },
    ctx,
  )
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0], {
    name: 'submitContactForm',
    surfaceId: 'contact_form_1',
    sourceComponentId: 'submit_button',
    timestamp: '2026-07-09T00:00:00.000Z',
    context: { isNewsletterSubscribed: true },
  })
})

test('event action with no context sends an empty context object', () => {
  const { sent, ctx } = harness()
  dispatchAction({ event: { name: 'ping' } }, ctx)
  assert.deepEqual(sent[0].context, {})
})

test('event context resolves FunctionCall values locally', () => {
  const { sent, ctx } = harness({ d: '2026-07-09T12:00:00Z' })
  dispatchAction(
    { event: { name: 'x', context: { when: { call: 'formatDate', args: { value: { path: '/d' } } } } } },
    ctx,
  )
  assert.equal(sent[0].context.when, '2026-07-09')
})

test('functionCall action never reaches the transport', () => {
  const { sent, ctx } = harness({ contact: { email: 'a@b.c' } })
  dispatchAction({ functionCall: { call: 'email', args: { value: { path: '/contact/email' } } } }, ctx)
  assert.equal(sent.length, 0)
})

test('functionCall with an unregistered name throws', () => {
  const { ctx } = harness()
  assert.throws(
    () => dispatchAction({ functionCall: { call: 'exfiltrate' } }, ctx),
    /Unknown A2UI function/,
  )
})
