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
import type { Renderable } from './renderable'

/**
 * One thunk per prop of `P`, each returning that prop's own type — same
 * shape the compiled-component bases use, duplicated here (rather than
 * imported) because this is the OPAQUE mount boundary: `Ctor` is resolved at
 * runtime, possibly from a dynamic import, so `P` is whatever the call site
 * (the compiler-generated JSX invocation) statically knows, independent of
 * any particular component base class.
 */
type PropThunks<P> = { [K in keyof P]: () => P[K] } & { children?: () => Renderable }

/**
 * Structural shape shared by every `Compiled*` component base (and
 * hand-written `Component`): whatever `mount()` constructs or calls, this is
 * the contract it relies on. `[GEA_SET_PROPS]` and `created` are optional
 * because the plain-function-returning-a-bare-Node path never has them.
 */
export interface ComponentInstance<P> {
  props: P
  el: Element | null
  rendered: boolean
  render(parent: Node, index?: number): void
  dispose(): void
  created?(props?: P): void
  [GEA_SET_PROPS]?(thunks: PropThunks<P>): void
  [GEA_PARENT_COMPONENT]?: ComponentInstance<unknown>
}

export type ComponentClass<P> = new () => ComponentInstance<P>
export type ComponentFn<P> = (props: P, disposer: Disposer) => ComponentInstance<P> | Node | null | undefined

/** Everything a JSX tag can resolve to: a class, or a plain function. */
export type ComponentCtor<P> = ComponentClass<P> | ComponentFn<P>

/** What a lazy (`import()`-backed) component reference can resolve to. */
type LazyModule<P> = ComponentCtor<P> | { default: ComponentCtor<P> } | null | undefined

export type MountResult<P> = ComponentInstance<P> | null

/** Anything `.then`-able resolving to a lazy-loaded component reference. */
type LazyRef<P> = PromiseLike<LazyModule<P>>

function isClassLike<P>(fn: ComponentCtor<P> | null | undefined): fn is ComponentClass<P> {
  if (typeof fn !== 'function') return false
  // ES class: not callable without `new`. An arrow function has no `.prototype`
  // at all, so its absence rules out a class immediately.
  //
  // `.prototype` isn't part of `ComponentClass`/`ComponentFn`'s own call-signature
  // types (neither models the incidental `Function.prototype` own-property every
  // real JS function carries), so it's read through a narrow reflection-only
  // shape rather than widened to `any` — this is the one place mount.ts needs to
  // look at a callable's raw JS shape before it knows which union member it is.
  const proto = (fn as { prototype?: ComponentInstance<P> }).prototype
  if (!proto) return false
  // A `class`'s own `prototype` property is non-writable; an ordinary
  // function's is writable. That is the distinction the language actually
  // makes, so it is the one tested here.
  //
  // This used to read `Function.prototype.toString.call(fn)` and look for a
  // leading `"class "`. Reading a callable's source text cannot survive
  // ahead-of-time compilation — there is no JS source at runtime on the
  // embedded target — and naming `Function` as a value marks the whole program
  // as able to construct code, which withdraws every builtin call plan the
  // compiler would otherwise be able to prove. The descriptor test is exact and
  // needs no reflection escape hatch.
  const descriptor = Object.getOwnPropertyDescriptor(fn, 'prototype')
  return descriptor?.writable === false || typeof proto.render === 'function'
}

/**
 * Duck-type probe for "is this a component instance rather than a bare
 * Node": has `.render`, plus at least one of `el`/`rendered`/`dispose`.
 * Written as an explicit type-guard function (rather than inlined into the
 * `if`) because `ComponentInstance<P>` declares `el`/`rendered`/`dispose` as
 * REQUIRED members — inlining the `in`/`typeof` checks straight into an `if`
 * lets TS's control-flow analysis narrow the already-`'render' in out`
 * -narrowed type to `never` (it reads a check for an always-present required
 * property as "assume it's absent", which no value can satisfy). Probing
 * through `Record<string, unknown>` sidesteps that: the probe reflects on
 * the raw JS shape rather than asking the narrowed type "what if you didn't
 * have members you're declared to always have".
 */
function looksLikeComponentInstance<P>(x: object): x is ComponentInstance<P> {
  const probe = x as Record<string, unknown>
  return (
    typeof probe.render === 'function' && ('el' in probe || 'rendered' in probe || typeof probe.dispose === 'function')
  )
}

