import { t } from '../../utils/babel-interop.ts'

import { emitWalkExpr } from '../utils/dom-walk.ts'

export type WalkKind = { elem: number } | { child: number }

export function extractWalkFromExpr(expr: any): number[] | null {
  const w = extractWalkAndKindsFromExpr(expr)
  return w ? w.walk : null
}

export function extractWalkAndKindsFromExpr(expr: any): { walk: number[]; walkKinds: WalkKind[] } | null {
  return extractWalkAndKindsFromExprRootedAt(expr, 'root')
}

export function cloneAndSubstituteIdents(node: any, subst: Record<string, string>): any {
  if (!node || typeof node !== 'object') return node
  if (node.type === 'Identifier' && subst[node.name] !== undefined) return t.identifier(subst[node.name])
  const clone: any = { type: node.type }
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    )
      continue
    const v = node[key]
    if (Array.isArray(v)) clone[key] = v.map((x) => cloneAndSubstituteIdents(x, subst))
    else if (v && typeof v === 'object' && typeof v.type === 'string') clone[key] = cloneAndSubstituteIdents(v, subst)
    else clone[key] = v
  }
  return clone
}

export function extractWalkAndKindsFromExprRootedAt(
  expr: any,
  rootName: string,
): { walk: number[]; walkKinds: WalkKind[] } | null {
  const kinds: WalkKind[] = []
  const walk: number[] = []
  let cur = expr
  while (cur && t.isMemberExpression(cur)) {
    if (cur.computed) {
      const prop = cur.property
      if (!t.isNumericLiteral(prop)) return null
      const inner = cur.object
      if (!t.isMemberExpression(inner) || inner.computed || !t.isIdentifier(inner.property, { name: 'childNodes' })) {
        return null
      }
      const n = (prop as any).value
      kinds.unshift({ child: n })
      walk.unshift(n)
      cur = inner.object
      continue
    }
    if (!t.isIdentifier(cur.property)) return null
    const propName = cur.property.name
    if (propName === 'nextElementSibling') {
      let count = 1
      cur = cur.object
      while (
        t.isMemberExpression(cur) &&
        !cur.computed &&
        t.isIdentifier(cur.property, { name: 'nextElementSibling' })
      ) {
        count++
        cur = cur.object
      }
      if (!t.isMemberExpression(cur) || cur.computed || !t.isIdentifier(cur.property, { name: 'firstElementChild' })) {
        return null
      }
      kinds.unshift({ elem: count })
      walk.unshift(count)
      cur = cur.object
      continue
    }
    if (propName === 'firstElementChild') {
      kinds.unshift({ elem: 0 })
      walk.unshift(0)
      cur = cur.object
      continue
    }
    if (propName === 'firstChild') {
      kinds.unshift({ child: 0 })
      walk.unshift(0)
      cur = cur.object
      continue
    }
    return null
  }
  return t.isIdentifier(cur, { name: rootName }) ? { walk, walkKinds: kinds } : null
}

export function rewriteWalksWithPrefixPiggyback(node: any, declWalks: { name: string; walk: number[] }[]): any {
  if (!node || typeof node !== 'object') return node
  if (
    t.isMemberExpression(node) &&
    (node.computed ||
      (t.isIdentifier(node.property) &&
        (node.property.name === 'firstChild' ||
          node.property.name === 'firstElementChild' ||
          node.property.name === 'nextElementSibling')))
  ) {
    const wk = extractWalkAndKindsFromExprRootedAt(node, 'root')
    if (wk) {
      let best: { name: string; walk: number[] } | null = null
      for (const dw of declWalks) {
        if (dw.walk.length === 0 || dw.walk.length >= wk.walk.length) continue
        let isPrefix = true
        for (let i = 0; i < dw.walk.length; i++) {
          if (dw.walk[i] !== wk.walk[i]) {
            isPrefix = false
            break
          }
        }
        if (isPrefix && (!best || dw.walk.length > best.walk.length)) best = dw
      }
      if (best) {
        const suffix = wk.walk.slice(best.walk.length)
        const suffixKinds = wk.walkKinds.slice(best.walk.length)
        return emitWalkExpr(t.identifier(best.name), suffix, suffixKinds)
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'start' ||
      key === 'end' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    )
      continue
    const v = node[key]
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = rewriteWalksWithPrefixPiggyback(v[i], declWalks)
    } else if (v && typeof v === 'object' && typeof v.type === 'string') {
      node[key] = rewriteWalksWithPrefixPiggyback(v, declWalks)
    }
  }
  return node
}
