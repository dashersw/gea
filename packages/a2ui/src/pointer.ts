/**
 * JSON Pointer (RFC 6901) over a Gea Store proxy.
 *
 * Gea's Store has no pointer support: it exposes property access and
 * `observe(dotPath)` only. This module is the ONLY place that knows pointer
 * syntax.
 *
 * DELIBERATE RFC 6901 DEVIATION: both "" and "/" parse to [] (the whole
 * model). Strict RFC 6901 says "/" addresses the empty-string key "". A2UI's
 * updateDataModel treats a missing path (and "/") as "replace the whole
 * model", so we follow A2UI.
 *
 * Reads here are plain property access on the Proxy, so when a read happens
 * inside a Gea tracking scope it auto-subscribes. That is why the interpreter
 * never needs an effect primitive of its own.
 */

/** Unescape one pointer token: ~1 -> "/" then ~0 -> "~" (order is required). */
function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

export function parsePointer(pointer: string): string[] {
  if (pointer === '' || pointer === '/') return []
  const body = pointer.startsWith('/') ? pointer.slice(1) : pointer
  return body.split('/').map(unescapeToken)
}

export function readPointer(root: unknown, parts: readonly string[]): unknown {
  let cur: any = root
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined
    cur = cur[parts[i]]
  }
  return cur
}

/** Walk to the parent of `parts`, creating missing intermediate objects. */
function walkToParent(root: any, parts: readonly string[]): any {
  let cur: any = root
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (cur[key] === null || typeof cur[key] !== 'object') cur[key] = {}
    cur = cur[key]
  }
  return cur
}

/**
 * Empty `parts` replaces the whole model IN PLACE. The Store identity must be
 * preserved: keyedList and every mounted binding hold a reference to it.
 */
export function writePointer(
  root: Record<string, unknown>,
  parts: readonly string[],
  value: unknown,
): void {
  if (parts.length === 0) {
    for (const key of Object.keys(root)) delete (root as any)[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        ;(root as any)[k] = v
      }
    }
    return
  }
  const parent = walkToParent(root, parts)
  parent[parts[parts.length - 1]] = value
}

export function deletePointer(root: Record<string, unknown>, parts: readonly string[]): void {
  if (parts.length === 0) {
    for (const key of Object.keys(root)) delete (root as any)[key]
    return
  }
  let cur: any = root
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur === null || typeof cur !== 'object') return
    cur = cur[parts[i]]
  }
  if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]]
}
