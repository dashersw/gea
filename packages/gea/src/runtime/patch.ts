/**
 * patch(node, kind, prev, next, extra?) — shared write-if-different DOM core.
 *
 * Used by reactive-text / reactive-attr / reactive-bool. Writes only when
 * `next !== prev`; returns the new `prev` value so callers can track it as a
 * closure local between invocations.
 */

export type PatchKind = 'text' | 'attr' | 'bool'

export function patch(node: Node, kind: PatchKind, prev: unknown, next: unknown, extra?: string): unknown {
  if (next === prev) return prev
  if (kind === 'text') {
    // Use nodeValue on Text/Comment nodes, textContent on Elements/Fragments.
    if (node.nodeType === 3 /* TEXT */ || node.nodeType === 8 /* COMMENT */) {
      node.nodeValue = next == null ? '' : String(next)
    } else {
      node.textContent = next == null ? '' : String(next)
    }
    return next
  }
  if (kind === 'attr') {
    const el = node as Element
    const name = extra!
    const namespace =
      name.startsWith('xlink:')
        ? 'http://www.w3.org/1999/xlink'
        : name.startsWith('xml:')
          ? 'http://www.w3.org/XML/1998/namespace'
          : null
    if (next == null) {
      if (namespace) el.removeAttributeNS(namespace, name.slice(name.indexOf(':') + 1))
      else el.removeAttribute(name)
    } else if (namespace) {
      el.setAttributeNS(namespace, name, String(next))
    } else {
      el.setAttribute(name, String(next))
    }
    return next
  }
  // bool
  const el = node as Element
  ;(el as any).toggleAttribute(extra!, !!next)
  return next
}
