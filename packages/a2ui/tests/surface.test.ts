import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flushMicrotasks } from '../../../tests/helpers/jsdom-setup'
import { SurfaceRegistry, dispatch } from '../src/index'
import { createBasicCatalog } from '../src/catalog'
import { BUILTIN_FUNCTIONS } from '../src/functions'

const CATALOG_ID = 'https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json'

function harness() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const registry = new SurfaceRegistry(() => host)
  const opts = { catalog: createBasicCatalog(), functions: BUILTIN_FUNCTIONS }
  return { host, registry, opts }
}

test('createSurface renders nothing and does not mount', () => {
  const { host, registry, opts } = harness()
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  assert.equal(registry.get('s1')!.isMounted, false)
  assert.equal(host.childNodes.length, 0)
})

test('accepts both v0.9 and v0.9.1 envelopes', () => {
  const { registry, opts } = harness()
  dispatch(
    { version: 'v0.9', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  assert.ok(registry.get('s1'))
})

test('updateComponents without root buffers and does not mount', () => {
  const { host, registry, opts } = harness()
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  dispatch(
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 's1',
        components: [{ id: 'orphan', component: 'Text', text: 'x' }],
      },
    },
    registry,
    opts,
  )
  assert.equal(registry.get('s1')!.isMounted, false)
  assert.equal(host.childNodes.length, 0)
  assert.ok(registry.get('s1')!.componentDefinitions.has('orphan'))
})

test('updateComponents with root mounts once, order-independent', () => {
  const { host, registry, opts } = harness()
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  dispatch(
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 's1',
        components: [
          { id: 'leaf', component: 'Text', text: 'Hi' },
          { id: 'root', component: 'Column', children: ['leaf'] },
        ],
      },
    },
    registry,
    opts,
  )
  assert.equal(registry.get('s1')!.isMounted, true)
  assert.match(host.textContent ?? '', /Hi/)
})

test('updateDataModel upserts and updates a bound leaf without remounting', async () => {
  const { host, registry, opts } = harness()
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  dispatch(
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 's1',
        components: [{ id: 'root', component: 'Text', text: { path: '/contact/email' } }],
      },
    },
    registry,
    opts,
  )
  const before = host.firstElementChild
  dispatch(
    {
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 's1',
        path: '/contact',
        value: { email: 'john.doe@example.com' },
      },
    },
    registry,
    opts,
  )
  await flushMicrotasks()
  assert.match(host.textContent ?? '', /john\.doe@example\.com/)
  assert.equal(host.firstElementChild, before, 'no remount: same element identity')
})

test('updateDataModel without value removes the path', async () => {
  const { registry, opts } = harness()
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  const s = registry.get('s1')!.dataModel as any
  s.contact = { email: 'x' }
  dispatch(
    { version: 'v0.9.1', updateDataModel: { surfaceId: 's1', path: '/contact/email' } },
    registry,
    opts,
  )
  await flushMicrotasks()
  assert.equal(s.contact.email, undefined)
})

test('updateDataModel with no path replaces the whole model, preserving Store identity', async () => {
  const { registry, opts } = harness()
  dispatch(
    { version: 'v0.9.1', createSurface: { surfaceId: 's1', catalogId: CATALOG_ID } },
    registry,
    opts,
  )
  const surface = registry.get('s1')!
  const identity = surface.dataModel
  ;(surface.dataModel as any).old = 1
  dispatch(
    { version: 'v0.9.1', updateDataModel: { surfaceId: 's1', value: { fresh: 2 } } },
    registry,
    opts,
  )
  await flushMicrotasks()
  assert.equal(surface.dataModel, identity)
  assert.equal((surface.dataModel as any).old, undefined)
  assert.equal((surface.dataModel as any).fresh, 2)
})

test('an envelope for an unknown surface is rejected by id', () => {
  const { registry, opts } = harness()
  assert.throws(
    () =>
      dispatch(
        { version: 'v0.9.1', updateDataModel: { surfaceId: 'nope', value: {} } },
        registry,
        opts,
      ),
    /unknown surfaceId "nope"/,
  )
})
