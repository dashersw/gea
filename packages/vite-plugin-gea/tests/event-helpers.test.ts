import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EVENT_NAMES, toGeaEventType } from '../src/utils/events.ts'

describe('event-helpers', () => {
  it('toGeaEventType lowercases on* React-style names', () => {
    assert.equal(toGeaEventType('onClick'), 'click')
    assert.equal(toGeaEventType('onMouseOver'), 'mouseover')
    assert.equal(toGeaEventType('onPointerDown'), 'pointerdown')
  })

  it('EVENT_NAMES includes delegateEvent-relevant and animation types', () => {
    for (const t of [
      'click',
      'contextmenu',
      'scroll',
      'mouseenter',
      'mouseleave',
      'mouseover',
      'animationend',
      'transitionend',
      'pointerdown',
    ]) {
      assert.ok(EVENT_NAMES.has(t), `expected EVENT_NAMES to include ${t}`)
    }
  })
})
