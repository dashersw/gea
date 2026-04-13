/**
 * Mount a child: class Component, plain function, or lazy Promise-resolving
 * thunk. Registers cleanup on the passed disposer.
 *
 * - Class: `new Ctor()`, install props, `inst.render(parent)`.
 * - Function: `Ctor(props)` returning either an Element (appended) or a
 *   Component instance (treated as if class-constructed, minus construction).
 * - Lazy: a Promise (or thenable) resolving to one of the above.
 */

import type { Disposer } from './disposer'
import { GEA_SET_PROPS } from './internal-symbols'
import { GEA_PARENT_COMPONENT } from './symbols'

type PropThunks = Record<string, () => any>
export type ComponentLike = any

export type MountResult = any | null | Promise<any | null>

function isClassLike(fn: any): boolean {
  if (typeof fn !== 'function') return false
  if (!fn.prototype) return false
  // ES class: not callable without `new`. Detect via the function's source.
  // But Function.toString() can be expensive; use name convention + prototype check.
  // Any class-defined-with-`class` has a non-writable `prototype` property and
  // typically a source starting with "class ". Functions don't have this.
  const src = Function.prototype.toString.call(fn)
  return src.startsWith('class ') || typeof fn.prototype.render === 'function'
}

function mountResolved(
  Ctor: any,
  parent: Element,
  props: PropThunks,
  disposer: Disposer,
  anchor?: Node | null,
  owner?: any,
): any | null {
  if (isClassLike(Ctor)) {
    const inst = new Ctor()
    if (owner) (inst as any)[GEA_PARENT_COMPONENT] = owner
    const setProps = (inst as any)[GEA_SET_PROPS]
    if (typeof setProps === 'function') setProps.call(inst, props)
    inst.render(parent)
    if (anchor && inst.el && anchor.parentNode === parent) {
      parent.insertBefore(inst.el, anchor)
      if (anchor.parentNode) anchor.parentNode.removeChild(anchor)
    }
    disposer.add(() => inst.dispose())
    return inst
  }

  // Plain function — pass disposer as second arg so fn component's internal
  // reactive wiring (reactiveText, etc.) can register cleanup.
  if (typeof Ctor === 'function') {
    // Materialize props-thunks into a live getter-materialized object so fn
    // components can read `props.x` and get the live thunk result (not the
    // thunk fn itself). Class components do this in their prop protocol.
    const liveProps: Record<string, any> = {}
    for (const k in props) {
      const thunk = (props as any)[k]
      if (typeof thunk === 'function') {
        Object.defineProperty(liveProps, k, { enumerable: true, configurable: true, get: () => thunk() })
      } else {
        liveProps[k] = thunk
      }
    }
    // Memoize `children` only when the thunk returns a Node; for primitives
    // keep the live thunk so reactive getters pick up changes.
    if (typeof (props as any).children === 'function') {
      let cached: any = undefined
      let cacheNode = false
      Object.defineProperty(liveProps, 'children', {
        enumerable: true,
        configurable: true,
        get: () => {
          if (cacheNode) return cached
          const v = (props as any).children()
          if (v && typeof v.nodeType === 'number') {
            cached = v
            cacheNode = true
          }
          return v
        },
      })
    }
    const out: any = Ctor(liveProps, disposer)
    // Use duck-typing instead of instanceof to survive HMR proxies / cross-realm.
    if (
      out &&
      typeof out.render === 'function' &&
      ('el' in out || 'rendered' in out || typeof out.dispose === 'function')
    ) {
      if (owner) (out as any)[GEA_PARENT_COMPONENT] = owner
      out[GEA_SET_PROPS]?.(props)
      if (!out.rendered) out.render(parent)
      if (anchor && out.el && anchor.parentNode === parent) {
        parent.insertBefore(out.el, anchor)
        if (anchor.parentNode) anchor.parentNode.removeChild(anchor)
      }
      disposer.add(() => out.dispose())
      return out
    }
    // Node check by nodeType (1=Element, 11=DocumentFragment, 8=Comment, 3=Text)
    if (out && typeof out.nodeType === 'number') {
      if (anchor && anchor.parentNode === parent) {
        parent.insertBefore(out, anchor)
        anchor.parentNode.removeChild(anchor)
      } else {
        parent.appendChild(out)
      }
      disposer.add(() => {
        if (out.parentNode) out.parentNode.removeChild(out)
      })
      return null
    }
    return null
  }

  return null
}

export function mount(
  Ctor: ComponentLike,
  parent: Element,
  props: PropThunks,
  disposer: Disposer,
  anchor?: Node | null,
  owner?: any,
): any | null | Promise<any | null> {
  // Lazy: a thenable/Promise resolves to a class or fn.
  if (Ctor && typeof (Ctor as any).then === 'function') {
    return (Ctor as Promise<any>).then((resolved) => {
      const r: any = resolved && resolved.default ? resolved.default : resolved
      return mountResolved(r, parent, props, disposer, anchor, owner)
    })
  }

  return mountResolved(Ctor, parent, props, disposer, anchor, owner)
}
