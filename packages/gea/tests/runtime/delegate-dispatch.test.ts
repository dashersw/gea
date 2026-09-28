/**
 * Shared document listener behind every delegate helper (issue #111).
 *
 * Handlers stashed by `delegateClick`, `delegateEvent` and `delegateEventFast`
 * run in one walk: innermost first, every handler on the path, stopped by
 * `stopPropagation()`. Non-bubbling types only run the target's handler.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDisposer } from '../../src/runtime/disposer'
import { delegateClick } from '../../src/runtime/delegate-click'
import { delegateEvent } from '../../src/runtime/delegate-event'
import { delegateEventFast } from '../../src/runtime/delegate-event-fast'

function tree(): { root: HTMLElement; outer: HTMLElement; inner: HTMLElement } {
  const root = document.createElement('div')
  const outer = document.createElement('div')
  const inner = document.createElement('span')
  outer.appendChild(inner)
  root.appendChild(outer)
  document.body.appendChild(root)
  return { root, outer, inner }
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('delegate dispatch – bubbling across helpers', () => {
  it('runs every click handler innermost first, whichever helper stashed it', () => {
    const { root, outer, inner } = tree()
    const log: string[] = []
    try {
      delegateEvent(root, 'click', [[outer, () => log.push('outer')]], createDisposer())
      delegateClick(root, [[inner, () => log.push('inner')]])
      delegateEventFast(root, 'click', [[root, () => log.push('root')]], createDisposer())
      click(inner)
      assert.deepEqual(log, ['inner', 'outer', 'root'])
    } finally {
      root.remove()
    }
  })

  it('stopPropagation in one helper stops handlers stashed by another', () => {
    const { root, outer, inner } = tree()
    const log: string[] = []
    try {
      delegateClick(root, [[outer, () => log.push('outer')]])
      delegateEvent(
        root,
        'click',
        [
          [
            inner,
            (e) => {
              e.stopPropagation()
              log.push('inner')
            },
          ],
        ],
        createDisposer(),
      )
      click(inner)
      assert.deepEqual(log, ['inner'])
    } finally {
      root.remove()
    }
  })

  it('sets currentTarget per element and restores it between handlers', () => {
    const { root, outer, inner } = tree()
    const seen: Array<EventTarget | null> = []
    try {
      delegateEvent(
        root,
        'click',
        [
          [inner, (e) => seen.push(e.currentTarget)],
          [outer, (e) => seen.push(e.currentTarget)],
        ],
        createDisposer(),
      )
      click(inner)
      assert.deepEqual(seen, [inner, outer])
    } finally {
      root.remove()
    }
  })

  it('keeps walking the original path when a handler detaches its own subtree', () => {
    const { root, outer, inner } = tree()
    const log: string[] = []
    try {
      delegateClick(root, [
        [
          inner,
          () => {
            outer.remove()
            log.push('inner')
          },
        ],
        [outer, () => log.push('outer')],
        [root, () => log.push('root')],
      ])
      click(inner)
      assert.deepEqual(log, ['inner', 'outer', 'root'])
    } finally {
      root.remove()
    }
  })

  it('bubbles non-click types the same way', () => {
    const { root, outer, inner } = tree()
    const log: string[] = []
    try {
      delegateEvent(root, 'keydown', [[outer, () => log.push('outer'), false]], createDisposer())
      delegateEvent(root, 'keydown', [[inner, () => log.push('inner')]], createDisposer())
      inner.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }))
      assert.deepEqual(log, ['inner', 'outer'])
    } finally {
      root.remove()
    }
  })
})

describe('delegate dispatch – non-bubbling types', () => {
  for (const type of ['focus', 'blur', 'mouseenter', 'mouseleave', 'scroll']) {
    it(`runs only the target's own ${type} handler, never an ancestor's`, () => {
      const { root, outer, inner } = tree()
      const log: string[] = []
      try {
        delegateEvent(root, type, [[outer, () => log.push('outer')]], createDisposer())
        inner.dispatchEvent(new Event(type, { bubbles: false }))
        assert.deepEqual(log, [])
        outer.dispatchEvent(new Event(type, { bubbles: false }))
        assert.deepEqual(log, ['outer'])
        delegateEvent(root, type, [[inner, () => log.push('inner')]], createDisposer())
        log.length = 0
        inner.dispatchEvent(new Event(type, { bubbles: false }))
        assert.deepEqual(log, ['inner'])
      } finally {
        root.remove()
      }
    })
  }
})