/**
 * Narrows a resolved lazy reference to its `{ default }` module-wrapper
 * shape. Written as an explicit predicate rather than an inline
 * `resolved && typeof resolved === 'object'` check in the ternary below: with
 * `strictNullChecks` off (this project's tsconfig), inline truthy narrowing
 * of a `T | null | undefined` union doesn't propagate into the ternary's
 * branches, so `resolved.default` and the fallback both saw the full
 * unnarrowed union. A named type-guard function narrows correctly regardless.
 */
function isLazyModuleWrapper<P>(x: LazyModule<P>): x is { default: ComponentCtor<P> } {
  return !!x && typeof x === 'object'
}

function mountResolved<P>(
  Ctor: ComponentCtor<P> | null | undefined,
  parent: Element,
  props: PropThunks<P>,
  disposer: Disposer,
  anchor?: Node | null,
  owner?: ComponentInstance<unknown>,
): MountResult<P> {
  if (isClassLike(Ctor)) {
    const inst = new Ctor()
    if (owner) inst[GEA_PARENT_COMPONENT] = owner
    const setProps = inst[GEA_SET_PROPS]
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
    const liveProps: Record<string, unknown> = {}
    for (const k in props) {
      const thunk = props[k]
      if (typeof thunk === 'function') {
        Object.defineProperty(liveProps, k, { enumerable: true, configurable: true, get: () => thunk() })
      } else {
        liveProps[k] = thunk
      }
    }
    // Memoize `children` only when the thunk returns a Node; for primitives
    // keep the live thunk so reactive getters pick up changes.
    const childrenThunk = props.children
    if (typeof childrenThunk === 'function') {
      let cached: Renderable = undefined
      let cacheNode = false
      Object.defineProperty(liveProps, 'children', {
        enumerable: true,
        configurable: true,
        get: () => {
          if (cacheNode) return cached
          const v = childrenThunk()
          if (v !== null && typeof v === 'object' && typeof (v as Node).nodeType === 'number') {
            cached = v
            cacheNode = true
          }
          return v
        },
      })
    }
    const out = Ctor(liveProps as P, disposer)
    // Use duck-typing instead of instanceof to survive HMR proxies / cross-realm.
    if (out && typeof out === 'object') {
      if (looksLikeComponentInstance<P>(out)) {
        const inst = out
        if (owner) inst[GEA_PARENT_COMPONENT] = owner
        inst[GEA_SET_PROPS]?.(props)
        if (!inst.rendered) inst.render(parent)
        if (anchor && inst.el && anchor.parentNode === parent) {
          parent.insertBefore(inst.el, anchor)
          if (anchor.parentNode) anchor.parentNode.removeChild(anchor)
        }
        disposer.add(() => inst.dispose())
        return inst
      }
      // Node check by nodeType (1=Element, 11=DocumentFragment, 8=Comment, 3=Text)
      if (typeof out.nodeType === 'number') {
        const node: Node = out
        if (anchor && anchor.parentNode === parent) {
          parent.insertBefore(node, anchor)
          anchor.parentNode.removeChild(anchor)
        } else {
          parent.appendChild(node)
        }
        disposer.add(() => {
          if (node.parentNode) node.parentNode.removeChild(node)
        })
        return null
      }
    }
    return null
  }

  return null
}

export function mount<P>(
  Ctor: ComponentCtor<P> | LazyRef<P>,
  parent: Element,
  props: PropThunks<P>,
  disposer: Disposer,
  anchor?: Node | null,
  owner?: ComponentInstance<unknown>,
): MountResult<P> | PromiseLike<MountResult<P>> {
  // Lazy: a thenable/Promise resolves to a class or fn.
  if (Ctor && typeof Ctor === 'object' && 'then' in Ctor && typeof Ctor.then === 'function') {
    return Ctor.then((resolved) => {
      const r: ComponentCtor<P> | null | undefined = isLazyModuleWrapper(resolved) ? resolved.default : resolved
      return mountResolved(r, parent, props, disposer, anchor, owner)
    })
  }

  return mountResolved(Ctor as ComponentCtor<P>, parent, props, disposer, anchor, owner)
}
