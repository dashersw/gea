import type { Expression, Identifier, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { substituteBindings } from '../emit/emit-substitution.ts'

export interface KeyedListEntryArrowOptions {
  ciName: string
  prName: string
  rqName: string
  needsItemProxy: boolean
  needsRowDisposer: boolean
  patchRowExpr: Expression | null
  substitutedKeyExpr: Expression | null
  keyItemName: string | null
  keyIdxName: string
  importsNeeded: Set<string>
}

export interface KeyedListEntryArrows {
  createEntryArrow: Expression
  patchEntryArrow: Expression
}

export function buildKeyedListEntryArrows(options: KeyedListEntryArrowOptions): KeyedListEntryArrows {
  const itemId = t.identifier('item')
  const idxId = t.identifier('idx')
  const newItemId = t.identifier('newItem')
  const newIdxId = t.identifier('newIdx')
  const eId = t.identifier('e')

  options.importsNeeded.add('GEA_PROXY_RAW')
  const createEntryArrow = buildCreateEntryArrow(options, itemId, idxId)
  const patchEntryArrow = buildPatchEntryArrow(options, eId, newItemId, newIdxId)
  return { createEntryArrow, patchEntryArrow }
}

export function buildSimpleKeyedListEntryArrows(options: KeyedListEntryArrowOptions): KeyedListEntryArrows {
  const itemId = t.identifier('item')
  const idxId = t.identifier('idx')
  const newItemId = t.identifier('newItem')
  const newIdxId = t.identifier('newIdx')
  const eId = t.identifier('e')

  options.importsNeeded.add('GEA_PROXY_RAW')
  const createEntryArrow = buildSimpleCreateEntryArrow(options, itemId, idxId)
  const patchEntryArrow = buildPatchEntryArrow(options, eId, newItemId, newIdxId)
  return { createEntryArrow, patchEntryArrow }
}

function buildCreateEntryArrow(options: KeyedListEntryArrowOptions, itemId: Identifier, idxId: Identifier): Expression {
  const { ciName, rqName, needsItemProxy, needsRowDisposer, importsNeeded } = options
  const createEntryStmts: Statement[] = []
  const kId = t.identifier('__k')
  createEntryStmts.push(
    t.variableDeclaration('const', [t.variableDeclarator(kId, keyExprWith(options, itemId, idxId))]),
  )

  importsNeeded.add('_rescue')
  const rescuedId = t.identifier('__r')
  const rawOnRescueId = t.identifier('__raw')
  const rescueIfStmts: Statement[] = [
    t.variableDeclaration('const', [t.variableDeclarator(rawOnRescueId, buildUnwrap(itemId))]),
  ]
  const rescueBody = buildRescueBody(options, rescuedId, rawOnRescueId, itemId, idxId)
  rescueIfStmts.push(
    t.ifStatement(
      t.binaryExpression('!==', t.memberExpression(rescuedId, t.identifier('item')), rawOnRescueId),
      t.blockStatement(rescueBody),
    ),
    t.returnStatement(rescuedId),
  )

  createEntryStmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        rescuedId,
        t.callExpression(t.identifier('_rescue'), [
          t.identifier(rqName),
          t.callExpression(t.identifier('String'), [t.cloneNode(kId, true)]),
          itemId,
        ]),
      ),
    ]),
    t.ifStatement(rescuedId, t.blockStatement(rescueIfStmts)),
  )

  const rowDId = t.identifier('__rd')
  if (needsRowDisposer) {
    createEntryStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          rowDId,
          t.callExpression(t.memberExpression(t.identifier('d'), t.identifier('child')), []),
        ),
      ]),
    )
  } else {
    importsNeeded.add('NOOP_DISPOSER')
    createEntryStmts.push(t.variableDeclaration('const', [t.variableDeclarator(rowDId, t.identifier('NOOP_DISPOSER'))]))
  }

  const obsId = t.identifier('__obs')
  const liveItemId = t.identifier('__li')
  if (needsItemProxy) {
    createEntryStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(obsId, t.callExpression(t.identifier('createItemObservable'), [itemId])),
      ]),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          liveItemId,
          t.conditionalExpression(
            t.logicalExpression(
              '&&',
              t.binaryExpression('!==', itemId, t.nullLiteral()),
              t.binaryExpression('===', t.unaryExpression('typeof', itemId), t.stringLiteral('object')),
            ),
            t.callExpression(t.identifier('createItemProxy'), [obsId]),
            itemId,
          ),
        ),
      ]),
    )
  } else {
    createEntryStmts.push(
      t.variableDeclaration('const', [t.variableDeclarator(obsId, t.nullLiteral())]),
      t.variableDeclaration('const', [t.variableDeclarator(liveItemId, itemId)]),
    )
  }

  const elementId = t.identifier('__el')
  createEntryStmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(elementId, t.callExpression(t.identifier(ciName), [liveItemId, idxId, rowDId])),
    ]),
    t.returnStatement(
      t.objectExpression([
        t.objectProperty(t.identifier('key'), kId),
        t.objectProperty(t.identifier('item'), buildUnwrap(itemId)),
        t.objectProperty(t.identifier('element'), elementId),
        t.objectProperty(t.identifier('disposer'), rowDId),
        t.objectProperty(t.identifier('obs'), obsId),
      ]),
    ),
  )

  return t.arrowFunctionExpression([itemId, idxId], t.blockStatement(createEntryStmts))
}

