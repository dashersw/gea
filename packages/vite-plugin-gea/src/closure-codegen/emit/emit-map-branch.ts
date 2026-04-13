import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from './emit-context.ts'
import { compileJsxToBlock } from './emit-core.ts'

export function buildMapBranchFn(mapExpr: any, ctx: EmitContext): Expression {
  const arrowExpr = mapExpr.arguments[0]
  const params = arrowExpr.params
  const body = t.isBlockStatement(arrowExpr.body) ? arrowExpr.body : null
  const returned: any = body ? body.body.find((s: any) => t.isReturnStatement(s))?.argument : arrowExpr.body
  if (!returned || !(t.isJSXElement(returned) || t.isJSXFragment(returned))) {
    return t.arrowFunctionExpression(
      [t.identifier('d')],
      t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createComment')), [
        t.stringLiteral(''),
      ]),
    )
  }
  ctx.importsNeeded.add('keyedList')
  const itemParam = params[0] && t.isIdentifier(params[0]) ? params[0].name : 'item'
  const idxParam = params[1] && t.isIdentifier(params[1]) ? params[1].name : 'idx'
  // Extract `key={x}` attribute if present for keyed diffing.
  let keyExpr: any = t.identifier(idxParam)
  if (t.isJSXElement(returned)) {
    for (const attr of returned.openingElement.attributes) {
      if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'key' })) {
        if (attr.value && t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)) {
          keyExpr = attr.value.expression
        }
      }
    }
  }
  // Recursively compile the item JSX as a sub-block (nested template).
  // This path always needs the item-proxy + row disposer: reactive bindings
  // inside createItem register deps via withTracking, and those deps live in
  // row-scoped disposers.
  const createItemBlock = compileJsxToBlock(returned, ctx)
  const createItemFn = t.arrowFunctionExpression(
    [t.identifier(itemParam), t.identifier(idxParam), t.identifier('d')],
    createItemBlock,
  )
  ctx.importsNeeded.add('createItemObservable')
  ctx.importsNeeded.add('createItemProxy')
  ctx.importsNeeded.add('_rescue')
  ctx.importsNeeded.add('GEA_PROXY_RAW')
  const listId = 'L' + ctx.listCounter++
  const rqName = '__rq_' + listId
  ctx.templateDecls.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier(rqName), t.newExpression(t.identifier('Map'), [])),
    ]),
  )
  const ciName = '__ki_' + listId
  const sourceExpr = mapExpr.callee.object

  // Unwrap expression helper.
  const unwrapExpr = (expr: Expression): Expression =>
    t.logicalExpression(
      '||',
      t.logicalExpression(
        '&&',
        t.logicalExpression(
          '&&',
          t.cloneNode(expr, true),
          t.binaryExpression('===', t.unaryExpression('typeof', t.cloneNode(expr, true)), t.stringLiteral('object')),
        ),
        t.memberExpression(t.cloneNode(expr, true), t.identifier('GEA_PROXY_RAW'), true),
      ),
      t.cloneNode(expr, true),
    )

  // createEntry: rescue → alloc disposer+obs+proxy → call createItem → return entry.
  const createEntryBody: Statement[] = []
  createEntryBody.push(
    t.variableDeclaration('const', [t.variableDeclarator(t.identifier('__k'), t.cloneNode(keyExpr, true))]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__r'),
        t.callExpression(t.identifier('_rescue'), [
          t.identifier(rqName),
          t.callExpression(t.identifier('String'), [t.identifier('__k')]),
          t.identifier(itemParam),
        ]),
      ),
    ]),
    t.ifStatement(t.identifier('__r'), t.blockStatement([t.returnStatement(t.identifier('__r'))])),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__rd'),
        t.callExpression(t.memberExpression(t.identifier('d'), t.identifier('child')), []),
      ),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__obs'),
        t.callExpression(t.identifier('createItemObservable'), [t.identifier(itemParam)]),
      ),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__li'),
        t.conditionalExpression(
          t.logicalExpression(
            '&&',
            t.binaryExpression('!==', t.identifier(itemParam), t.nullLiteral()),
            t.binaryExpression('===', t.unaryExpression('typeof', t.identifier(itemParam)), t.stringLiteral('object')),
          ),
          t.callExpression(t.identifier('createItemProxy'), [t.identifier('__obs')]),
          t.identifier(itemParam),
        ),
      ),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('__el'),
        t.callExpression(t.identifier(ciName), [t.identifier('__li'), t.identifier(idxParam), t.identifier('__rd')]),
      ),
    ]),
    t.returnStatement(
      t.objectExpression([
        t.objectProperty(t.identifier('key'), t.identifier('__k')),
        t.objectProperty(t.identifier('item'), unwrapExpr(t.identifier(itemParam))),
        t.objectProperty(t.identifier('element'), t.identifier('__el')),
        t.objectProperty(t.identifier('disposer'), t.identifier('__rd')),
        t.objectProperty(t.identifier('obs'), t.identifier('__obs')),
      ]),
    ),
  )
  const createEntryFn = t.arrowFunctionExpression(
    [t.identifier(itemParam), t.identifier(idxParam)],
    t.blockStatement(createEntryBody),
  )

  // patchEntry: update e.item, fire obs so in-row observers re-run.
  const patchEntryFn = t.arrowFunctionExpression(
    [t.identifier('e'), t.identifier('newItem'), t.identifier('newIdx')],
    t.blockStatement([
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.identifier('e'), t.identifier('item')),
          unwrapExpr(t.identifier('newItem')),
        ),
      ),
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.memberExpression(t.identifier('e'), t.identifier('obs')), t.identifier('current')),
          t.identifier('newItem'),
        ),
      ),
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.memberExpression(t.identifier('e'), t.identifier('obs')), t.identifier('_fire')),
          [],
        ),
      ),
    ]),
  )

  const config = t.objectExpression([
    t.objectProperty(t.identifier('container'), t.identifier('root')),
    t.objectProperty(t.identifier('anchor'), t.identifier('anchor')),
    t.objectProperty(t.identifier('disposer'), t.identifier('d')),
    t.objectProperty(t.identifier('root'), ctx.reactiveRoot),
    t.objectProperty(t.identifier('pending'), t.identifier(rqName)),
    t.objectProperty(t.identifier('path'), t.arrowFunctionExpression([], sourceExpr)),
    t.objectProperty(
      t.identifier('key'),
      t.arrowFunctionExpression([t.identifier(itemParam), t.identifier(idxParam)], keyExpr),
    ),
    t.objectProperty(t.identifier('createEntry'), createEntryFn),
    t.objectProperty(t.identifier('patchEntry'), patchEntryFn),
  ])

  const body2 = t.blockStatement([
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('root'),
        t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createElement')), [
          t.stringLiteral('span'),
        ]),
      ),
    ]),
    t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier('root'), t.identifier('setAttribute')), [
        t.stringLiteral('style'),
        t.stringLiteral('display:contents'),
      ]),
    ),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier('anchor'),
        t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createComment')), [
          t.stringLiteral(''),
        ]),
      ),
    ]),
    t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier('root'), t.identifier('appendChild')), [t.identifier('anchor')]),
    ),
    t.variableDeclaration('const', [t.variableDeclarator(t.identifier(ciName), createItemFn)]),
    t.expressionStatement(t.callExpression(t.identifier('keyedList'), [config])),
    t.returnStatement(t.identifier('root')),
  ])
  return t.arrowFunctionExpression([t.identifier('d')], body2)
}
