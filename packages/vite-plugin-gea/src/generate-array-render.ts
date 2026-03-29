import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import { appendToBody, id, js, jsMethod } from 'eszter'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default
import type { ArrayMapBinding, EventHandler, HandlerPropInMap } from './ir.ts'
import { transformJSXToTemplate } from './transform-jsx.ts'
import {
  buildOptionalMemberChain,
  normalizePathParts,
  pathPartsToString,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
  optionalizeMemberChainsAfterComputedItemKey,
  optionalizeComputedItemKeyInStatements,
} from './utils.ts'
import { ITEM_IS_KEY } from './analyze-helpers.ts'
import { getTemplateParamBinding } from './template-param-utils.ts'
import { collectTemplateSetupStatements } from './transform-attributes.ts'
import type { TemplateSetupContext } from './transform-attributes.ts'

function buildHandlerRegistrationStatements(
  handlerProps: HandlerPropInMap[],
  itemVariable: string,
  propNames: Set<string>,
  wholeParamName?: string,
): t.Statement[] {
  if (handlerProps.length === 0) return []
  const stmts: t.Statement[] = [
    t.ifStatement(
      t.unaryExpression('!', t.memberExpression(t.thisExpression(), t.identifier('__itemHandlers_'))),
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), t.identifier('__itemHandlers_')),
          t.objectExpression([]),
        ),
      ),
    ),
  ]
  for (const hp of handlerProps) {
    const handlerClone = t.cloneNode(hp.handlerExpression, true) as t.ArrowFunctionExpression
    const handlerExpr = handlerClone
    const body = t.isBlockStatement(handlerExpr.body)
      ? handlerExpr.body.body
      : [t.expressionStatement(handlerExpr.body)]
    const bodyWithProps = replacePropRefsInStatements(body, propNames, wholeParamName)
    const fn =
      bodyWithProps.length === 1 && t.isExpressionStatement(bodyWithProps[0]) && !t.isBlockStatement(handlerExpr.body)
        ? t.arrowFunctionExpression([t.identifier('e')], (bodyWithProps[0] as t.ExpressionStatement).expression)
        : t.arrowFunctionExpression([t.identifier('e')], t.blockStatement(bodyWithProps))
    const keyExpr =
      hp.itemIdProperty && hp.itemIdProperty !== ITEM_IS_KEY
        ? t.logicalExpression(
            '??',
            buildOptionalMemberChain(t.identifier(itemVariable), hp.itemIdProperty),
            t.identifier(itemVariable),
          )
        : t.callExpression(t.identifier('String'), [t.identifier(itemVariable)])
    stmts.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('__itemHandlers_')), keyExpr, true),
          fn,
        ),
      ),
    )
  }
  return stmts
}

/** Build a method that populates __itemHandlers_ from an array. Used when the template
 *  uses the map inline (unresolved maps) so the render method's registration never runs. */
export function buildPopulateItemHandlersMethod(
  arrayPropName: string,
  handlerProps: HandlerPropInMap[],
  propNames: Set<string>,
  wholeParamName?: string,
): t.ClassMethod | null {
  if (handlerProps.length === 0) return null
  const loopBody: t.Statement[] = []
  for (const hp of handlerProps) {
    const handlerClone = t.cloneNode(hp.handlerExpression, true) as t.ArrowFunctionExpression
    const handlerExpr = handlerClone
    const stmtBody = t.isBlockStatement(handlerExpr.body)
      ? handlerExpr.body.body
      : [t.expressionStatement(handlerExpr.body)]
    const bodyWithProps = replacePropRefsInStatements(stmtBody, propNames, wholeParamName)
    const fn =
      bodyWithProps.length === 1 && t.isExpressionStatement(bodyWithProps[0]) && !t.isBlockStatement(handlerExpr.body)
        ? t.arrowFunctionExpression([t.identifier('e')], (bodyWithProps[0] as t.ExpressionStatement).expression)
        : t.arrowFunctionExpression([t.identifier('e')], t.blockStatement(bodyWithProps))
    const itemVar = 'item' // populate method uses generic loop var
    const keyExpr =
      hp.itemIdProperty && hp.itemIdProperty !== ITEM_IS_KEY
        ? t.logicalExpression(
            '??',
            buildOptionalMemberChain(t.identifier(itemVar), hp.itemIdProperty),
            t.identifier(itemVar),
          )
        : t.callExpression(t.identifier('String'), [t.identifier(itemVar)])
    loopBody.push(
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('__itemHandlers_')), keyExpr, true),
          fn,
        ),
      ),
    )
  }
  const body: t.Statement[] = [
    t.ifStatement(
      t.unaryExpression('!', t.memberExpression(t.thisExpression(), t.identifier('__itemHandlers_'))),
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.thisExpression(), t.identifier('__itemHandlers_')),
          t.objectExpression([]),
        ),
      ),
    ),
    t.ifStatement(t.unaryExpression('!', t.identifier('arr')), t.returnStatement()),
    t.forOfStatement(
      t.variableDeclaration('const', [t.variableDeclarator(t.identifier('item'), null)]),
      t.identifier('arr'),
      t.blockStatement(loopBody),
    ),
  ]
  return t.classMethod(
    'method',
    t.identifier(`__populateItemHandlersFor_${arrayPropName}`),
    [t.identifier('arr')],
    t.blockStatement(body),
  )
}