function buildSimpleCreateEntryArrow(
  options: KeyedListEntryArrowOptions,
  itemId: Identifier,
  idxId: Identifier,
): Expression {
  const { ciName, needsItemProxy, needsRowDisposer } = options
  const kId = t.identifier('__k')
  const elementId = t.identifier('__el')
  const rowDId = t.identifier('__rd')
  const obsId = t.identifier('__obs')
  const liveItemId = t.identifier('__li')
  const createEntryStmts: Statement[] = [
    t.variableDeclaration('const', [t.variableDeclarator(kId, keyExprWith(options, itemId, idxId))]),
  ]

  if (needsRowDisposer) {
    createEntryStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          rowDId,
          t.callExpression(t.memberExpression(t.identifier('d'), t.identifier('child')), []),
        ),
      ]),
    )
  }

  if (needsItemProxy) {
    createEntryStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(obsId, t.callExpression(t.identifier('createItemObservable'), [itemId])),
      ]),
      t.variableDeclaration('const', [
        t.variableDeclarator(
          liveItemId,
          t.conditionalExpression(
            t.logicalExpression(
              '&&',
              t.binaryExpression('!==', itemId, t.nullLiteral()),
              t.binaryExpression('===', t.unaryExpression('typeof', itemId), t.stringLiteral('object')),
            ),
            t.callExpression(t.identifier('createItemProxy'), [obsId]),
            itemId,
          ),
        ),
      ]),
    )
  }

  const createArgs: Expression[] = [needsItemProxy ? liveItemId : itemId, idxId]
  if (needsRowDisposer) createArgs.push(rowDId)
  createEntryStmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(elementId, t.callExpression(t.identifier(ciName), createArgs)),
    ]),
  )

  const props = [
    t.objectProperty(t.identifier('key'), kId),
    t.objectProperty(t.identifier('item'), buildUnwrap(itemId)),
    t.objectProperty(t.identifier('element'), elementId),
  ]
  if (needsRowDisposer) props.push(t.objectProperty(t.identifier('disposer'), rowDId))
  if (needsItemProxy) props.push(t.objectProperty(t.identifier('obs'), obsId))
  createEntryStmts.push(t.returnStatement(t.objectExpression(props)))
  return t.arrowFunctionExpression([itemId, idxId], t.blockStatement(createEntryStmts))
}

