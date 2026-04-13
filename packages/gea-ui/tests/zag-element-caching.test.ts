import assert from 'node:assert/strict'
import test from 'node:test'

import { GEA_ELEMENT } from '@geajs/core'
import { JSDOM } from 'jsdom'

import ZagComponent from '../src/primitives/zag-component'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"><span data-part="item"></span></div></body></html>')
  const previous: Record<string, any> = {}
  const globals: Record<string, any> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
  }

  for (const key in globals) previous[key] = (globalThis as any)[key]
  Object.assign(globalThis, globals)

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function flushMicrotasks(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve()
  }
}

class CacheProbe extends ZagComponent {
  getSpreadMap() {
    return {
      '[data-part="item"]': () => ({ 'data-applied': 'true' }),
    }
  }
}

test('ZagComponent: element cache is reused and invalidated by current render/list hooks', async () => {
  const restoreDom = installDom()
  try {
    const instance = new CacheProbe()
    const root = document.getElementById('root')!
    instance.rendered = true
    ;(instance as any)[GEA_ELEMENT] = root
    ;(instance as any)._api = {}

    let queryCount = 0
    ;(instance as any)._queryAllIncludingSelf = (selector: string) => {
      queryCount++
      const matches = Array.from(root.querySelectorAll(selector))
      if (root.matches(selector)) matches.unshift(root)
      return matches
    }

    instance._applyAllSpreads()
    assert.equal(queryCount, 1, 'first spread application queries DOM')
    assert.equal(instance._elementCache.get('[data-part="item"]')?.length, 1, 'first query is cached')
    assert.equal(instance._spreadCleanups.size, 1, 'spread cleanup is retained for the cached selector')

    instance._applyAllSpreads()
    assert.equal(queryCount, 1, 'second spread application reuses cached elements')

    instance.onItemSync('items', 0)
    assert.equal(instance._elementCache.size, 0, 'onItemSync clears stale element cache immediately')
    await flushMicrotasks()
    assert.equal(queryCount, 2, 'onItemSync schedules a fresh spread application')

    instance.onAfterRender()
    assert.equal(queryCount, 3, 'onAfterRender clears cache before applying spreads')

    const newItem = document.createElement('span')
    newItem.setAttribute('data-part', 'item')
    root.appendChild(newItem)

    instance.onAfterRender()
    assert.equal(queryCount, 4, 'structural render change re-queries DOM')
    assert.equal(instance._elementCache.get('[data-part="item"]')?.length, 2, 'cache sees newly inserted item')

    instance.dispose()
    assert.equal(instance._elementCache.size, 0, 'dispose clears element cache')
    assert.equal(instance._spreadCleanups.size, 0, 'dispose runs and clears spread cleanups')
  } finally {
    restoreDom()
  }
})

test('ZagComponent: registerListState keeps compiler list containers refreshable', () => {
  const restoreDom = installDom()
  try {
    const instance = new CacheProbe()
    const original = document.createElement('div')
    const refreshed = document.createElement('section')

    instance.registerListState('items', {
      container: original,
      containerProp: '_itemsContainer',
      getContainer: () => refreshed,
    })

    instance._cacheArrayContainers()
    assert.equal((instance as any)._itemsContainer, refreshed, 'containerProp receives refreshed container')
    assert.equal(
      (instance as any)._listStates.get('items').container,
      refreshed,
      'registered state stores refreshed container',
    )

    instance.unregisterListState('items')
    assert.equal((instance as any)._listStates.has('items'), false, 'list state can be unregistered')
  } finally {
    restoreDom()
  }
})