/**
 * The reactive proxy wraps primitive property accesses in binding objects.
 * This breaks === comparisons (two bindings wrapping the same value are
 * different objects). We inject a tiny helper and wrap comparison operands
 * so they're unwrapped before the comparison.
 */
export function buildRawStoreCacheField(): t.ClassPrivateProperty {
  return t.classPrivateProperty(t.privateName(t.identifier('__rs')))
}

export function buildValueUnwrapHelper(): t.VariableDeclaration {
  return js`
    const __v = (v) =>
      v != null && typeof v === 'object'
        ? v.valueOf()
        : v;
  ` as t.VariableDeclaration
}

/** True when an AST node is a known-primitive literal (string, number,
 *  boolean, null, undefined) that can never be a proxy-wrapped object. */
function isKnownPrimitive(node: t.Expression): boolean {
  return (
    t.isStringLiteral(node) ||
    t.isNumericLiteral(node) ||
    t.isBooleanLiteral(node) ||
    t.isNullLiteral(node) ||
    t.isTemplateLiteral(node) ||
    (t.isIdentifier(node) && node.name === 'undefined') ||
    (t.isUnaryExpression(node) && node.operator === '-' && t.isNumericLiteral(node.argument))
  )
}

function wrapWithV(node: t.Expression): t.Expression {
  if (isKnownPrimitive(node)) return node
  return t.callExpression(t.identifier('__v'), [node])
}

function unwrapComparisonOperands(node: t.Expression): t.Expression {
  if (t.isBinaryExpression(node) && ['===', '==', '!==', '!='].includes(node.operator)) {
    return t.binaryExpression(
      node.operator,
      wrapWithV(unwrapComparisonOperands(node.left as t.Expression)),
      wrapWithV(unwrapComparisonOperands(node.right as t.Expression)),
    )
  }
  if (t.isConditionalExpression(node)) {
    return t.conditionalExpression(
      unwrapComparisonOperands(node.test),
      unwrapComparisonOperands(node.consequent),
      unwrapComparisonOperands(node.alternate),
    )
  }
  if (t.isLogicalExpression(node)) {
    return t.logicalExpression(
      node.operator,
      unwrapComparisonOperands(node.left as t.Expression) as any,
      unwrapComparisonOperands(node.right as t.Expression),
    )
  }
  return node
}