function buildRescueBody(
  options: KeyedListEntryArrowOptions,
  rescuedId: Identifier,
  rawOnRescueId: Identifier,
  itemId: Identifier,
  idxId: Identifier,
): Statement[] {
  const body: Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('__prev'), t.memberExpression(rescuedId, t.identifier('item'))),
    ]),
    t.expressionStatement(
      t.assignmentExpression('=', t.memberExpression(rescuedId, t.identifier('item')), rawOnRescueId),
    ),
  ]

  if (options.needsItemProxy) {
    body.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.memberExpression(rescuedId, t.identifier('obs')), t.identifier('current')),
          itemId,
        ),
      ),
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.memberExpression(rescuedId, t.identifier('obs')), t.identifier('_fire')),
          [],
        ),
      ),
    )
  }

  if (options.patchRowExpr) {
    body.push(
      t.expressionStatement(
        t.callExpression(t.identifier(options.prName), [
          t.memberExpression(rescuedId, t.identifier('element')),
          itemId,
          t.identifier('__prev'),
          idxId,
        ]),
      ),
    )
  }
  return body
}

function buildPatchEntryArrow(
  options: KeyedListEntryArrowOptions,
  eId: Identifier,
  newItemId: Identifier,
  newIdxId: Identifier,
): Expression {
  const patchEntryStmts: Statement[] = []
  const prevId = t.identifier('__prev')
  const rawNewId = t.identifier('__raw')
  const patchParams = t.isArrowFunctionExpression(options.patchRowExpr) ? options.patchRowExpr.params : []
  const needsPrev = patchParams.some((param) => t.isIdentifier(param, { name: 'prev' }))
  const needsIdx = patchParams.some((param) => t.isIdentifier(param) && param.name === (options.keyIdxName || 'idx'))

  if (needsPrev) {
    patchEntryStmts.push(
      t.variableDeclaration('const', [t.variableDeclarator(prevId, t.memberExpression(eId, t.identifier('item')))]),
    )
  }
  patchEntryStmts.push(
    t.variableDeclaration('const', [t.variableDeclarator(rawNewId, buildUnwrap(newItemId))]),
    t.expressionStatement(t.assignmentExpression('=', t.memberExpression(eId, t.identifier('item')), rawNewId)),
  )

  if (options.needsItemProxy) {
    patchEntryStmts.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.memberExpression(eId, t.identifier('obs')), t.identifier('current')),
          newItemId,
        ),
      ),
      t.expressionStatement(
        t.callExpression(t.memberExpression(t.memberExpression(eId, t.identifier('obs')), t.identifier('_fire')), []),
      ),
    )
  }

  if (options.patchRowExpr) {
    const args: Expression[] = [t.memberExpression(eId, t.identifier('element')), newItemId]
    if (needsPrev) args.push(prevId)
    if (needsIdx) args.push(newIdxId)
    patchEntryStmts.push(t.expressionStatement(t.callExpression(t.identifier(options.prName), args)))
  }

  return t.arrowFunctionExpression([eId, newItemId, newIdxId], t.blockStatement(patchEntryStmts))
}

function buildUnwrap(expr: Expression): Expression {
  return t.logicalExpression(
    '||',
    t.logicalExpression(
      '&&',
      t.cloneNode(expr, true),
      t.memberExpression(t.cloneNode(expr, true), t.identifier('GEA_PROXY_RAW'), true),
    ),
    t.cloneNode(expr, true),
  )
}

function keyExprWith(options: KeyedListEntryArrowOptions, subject: Expression, idxSubject: Expression): Expression {
  const keyExpr: Expression = options.substitutedKeyExpr
    ? t.cloneNode(options.substitutedKeyExpr, true)
    : options.keyItemName
      ? t.logicalExpression(
          '??',
          t.logicalExpression(
            '??',
            t.optionalMemberExpression(t.identifier(options.keyItemName), t.identifier('id'), false, true),
            t.identifier(options.keyItemName),
          ),
          t.identifier(options.keyIdxName),
        )
      : t.identifier(options.keyIdxName)
  const m = new Map<string, Expression>()
  if (options.keyItemName) m.set(options.keyItemName, subject)
  if (options.keyIdxName) m.set(options.keyIdxName, idxSubject)
  return m.size === 0 ? keyExpr : substituteBindings(keyExpr, m)
}
