/**
 * Per-document event delegation via element expando properties.
 *
 * Fast JSX-declared handlers are stored as own properties on their host
 * element (`el.__on_click = handler`). Handlers that need element-local
 * `currentTarget` semantics use the slower `__onct_click` slot.
 * A single document-level listener per eventType (see `delegate-dispatch.ts`)
 * walks from `e.target` up, checks the expandos on each node, and runs every
 * handler it finds until one calls `stopPropagation()`.
 *
 * Why this beats a Map<Element, Handler> dispatcher:
 *   - Expando lookup is an inline-cached own-property read.
 *   - No per-list Map allocation; DOM nodes are the storage.
 *   - Detached elements take their handler expando with them, so bulk row
 *     teardown avoids removeEventListener / Map.delete work.
 *
 * Although the real DOM listener is installed on the document, Gea exposes
 * element-local handler semantics: while a matched handler runs,
 * `e.currentTarget` is the element that owned that handler.
 */

import { ensureDelegate } from './delegate-dispatch'
import type { Disposer } from './disposer'

type Handler = (e: Event) => void
type HandlerPair = [Element, Handler] | [Element, Handler, false]

export function delegateEvent(root: Element, type: string, pairs: HandlerPair[], _disposer: Disposer): void {
  ensureDelegate(root, type)
  const k = '__on_' + type
  const currentTargetKey = '__onct_' + type
  for (let i = 0; i < pairs.length; i++) {
    const el = pairs[i][0]
    if (el) {
      // A 3-element pair (`[el, handler, false]`) is the compiler's
      // fast, no-shadow marker; a plain 2-element pair defaults to the
      // slower `currentTarget`-shadowing slot. Test the pair length (a
      // native numeric compare) rather than `pairs[i][2] === false`, whose
      // boxed `false | undefined` equality has no native plan under geatsc.
      if (pairs[i].length > 2) {
        ;(el as any)[k] = pairs[i][1]
      } else {
        ;(el as any)[currentTargetKey] = pairs[i][1]
      }
    }
  }
  // No disposer cleanup: when the element is removed from the DOM and GC'd,
  // the expando dies with it. Skipping a symmetric removeDelegate avoids
  // N `delete el[k]` per row on large replace/clear workloads. A dead expando
  // on a detached element is harmless: events no longer bubble through it, so
  // the document listener never walks into it.
}
