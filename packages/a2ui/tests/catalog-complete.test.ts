import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Store } from '@geajs/core'
import { createDisposer } from '@geajs/core/compiler-runtime'
import { createBasicCatalog } from '../src/catalog'
import { BUILTIN_FUNCTIONS } from '../src/functions'
import { instantiateNode } from '../src/instantiate'
import { createRootScope } from '../src/scope'
import type { ComponentDefinition } from '../src/types'

const BASIC_18 = [
  'Text',
  'Image',
  'Icon',
  'Video',
  'AudioPlayer',
  'Row',
  'Column',
  'List',
  'Card',
  'Tabs',
  'Modal',
  'Divider',
  'Button',
  'TextField',
  'CheckBox',
  'ChoicePicker',
  'Slider',
  'DateTimeInput',
]

test('basic catalog registers exactly the 18 spec component types', () => {
  const catalog = createBasicCatalog()
  assert.equal(catalog.size, 18)
  assert.deepEqual([...catalog.keys()].sort(), [...BASIC_18].sort())
})

test('every entry carries a component reference and a mapProps', () => {
  for (const [name, e] of createBasicCatalog()) {
    assert.equal(e.typeName, name)
    assert.ok(e.component, `${name} has no component`)
    assert.equal(typeof e.mapProps, 'function')
  }
})

function build(defs: ComponentDefinition[], data: Record<string, unknown> = {}) {
  const store = new Store(data) as any
  const host = document.createElement('div')
  document.body.appendChild(host)
  instantiateNode(
    'root',
    {
      definitions: new Map(defs.map((d) => [d.id, d])),
      catalog: createBasicCatalog(),
      store,
      functions: BUILTIN_FUNCTIONS,
      disposer: createDisposer(),
      surfaceId: 's1',
      transport: { sendAction() {} },
      now: () => '2026-07-09T00:00:00.000Z',
    },
    host,
    createRootScope(),
  )
  return { host, store }
}

test('the local media leaves render their bound source', () => {
  const { host } = build([{ id: 'root', component: 'Image', url: '/a.png', alt: 'A' }])
  const img = host.querySelector('img.a2ui-image') as HTMLImageElement
  assert.ok(img)
  assert.match(img.getAttribute('src') ?? '', /a\.png$/)
  assert.equal(img.getAttribute('alt'), 'A')

  const video = build([{ id: 'root', component: 'Video', url: '/v.mp4' }]).host
  assert.ok(video.querySelector('video.a2ui-video'))

  const audio = build([{ id: 'root', component: 'AudioPlayer', url: '/a.mp3' }]).host
  assert.ok(audio.querySelector('audio.a2ui-audio'))

  const icon = build([{ id: 'root', component: 'Icon', name: 'star' }]).host
  assert.equal(icon.querySelector('.a2ui-icon')!.getAttribute('data-icon'), 'star')
})

test('Divider maps onto gea-ui Separator and renders', () => {
  const { host } = build([{ id: 'root', component: 'Divider' }])
  assert.ok(host.firstElementChild, 'Divider rendered an element')
})

test('List is a container the interpreter fills, with no stray slot text', () => {
  const { host } = build([
    { id: 'root', component: 'List', children: ['a'] },
    { id: 'a', component: 'Text', text: 'Item' },
  ])
  assert.equal(host.querySelector('.a2ui-list')!.textContent, 'Item')
})

test('DateTimeInput writes back through Gea’s delegated input event', () => {
  const { host, store } = build([{ id: 'root', component: 'DateTimeInput', value: { path: '/when' } }], {
    when: '',
  })
  const input = host.querySelector('input.a2ui-datetime') as HTMLInputElement
  assert.ok(input, 'datetime input rendered')
  input.value = '2026-07-09T12:00'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(store.when, '2026-07-09T12:00')
})
