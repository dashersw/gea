import type { Expression } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from '../emit/emit-context.ts'
import { substituteBindings } from '../emit/emit-substitution.ts'
import { extractKeyFromJsxRoot } from './relational-class.ts'

export interface KeyedListBinding {
  name: string
  expr: Expression
}

export interface KeyedListParams {
  itemParam: any
  idxParam: any
  destructuredBindings: KeyedListBinding[]
  keyFn: Expression
  explicitKeyExpr: Expression | null
  keyItemName: string | null
  keyIdxName: string
  substitutedKeyExpr: Expression | null
}

export interface SavedBinding {
  name: string
  prev: Expression | undefined
}

export function buildKeyedListParams(cb: any): KeyedListParams {
  const rawItemParam = cb?.params?.[0] ?? t.identifier('item')
  const idxParam = cb?.params?.[1] ?? t.identifier('idx')

  let itemParam: any = rawItemParam
  const destructuredBindings: KeyedListBinding[] = []
  if (t.isObjectPattern(rawItemParam)) {
    const itemId = t.identifier('item')
    for (const prop of (rawItemParam as any).properties) {
      if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue
      const local = t.isIdentifier(prop.value) ? prop.value.name : prop.key.name
      destructuredBindings.push({
        name: local,
        expr: t.memberExpression(itemId, t.identifier(prop.key.name)),
      })
    }
    itemParam = itemId
  }

  const explicitKeyExpr = extractKeyFromJsxRoot(cb?.body)
  const keyItemName = t.isIdentifier(itemParam) ? itemParam.name : null
  const keyIdxName = t.isIdentifier(idxParam) ? idxParam.name : 'idx'
  let substitutedKeyExpr: Expression | null = null
  let keyFn: Expression

  if (explicitKeyExpr) {
    let keyExpr = explicitKeyExpr
    if (destructuredBindings.length > 0) {
      const m = new Map<string, Expression>()
      for (const b of destructuredBindings) m.set(b.name, b.expr)
      keyExpr = substituteBindings(keyExpr, m)
    }
    substitutedKeyExpr = keyExpr
    keyFn = t.arrowFunctionExpression([itemParam, idxParam], keyExpr)
  } else if (keyItemName) {
    keyFn = t.arrowFunctionExpression(
      [itemParam, idxParam],
      t.logicalExpression(
        '??',
        t.logicalExpression(
          '??',
          t.optionalMemberExpression(t.identifier(keyItemName), t.identifier('id'), false, true),
          t.identifier(keyItemName),
        ),
        t.identifier(keyIdxName),
      ),
    )
  } else {
    keyFn = t.arrowFunctionExpression([itemParam, idxParam], t.identifier(keyIdxName))
  }

  return {
    itemParam,
    idxParam,
    destructuredBindings,
    keyFn,
    explicitKeyExpr,
    keyItemName,
    keyIdxName,
    substitutedKeyExpr,
  }
}

export function installDestructuredItemBindings(ctx: EmitContext, bindings: KeyedListBinding[]): SavedBinding[] {
  const saved: SavedBinding[] = []
  for (const b of bindings) {
    saved.push({ name: b.name, prev: ctx.bindings.get(b.name) })
    ctx.bindings.set(b.name, b.expr)
  }
  return saved
}

export function restoreBindings(ctx: EmitContext, saved: SavedBinding[]): void {
  for (const s of saved) {
    if (s.prev === undefined) ctx.bindings.delete(s.name)
    else ctx.bindings.set(s.name, s.prev)
  }
}
