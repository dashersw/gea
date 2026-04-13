import { Component as ModernComponent } from './runtime/component'
import { GEA_DISPOSER } from './runtime/internal-symbols'
import { GEA_CREATE_TEMPLATE } from './runtime/symbols'
import { GEA_OBSERVER_REMOVERS } from './symbols'
import { Store } from './store'
import { h } from './h'
import { escapeHtml as geaEscapeHtml, sanitizeAttr as geaSanitizeAttr } from './xss'

type EventMap = Record<string, Record<string, (event: Event) => void>>

function hasNodeType(value: unknown): value is Node {
  return !!value && typeof (value as Node).nodeType === 'number'
}

function htmlToNode(html: string): Node {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const childCount = tpl.content.childNodes.length
  if (childCount === 1) return tpl.content.firstChild ?? document.createComment('')
  return tpl.content.cloneNode(true)
}

function valueToNode(value: unknown): Node {
  if (hasNodeType(value)) return value
  if (Array.isArray(value)) {
    const frag = document.createDocumentFragment()
    for (const item of value) {
      if (item == null || item === false || item === true) continue
      frag.appendChild(valueToNode(item))
    }
    return frag
  }
  if (typeof value === 'string') return htmlToNode(value)
  if (value == null || value === false || value === true) return document.createComment('')
  return document.createTextNode(String(value))
}

function valueToHtml(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueToHtml).join('')
  if (typeof value === 'string') return value
  if (value == null || value === false || value === true) return ''
  if (hasNodeType(value)) {
    if (value.nodeType === 11) {
      const container = document.createElement('div')
      container.appendChild(value.cloneNode(true))
      return container.innerHTML
    }
    return (value as Element).outerHTML ?? value.textContent ?? ''
  }
  return String(value)
}

function isRuntimeTemplateMode(instance: ModernComponent): boolean {
  const proto = Object.getPrototypeOf(instance)
  const ownFactory = proto?.[GEA_CREATE_TEMPLATE]
  return ownFactory === RuntimeOnlyComponent.prototype[GEA_CREATE_TEMPLATE]
}

function disposerOf(instance: ModernComponent) {
  return (instance as any)[GEA_DISPOSER]
}

export class RuntimeOnlyComponent<P extends Record<string, any> = Record<string, any>> extends ModernComponent<P> {
  __observer_removers__: Array<() => void> = []
  _runtimeEventsBound = false
  _runtimeHooksBound = false

  constructor(...args: any[]) {
    super(...args)
    const removers = this.__observer_removers__
    ;(this as any)[GEA_OBSERVER_REMOVERS] = removers
    const originalPush = removers.push.bind(removers)
    removers.push = (...fns: Array<() => void>) => {
      for (const fn of fns) {
        if (typeof fn === 'function') disposerOf(this).add(fn)
      }
      return originalPush(...fns)
    }
  }

  template(_props?: P): unknown {
    return ''
  }

  createdHooks(): void {
    /* runtime-only hook */
  }

  get events(): EventMap {
    return {}
  }

  toString(): string {
    return valueToHtml(this.template(this.props))
  }

  [GEA_CREATE_TEMPLATE](_disposer: unknown): Node {
    const proto = Object.getPrototypeOf(this)
    const ownFactory = proto?.[GEA_CREATE_TEMPLATE]
    if (ownFactory && ownFactory !== RuntimeOnlyComponent.prototype[GEA_CREATE_TEMPLATE]) {
      return ownFactory.call(this, disposerOf(this))
    }
    return valueToNode(this.template(this.props))
  }

  render(parent: Node): void {
    super.render(parent)
    if (!isRuntimeTemplateMode(this)) return
    if (!this._runtimeEventsBound) {
      this._runtimeEventsBound = true
      this._bindRuntimeEvents()
    }
    if (!this._runtimeHooksBound) {
      this._runtimeHooksBound = true
      this.createdHooks()
    }
  }

  _bindRuntimeEvents(): void {
    const root = this.el
    if (!root) return
    const events = this.events
    for (const type in events) {
      const selectors = events[type]
      const listener = (event: Event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        let current: Element | null = target
        while (current) {
          for (const selector in selectors) {
            if (current.matches(selector)) {
              selectors[selector].call(this, event)
              return
            }
          }
          if (current === root) break
          current = current.parentElement
        }
      }
      root.addEventListener(type, listener)
      disposerOf(this).add(() => root.removeEventListener(type, listener))
    }
  }
}

// Preserve the browser-bundle shape of `window.gea`.
const _default = {
  Component: RuntimeOnlyComponent,
  Store,
  h,
  GEA_OBSERVER_REMOVERS,
}

export { Store, h, GEA_OBSERVER_REMOVERS, geaEscapeHtml, geaSanitizeAttr }
export { RuntimeOnlyComponent as Component }
export default _default