export function generateRenderItemMethod(
  arrayMap: ArrayMapBinding,
  imports: Map<string, string>,
  eventHandlers?: EventHandler[],
  eventIdCounter?: { value: number },
  classBody?: t.ClassBody,
  templateSetupContext?: TemplateSetupContext,
): {
  method: t.ClassMethod | null
  handlers: EventHandler[]
  handlerPropsInMap: HandlerPropInMap[]
  needsUnwrapHelper: boolean
  needsRawStoreCache: boolean
} {
  const renderEventHandlers: EventHandler[] = []
  if (!arrayMap.itemTemplate)
    return {
      method: null,
      handlers: renderEventHandlers,
      handlerPropsInMap: [],
      needsUnwrapHelper: false,
      needsRawStoreCache: false,
    }
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))

  const modified = t.cloneNode(arrayMap.itemTemplate, true) as t.JSXElement | t.JSXFragment
  const handlerPropsInMap: HandlerPropInMap[] = []
  const ctx = {
    imports,
    eventHandlers: renderEventHandlers,
    eventIdCounter,
    inMapCallback: true,
    handlerPropsInMap,
    mapItemIdProperty: arrayMap.itemIdProperty || 'id',
    mapItemVariable: arrayMap.itemVariable,
    mapContainerBindingId: arrayMap.containerBindingId,
  }
  if (t.isJSXFragment(modified)) {
    const err = new Error(
      `[gea] Fragments as .map() item roots are not supported. Wrap the fragment children in a single root element (e.g., <div>...</div>).`,
    )
    ;(err as any).__geaCompileError = true
    throw err
  }
  const wrapped = transformJSXToTemplate(modified as t.JSXElement, ctx)

  const methodName = `render${arrayPath.charAt(0).toUpperCase() + arrayPath.slice(1).replace(/\./g, '')}Item`

  const propNames = new Set<string>()
  let wholeParam: string | undefined
  if (classBody) {
    const templateMethod = classBody.body.find(
      (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
    )
    const rootBinding = templateMethod ? getTemplateParamBinding(templateMethod.params[0]) : undefined
    if (rootBinding && t.isObjectPattern(rootBinding)) {
      rootBinding.properties.forEach((p) => {
        if (t.isObjectProperty(p) && t.isIdentifier(p.key)) propNames.add(p.key.name)
      })
    }
    if (rootBinding && t.isIdentifier(rootBinding)) {
      wholeParam = rootBinding.name
    }
  }

  const itemKey = arrayMap.itemVariable
  wrapped.expressions = wrapped.expressions.map((expr) =>
    optionalizeMemberChainsAfterComputedItemKey(
      replacePropRefsInExpression(unwrapComparisonOperands(expr as t.Expression), propNames, wholeParam),
      itemKey,
    ),
  )

  let needsRawStoreCache = false
  if (arrayMap.storeVar) {
    wrapped.expressions = wrapped.expressions.map((expr) => {
      const program = t.program([t.expressionStatement(t.cloneNode(expr as t.Expression, true))])
      traverse(program, {
        noScope: true,
        MemberExpression(path: NodePath<t.MemberExpression>) {
          if (!t.isIdentifier(path.node.object, { name: arrayMap.storeVar })) return
          if (!t.isIdentifier(path.node.property)) return
          if (path.node.computed) return
          needsRawStoreCache = true
          path.node.object = t.identifier('__rs')
        },
      })
      return (program.body[0] as t.ExpressionStatement).expression
    })
  }

  const handlerRegStmts = buildHandlerRegistrationStatements(
    handlerPropsInMap,
    arrayMap.itemVariable,
    propNames,
    wholeParam,
  )

  const callbackBodyStmts = arrayMap.callbackBodyStatements || []
  const setupScope =
    callbackBodyStmts.length > 0
      ? t.blockStatement([
          ...callbackBodyStmts.map((s) => t.cloneNode(s, true) as t.Statement),
          t.expressionStatement(wrapped),
        ])
      : wrapped
  const setupStmts = collectTemplateSetupStatements(setupScope, templateSetupContext)
  const rewrittenSetup = optionalizeComputedItemKeyInStatements(
    setupStmts
      .map((stmt) => replacePropRefsInStatements([t.cloneNode(stmt, true) as t.Statement], propNames, wholeParam))
      .flat(),
    itemKey,
  )

  const rewrittenCallbackBody = optionalizeComputedItemKeyInStatements(
    callbackBodyStmts
      .map((stmt) => replacePropRefsInStatements([t.cloneNode(stmt, true) as t.Statement], propNames, wholeParam))
      .flat(),
    itemKey,
  )

  const baseMethod = jsMethod`${id(methodName)}(${id(arrayMap.itemVariable)}) {}`
  if (arrayMap.indexVariable) {
    baseMethod.params.push(t.identifier(arrayMap.indexVariable))
  }

  // Only emit the __v helper if it's actually referenced in the output.
  const returnStmt = t.returnStatement(wrapped)
  function containsVCall(node: t.Node): boolean {
    if (t.isCallExpression(node) && t.isIdentifier(node.callee) && node.callee.name === '__v') return true
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c && containsVCall(c)) return true
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        if (containsVCall(child)) return true
      }
    }
    return false
  }
  const needsUnwrapHelper = [...rewrittenCallbackBody, returnStmt].some((stmt) => containsVCall(stmt))

  const privateRsField = t.memberExpression(t.thisExpression(), t.privateName(t.identifier('__rs')))
  const rawStoreCacheStmts: t.Statement[] = []
  if (needsRawStoreCache && arrayMap.storeVar) {
    rawStoreCacheStmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__rs'),
          t.logicalExpression(
            '||',
            t.cloneNode(privateRsField),
            t.assignmentExpression(
              '=',
              t.cloneNode(privateRsField),
              t.memberExpression(t.identifier(arrayMap.storeVar), t.identifier('__raw')),
            ),
          ),
        ),
      ]),
    )
  }

  const method = appendToBody(
    baseMethod,
    ...rawStoreCacheStmts,
    ...rewrittenSetup,
    ...rewrittenCallbackBody,
    ...handlerRegStmts,
    returnStmt,
  )

  if (handlerPropsInMap.length > 0 && classBody) {
    const handleItemHandler = jsMethod`__handleItemHandler(itemId, e) {
    const fn = this.__itemHandlers_?.[itemId];
    if (fn) fn(e);
  }` as t.ClassMethod
    if (
      !classBody.body.some((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === '__handleItemHandler')
    ) {
      classBody.body.unshift(handleItemHandler)
    }
  }

  renderEventHandlers.forEach((h) => {
    h.mapContext = {
      arrayPathParts: arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''),
      itemIdProperty: arrayMap.itemIdProperty || 'id',
      itemVariable: arrayMap.itemVariable,
      indexVariable: arrayMap.indexVariable,
      isImportedState: arrayMap.isImportedState || false,
      storeVar: arrayMap.storeVar,
      containerBindingId: arrayMap.containerBindingId ?? 'list',
    }
  })

  if (eventHandlers) renderEventHandlers.forEach((h) => eventHandlers.push(h))
  return { method, handlers: renderEventHandlers, handlerPropsInMap, needsUnwrapHelper, needsRawStoreCache }
}
