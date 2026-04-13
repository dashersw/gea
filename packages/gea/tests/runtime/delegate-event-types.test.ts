/**
 * delegateEvent: non-bubbling and less common types used by the compiler
 * (see delegate-event.ts capture flag for mouseenter, scroll, etc.).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDisposer } from '../../src/runtime/disposer'
import { delegateEvent } from '../../src/runtime/delegate-event'

function fire(el: Element, type: string): void {
  const Mouse = (globalThis as any).MouseEvent
  if (Mouse && (type === 'mouseenter' || type === 'mouseleave' || type === 'mouseover' || type === 'contextmenu')) {
    el.dispatchEvent(new Mouse(type, { bubbles: type !== 'mouseenter' && type !== 'mouseleave', cancelable: true }))
    return
  }
  if (type === 'scroll') {
    const U = (globalThis as any).UIEvent
    if (U) {
      el.dispatchEvent(new U('scroll', { detail: 0, bubbles: false, cancelable: false } as any))
    } else {
      el.dispatchEvent(new Event('scroll', { bubbles: false } as any))
    }
    return
  }
  if (type === 'pointerdown' && (globalThis as any).PointerEvent) {
    el.dispatchEvent(
      new (globalThis as any).PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }),
    )
    return
  }
  if ((type === 'animationend' || type === 'transitionend') && (globalThis as any).AnimationEvent) {
    el.dispatchEvent(
      new (globalThis as any).AnimationEvent(type, { animationName: 'x', bubbles: true, cancelable: true } as any),
    )
    return
  }
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

describe('delegateEvent – event type coverage', () => {
  const types = [
    'mouseover',
    'mouseenter',
    'mouseleave',
    'contextmenu',
    'scroll',
    'animationend',
    'transitionend',
    'pointerdown',
  ] as const

  for (const eventType of types) {
    it(`invokes a handler for ${eventType}`, () => {
      const root = document.createElement('div')
      const inner = document.createElement('div')
      root.appendChild(inner)
      const disposer = createDisposer()
      let count = 0
      const handler = () => {
        count++
      }
      document.body.appendChild(root)
      try {
        delegateEvent(root, eventType, [[inner, handler]], disposer)
        fire(inner, eventType)
        assert.equal(count, 1, `expected one dispatch for ${eventType}`)
      } finally {
        root.remove()
      }
    })
  }

  it('shadows currentTarget to the matched element', () => {
    const root = document.createElement('div')
    const inner = document.createElement('button')
    root.appendChild(inner)
    document.body.appendChild(root)

    const disposer = createDisposer()
    let seen: EventTarget | null = null
    try {
      delegateEvent(
        root,
        'click',
        [
          [
            inner,
            (event) => {
              seen = event.currentTarget
            },
          ],
        ],
        disposer,
      )
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      assert.equal(seen, inner)
    } finally {
      root.remove()
    }
  })

  it('skips currentTarget shadowing for compiler-marked fast handlers', () => {
    const root = document.createElement('div')
    const inner = document.createElement('button')
    root.appendChild(inner)
    document.body.appendChild(root)

    const disposer = createDisposer()
    const defineProperty = Object.defineProperty
    let currentTargetWrites = 0
    let count = 0
    try {
      Object.defineProperty = ((target: any, property: PropertyKey, descriptor: PropertyDescriptor) => {
        if (property === 'currentTarget') currentTargetWrites++
        return defineProperty(target, property, descriptor)
      }) as typeof Object.defineProperty
      delegateEvent(
        root,
        'click',
        [
          [
            inner,
            () => {
              count++
            },
            false,
          ],
        ],
        disposer,
      )
      inner.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      assert.equal(count, 1)
      assert.equal(currentTargetWrites, 0)
    } finally {
      Object.defineProperty = defineProperty
      root.remove()
    }
  })
})
