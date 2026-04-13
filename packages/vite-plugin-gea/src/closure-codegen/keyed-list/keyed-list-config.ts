import type { Expression } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { RelationalClassMatch } from './relational-class.ts'

export interface KeyedListConfigOptions {
  anchorId: Expression
  listRoot: Expression
  pendingName: string
  path: Expression
  keyFn: Expression
  createEntryArrow: Expression
  patchEntryArrow: Expression
  relMatches: RelationalClassMatch[]
  itemParam: any
}

export function buildKeyedListConfig(options: KeyedListConfigOptions): Expression {
  const cfgProps: any[] = [
    t.objectProperty(t.identifier('container'), t.memberExpression(options.anchorId, t.identifier('parentNode'))),
    t.objectProperty(t.identifier('anchor'), options.anchorId),
    t.objectProperty(t.identifier('disposer'), t.identifier('d')),
    t.objectProperty(t.identifier('root'), options.listRoot),
    t.objectProperty(t.identifier('pending'), t.identifier(options.pendingName)),
    t.objectProperty(t.identifier('path'), options.path),
    t.objectProperty(t.identifier('key'), options.keyFn),
    t.objectProperty(t.identifier('createEntry'), options.createEntryArrow),
    t.objectProperty(t.identifier('patchEntry'), options.patchEntryArrow),
  ]

  addRelationalClassCallbacks(cfgProps, options.relMatches, options.itemParam)
  return t.objectExpression(cfgProps)
}

export function buildSimpleKeyedListConfig(options: KeyedListConfigOptions): Expression {
  const cfgProps: any[] = [
    t.objectProperty(t.identifier('container'), t.memberExpression(options.anchorId, t.identifier('parentNode'))),
    t.objectProperty(t.identifier('anchor'), options.anchorId),
    t.objectProperty(t.identifier('disposer'), t.identifier('d')),
    t.objectProperty(t.identifier('root'), options.listRoot),
    t.objectProperty(t.identifier('path'), options.path),
    t.objectProperty(t.identifier('key'), options.keyFn),
    t.objectProperty(t.identifier('createEntry'), options.createEntryArrow),
    t.objectProperty(t.identifier('patchEntry'), options.patchEntryArrow),
  ]

  addRelationalClassCallbacks(cfgProps, options.relMatches, options.itemParam)
  return t.objectExpression(cfgProps)
}

export function buildPropKeyedListConfig(options: KeyedListConfigOptions & { prop: string }): Expression {
  const cfgProps: any[] = [
    t.objectProperty(t.identifier('container'), t.memberExpression(options.anchorId, t.identifier('parentNode'))),
    t.objectProperty(t.identifier('anchor'), options.anchorId),
    t.objectProperty(t.identifier('disposer'), t.identifier('d')),
    t.objectProperty(t.identifier('root'), options.listRoot),
    t.objectProperty(t.identifier('prop'), t.stringLiteral(options.prop)),
    t.objectProperty(t.identifier('key'), options.keyFn),
    t.objectProperty(t.identifier('createEntry'), options.createEntryArrow),
    t.objectProperty(t.identifier('patchEntry'), options.patchEntryArrow),
  ]

  addRelationalClassCallbacks(cfgProps, options.relMatches, options.itemParam)
  return t.objectExpression(cfgProps)
}

function addRelationalClassCallbacks(cfgProps: any[], relMatches: RelationalClassMatch[], itemParam: any): void {
  if (relMatches.length === 0 || !t.isIdentifier(itemParam)) return
  const eId = t.identifier('e')
  const byKeyMatches = relMatches.filter((m) => (m as any).useByKey)
  const mapMatches = relMatches.filter((m) => !(m as any).useByKey)

  if (mapMatches.length > 0) {
    const body = mapMatches.map((m) => {
      const mapId = t.identifier('__rowEls_' + m.id)
      const keyRead = t.memberExpression(t.memberExpression(eId, t.identifier('item')), t.identifier(m.itemKeyProp))
      return t.expressionStatement(t.unaryExpression('delete', t.memberExpression(mapId, keyRead, true)))
    })
    cfgProps.push(
      t.objectProperty(t.identifier('onItemRemove'), t.arrowFunctionExpression([eId], t.blockStatement(body))),
    )
  }

  if (byKeyMatches.length > 0) {
    const bkArg = t.identifier('bk')
    const assignStmts = byKeyMatches.map((m) =>
      t.expressionStatement(t.assignmentExpression('=', t.identifier('__byKey_' + m.id), t.cloneNode(bkArg, true))),
    )
    cfgProps.push(
      t.objectProperty(
        t.identifier('onByKeyCreated'),
        t.arrowFunctionExpression([bkArg], t.blockStatement(assignStmts)),
      ),
    )
  }
}
