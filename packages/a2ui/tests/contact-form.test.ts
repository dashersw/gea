import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { SurfaceRegistry, dispatch, createBasicCatalog, BUILTIN_FUNCTIONS } from '../src/index'
import type { ClientAction } from '../src/types'

const CATALOG_ID = 'https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json'

const COMPONENTS = [
  { id: 'root', component: 'Card', child: 'form_container' },
  {
    id: 'form_container',
    component: 'Column',
    children: ['email_group', 'newsletter_checkbox', 'submit_button'],
  },
  { id: 'email_group', component: 'Column', children: ['email_label', 'email_field'] },
  { id: 'email_label', component: 'Text', text: 'Email Address', variant: 'caption' },
  {
    id: 'email_field',
    component: 'TextField',
    label: 'Email',
    value: { path: '/contact/email' },
    variant: 'shortText',
  },
  {
    id: 'newsletter_checkbox',
    component: 'CheckBox',
    label: 'Subscribe to our newsletter',
    value: { path: '/contact/subscribe' },
  },
  { id: 'submit_button_label', component: 'Text', text: 'Send Message' },
  {
    id: 'submit_button',
    component: 'Button',
    child: 'submit_button_label',
    variant: 'primary',
    action: {
      event: {
        name: 'submitContactForm',
        context: { isNewsletterSubscribed: { path: '/contact/subscribe' } },
      },
    },
  },
]

test('canonical contact form: create -> components -> data -> input -> action', async () => {
  const host = document.createElement('div')
  // Gea delegates events at the document root; a detached host never sees them.
  document.body.appendChild(host)
  const sent: ClientAction[] = []
  const registry = new SurfaceRegistry(() => host)
  const opts = {
    catalog: createBasicCatalog(),
    functions: BUILTIN_FUNCTIONS,
    transport: { sendAction: (a: ClientAction) => sent.push(a) },
    now: () => '2026-07-09T00:00:00.000Z',
  }

  // Step 1: createSurface — nothing renders.
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 'contact_form_1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  assert.equal(host.childNodes.length, 0)

  // Step 2 + 3: updateComponents carries `root` -> mount.
  dispatch(
    { version: 'v0.9.1', updateComponents: { surfaceId: 'contact_form_1', components: COMPONENTS } },
    registry,
    opts,
  )
  const surface = registry.get('contact_form_1')!
  assert.equal(surface.isMounted, true)
  assert.match(host.textContent ?? '', /Email Address/)
  assert.match(host.textContent ?? '', /Send Message/)

  // Step 5: updateDataModel -> surgical update, no remount.
  const rootElBefore = host.firstElementChild
  dispatch(
    {
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 'contact_form_1',
        path: '/contact',
        value: { email: 'john.doe@example.com', subscribe: false },
      },
    },
    registry,
    opts,
  )
  await flushMicrotasks()
  assert.equal(host.firstElementChild, rootElBefore, 'no remount on data change')
  assert.equal(host.querySelector('input[type="text"]')!.value, 'john.doe@example.com')

  // Step 7: user input writes the local store immediately, no network.
  const input = host.querySelector('input[type="text"]') as HTMLInputElement
  input.value = 'ada@lovelace.dev'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal((surface.dataModel as any).contact.email, 'ada@lovelace.dev')
  assert.equal(sent.length, 0, 'typing must not hit the transport')

  // Step 8: action resolves context against the store and sends upstream.
  ;(surface.dataModel as any).contact.subscribe = true
  await flushMicrotasks()
  host.querySelector('button')!.click()
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0], {
    name: 'submitContactForm',
    surfaceId: 'contact_form_1',
    sourceComponentId: 'submit_button',
    timestamp: '2026-07-09T00:00:00.000Z',
    context: { isNewsletterSubscribed: true },
  })
})

test('the mounted contact form renders no stray container markers', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const registry = new SurfaceRegistry(() => host)
  const opts = {
    catalog: createBasicCatalog(),
    functions: BUILTIN_FUNCTIONS,
    transport: { sendAction() {} },
    now: () => '2026-07-09T00:00:00.000Z',
  }
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  dispatch(
    { version: 'v0.9.1', updateComponents: { surfaceId: 's', components: COMPONENTS } },
    registry,
    opts,
  )
  // The compiler's children-slot placeholder is a literal "0" text node.
  assert.doesNotMatch(host.textContent ?? '', /0/, 'no compiler slot markers leaked into the DOM')
})
