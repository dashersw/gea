/**
 * Event method generation for the Gea compiler.
 *
 * Builds the `get events()` getter and individual event handler methods
 * on the component class, covering regular handlers, delegated prop callbacks,
 * and map-context handlers (item lookup via DOM walk).
 */
import { t } from '../utils/babel-interop.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'
import { id, jsBlockBody, jsMethod } from 'eszter'
import type { EventHandler } from '../ir/types.ts'
import type { StateRefMeta } from '../ir/types.ts'
import {
  buildMemberChainFromParts,
  buildOptionalMemberChain,
  extractHandlerBody,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
} from './ast-helpers.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import { collectTemplateSetupStatements } from '../analyze/binding-resolver.ts'

interface TemplateParamContext {
  propNames: Set<string>
  propsObjectName?: string
}

function getTemplateParamContext(classBody: t.ClassBody): TemplateParamContext {
  const templateMethod = classBody.body.find(
    (m): m is t.ClassMethod => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'template',
  )
  if (!templateMethod || templateMethod.params.length === 0) {
    return { propNames: new Set() }
  }
  const binding = getTemplateParamBinding(templateMethod.params[0])
  if (t.isIdentifier(binding)) {
    return { propNames: new Set(), propsObjectName: binding.name }
  }
  if (t.isObjectPattern(binding)) {
    return {
      propNames: new Set(
        binding.properties
          .filter((p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.key))
          .map((p) => (p.key as t.Identifier).name),
      ),
    }
  }
  return { propNames: new Set() }
}

function getMapContextKey(ctx: NonNullable<EventHandler['mapContext']>): string {
  const store = ctx.storeVar || 'store'
  const path = ctx.arrayPathParts.join('_')
  return `${store}_${path}_${ctx.itemIdProperty}`
}

function ensureMapItemHelper(
  classBody: t.ClassBody,
  ctx: NonNullable<EventHandler['mapContext']>,
  helperName: string,
): void {
  if (classBody.body.some((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === helperName)) return

  const itemsExpr = buildArrayItemsExpr(ctx)

  const findPredicate =
    ctx.itemIdProperty && ctx.itemIdProperty !== ITEM_IS_KEY
      ? t.arrowFunctionExpression(
          [t.identifier('__candidate')],
          t.binaryExpression(
            '===',
            t.callExpression(t.identifier('String'), [
              t.logicalExpression(
                '??',
                buildOptionalMemberChain(t.identifier('__candidate'), ctx.itemIdProperty),
                t.identifier('__candidate'),
              ),
            ]),
            t.identifier('__itemId'),
          ),
        )
      : ctx.itemIdProperty === ITEM_IS_KEY
        ? t.arrowFunctionExpression(
            [t.identifier('__candidate')],
            t.binaryExpression(
              '===',
              t.callExpression(t.identifier('String'), [t.identifier('__candidate')]),
              t.identifier('__itemId'),
            ),
          )
        : t.arrowFunctionExpression(
            [t.identifier('_'), t.identifier('__i')],
            t.binaryExpression(
              '===',
              t.callExpression(t.identifier('String'), [t.identifier('__i')]),
              t.identifier('__itemId'),
            ),
          )
  const method = jsMethod`${id(helperName)}(e) {}`
  method.body.body.push(
    ...buildGeaItemDomWalk(),
    ...jsBlockBody`
      if (!__el) return null;
      if (__el.__geaItem) return __el.__geaItem;
      const __itemId = __el.__geaKey ?? (__el.getAttribute && __el.getAttribute('data-gea-item-id'));
      if (__itemId == null) return null;
      const __items = ${itemsExpr};
      const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
      return __arr.find(${findPredicate}) || __itemId;
    `,
  )
  classBody.body.unshift(method)
}

function getLocalFunctionInSetup(
  name: string,
  setupStatements: t.Statement[],
): t.ArrowFunctionExpression | t.FunctionExpression | null {
  for (const stmt of setupStatements) {
    if (!t.isVariableDeclaration(stmt) || stmt.declarations.length !== 1) continue
    const decl = stmt.declarations[0]
    if (!decl || !t.isIdentifier(decl.id) || decl.id.name !== name || !decl.init) continue
    if (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init)) return decl.init
  }
  return null
}

export function appendCompiledEventMethods(
  classBody: t.ClassBody,
  handlers: EventHandler[],
  storeImports: Map<string, string>,
  knownComponentImports: Set<string>,
  templateParams: t.Statement[],
  sourceFile: string,
  imports: Map<string, string>,
  stateRefs: Map<string, StateRefMeta>,
): boolean {
  if (handlers.length === 0) return false

  const paramContext = getTemplateParamContext(classBody)
  const mapHandlers = handlers.filter(
    (h): h is EventHandler & { mapContext: NonNullable<EventHandler['mapContext']> } => Boolean(h.mapContext),
  )
  const seenContexts = new Set<string>()
  for (const h of mapHandlers) {
    const key = getMapContextKey(h.mapContext)
    if (seenContexts.has(key)) continue
    seenContexts.add(key)
    const helperName = `__getMapItemFromEvent_${h.mapContext.storeVar || 'store'}_${h.mapContext.arrayPathParts.join('_')}`
    ensureMapItemHelper(classBody, h.mapContext, helperName)
  }

  appendEventsGetterHandlers(classBody, handlers, paramContext, templateParams)

  return true
}

function isDirectThisMethodRef(handler: EventHandler): boolean {
  return (
    !!handler.handlerExpression &&
    t.isMemberExpression(handler.handlerExpression) &&
    t.isThisExpression(handler.handlerExpression.object) &&
    t.isIdentifier(handler.handlerExpression.property) &&
    !handler.delegatedPropName &&
    !handler.mapContext
  )
}

function appendEventsGetterHandlers(
  classBody: t.ClassBody,
  handlers: EventHandler[],
  paramContext: TemplateParamContext,
  setupStatements: t.Statement[],
): void {
  const getter = ensureEventsGetter(classBody)
  const eventsObject = getEventsObject(getter)
  if (!eventsObject) return

  handlers.forEach((handler, index) => {
    let handlerRef: t.Expression

    if (isDirectThisMethodRef(handler)) {
      const prop = (handler.handlerExpression as t.MemberExpression).property as t.Identifier
      handlerRef = t.memberExpression(t.thisExpression(), t.cloneNode(prop) as t.Identifier)
    } else {
      let methodName = handler.methodName || `__event_${handler.eventType}_${index}`
      let uniqueIndex = 1
      while (findClassMethod(classBody, methodName) && handler.methodName !== methodName) {
        methodName = `__event_${handler.eventType}_${index}_${uniqueIndex++}`
      }
      handler.methodName = methodName

      if (!findClassMethod(classBody, methodName)) {
        classBody.body.push(buildSelectorHandlerMethod(handler, methodName, paramContext, setupStatements))
      }

      handlerRef = t.memberExpression(t.thisExpression(), t.identifier(methodName))
    }

    const selectorExpr = handler.selectorExpression
      ? replacePropRefsInExpression(
          t.cloneNode(handler.selectorExpression, true),
          paramContext.propNames,
          paramContext.propsObjectName,
        )
      : handler.selector
        ? t.stringLiteral(handler.selector)
        : t.stringLiteral(`.__missing_selector_${index}`)

    let eventTypeProp = eventsObject.properties.find(
      (prop) =>
        t.isObjectProperty(prop) &&
        !prop.computed &&
        t.isIdentifier(prop.key) &&
        prop.key.name === handler.eventType &&
        t.isObjectExpression(prop.value),
    ) as t.ObjectProperty | undefined

    if (!eventTypeProp) {
      eventTypeProp = t.objectProperty(t.identifier(handler.eventType), t.objectExpression([]))
      eventsObject.properties.push(eventTypeProp)
    }

    const selectorMap = eventTypeProp.value as t.ObjectExpression
    selectorMap.properties.push(t.objectProperty(selectorExpr, handlerRef, !handler.selector))
  })
}

function buildSelectorHandlerMethod(
  handler: EventHandler,
  methodName: string,
  paramContext: TemplateParamContext,
  setupStatements: t.Statement[],
): t.ClassMethod {
  const method = jsMethod`${id(methodName)}(e, targetComponent) {}`

  if (handler.delegatedPropName) {
    if (handler.usesTargetComponent) {
      method.body.body.push(
        t.ifStatement(
          t.logicalExpression(
            '||',
            t.unaryExpression('!', t.identifier('targetComponent')),
            t.unaryExpression('!', t.memberExpression(t.identifier('targetComponent'), t.identifier('props'))),
          ),
          t.returnStatement(),
        ),
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('callback'),
            t.memberExpression(
              t.memberExpression(t.identifier('targetComponent'), t.identifier('props')),
              t.stringLiteral(handler.delegatedPropName),
              true,
            ),
          ),
        ]),
        t.ifStatement(
          t.binaryExpression('===', t.unaryExpression('typeof', t.identifier('callback')), t.stringLiteral('function')),
          t.expressionStatement(t.callExpression(t.identifier('callback'), [t.identifier('e')])),
        ),
      )
    } else {
      method.body.body.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier('callback'),
            t.memberExpression(
              t.memberExpression(t.thisExpression(), t.identifier('props')),
              t.stringLiteral(handler.delegatedPropName),
              true,
            ),
          ),
        ]),
        t.ifStatement(
          t.binaryExpression('===', t.unaryExpression('typeof', t.identifier('callback')), t.stringLiteral('function')),
          t.expressionStatement(t.callExpression(t.identifier('callback'), [t.identifier('e')])),
        ),
      )
    }
    return method
  }

  if (handler.mapContext) {
    method.body.body.push(...buildMapEventBody(handler, paramContext))
  } else if (handler.handlerExpression) {
    method.body.body.push(...buildHandlerBody(handler, paramContext, setupStatements))
  }

  return method
}

function ensureEventsGetter(classBody: t.ClassBody): t.ClassMethod {
  const existing = classBody.body.find(
    (member) =>
      t.isClassMethod(member) && member.kind === 'get' && t.isIdentifier(member.key) && member.key.name === 'events',
  ) as t.ClassMethod | undefined
  if (existing) return existing

  const getter = t.classMethod(
    'get',
    t.identifier('events'),
    [],
    t.blockStatement([t.returnStatement(t.objectExpression([]))]),
  )
  classBody.body.push(getter)
  return getter
}

function getEventsObject(getter: t.ClassMethod): t.ObjectExpression | null {
  const returnStmt = getter.body.body.find((statement) => t.isReturnStatement(statement)) as
    | t.ReturnStatement
    | undefined
  if (!returnStmt || !returnStmt.argument || !t.isObjectExpression(returnStmt.argument)) return null
  return returnStmt.argument
}

function replacePropsObjectRefsInNode(node: t.Node, propsObjectName: string): t.Node {
  if (t.isIdentifier(node) && node.name === propsObjectName) {
    return t.memberExpression(t.thisExpression(), t.identifier('props'))
  }
  if (t.isExpressionStatement(node)) {
    return t.expressionStatement(replacePropsObjectRefsInNode(node.expression, propsObjectName) as t.Expression)
  }
  if (t.isBlockStatement(node)) {
    return t.blockStatement(node.body.map((s) => replacePropsObjectRefsInNode(s, propsObjectName) as t.Statement))
  }
  if (t.isIfStatement(node)) {
    return t.ifStatement(
      replacePropsObjectRefsInNode(node.test, propsObjectName) as t.Expression,
      replacePropsObjectRefsInNode(node.consequent, propsObjectName) as t.Statement,
      node.alternate ? (replacePropsObjectRefsInNode(node.alternate, propsObjectName) as t.Statement) : null,
    )
  }
  if (t.isReturnStatement(node)) {
    return t.returnStatement(
      node.argument ? (replacePropsObjectRefsInNode(node.argument, propsObjectName) as t.Expression) : null,
    )
  }
  if (t.isCallExpression(node)) {
    return t.callExpression(
      replacePropsObjectRefsInNode(node.callee, propsObjectName) as t.Expression,
      node.arguments.map(
        (a) => (t.isExpression(a) ? replacePropsObjectRefsInNode(a, propsObjectName) : a) as t.Expression,
      ),
    )
  }
  if (t.isMemberExpression(node)) {
    return t.memberExpression(
      replacePropsObjectRefsInNode(node.object, propsObjectName) as t.Expression,
      node.property,
      node.computed,
    )
  }
  if (t.isOptionalMemberExpression(node)) {
    return t.optionalMemberExpression(
      replacePropsObjectRefsInNode(node.object, propsObjectName) as t.Expression,
      node.property as t.Expression,
      node.computed,
      node.optional,
    )
  }
  if (t.isOptionalCallExpression(node)) {
    return t.optionalCallExpression(
      replacePropsObjectRefsInNode(node.callee, propsObjectName) as t.Expression,
      node.arguments.map(
        (a) => (t.isExpression(a) ? replacePropsObjectRefsInNode(a, propsObjectName) : a) as t.Expression,
      ),
      node.optional,
    )
  }
  if (t.isConditionalExpression(node)) {
    return t.conditionalExpression(
      replacePropsObjectRefsInNode(node.test, propsObjectName) as t.Expression,
      replacePropsObjectRefsInNode(node.consequent, propsObjectName) as t.Expression,
      replacePropsObjectRefsInNode(node.alternate, propsObjectName) as t.Expression,
    )
  }
  if (t.isLogicalExpression(node)) {
    return t.logicalExpression(
      node.operator,
      replacePropsObjectRefsInNode(node.left, propsObjectName) as t.Expression,
      replacePropsObjectRefsInNode(node.right, propsObjectName) as t.Expression,
    )
  }
  if (t.isBinaryExpression(node)) {
    return t.binaryExpression(
      node.operator,
      replacePropsObjectRefsInNode(node.left, propsObjectName) as t.Expression,
      replacePropsObjectRefsInNode(node.right, propsObjectName) as t.Expression,
    )
  }
  if (t.isUnaryExpression(node)) {
    return t.unaryExpression(
      node.operator,
      replacePropsObjectRefsInNode(node.argument, propsObjectName) as t.Expression,
      node.prefix,
    )
  }
  if (t.isSequenceExpression(node)) {
    return t.sequenceExpression(
      node.expressions.map((e) => replacePropsObjectRefsInNode(e, propsObjectName) as t.Expression),
    )
  }
  if (t.isAssignmentExpression(node)) {
    return t.assignmentExpression(
      node.operator,
      replacePropsObjectRefsInNode(node.left, propsObjectName) as t.LVal,
      replacePropsObjectRefsInNode(node.right, propsObjectName) as t.Expression,
    )
  }
  if (t.isVariableDeclaration(node)) {
    return t.variableDeclaration(
      node.kind,
      node.declarations.map((d) =>
        t.variableDeclarator(
          d.id,
          d.init ? (replacePropsObjectRefsInNode(d.init, propsObjectName) as t.Expression) : null,
        ),
      ),
    )
  }
  if (t.isArrowFunctionExpression(node)) {
    const body = t.isBlockStatement(node.body)
      ? t.blockStatement(node.body.body.map((s) => replacePropsObjectRefsInNode(s, propsObjectName) as t.Statement))
      : (replacePropsObjectRefsInNode(node.body, propsObjectName) as t.Expression)
    return t.arrowFunctionExpression(node.params, body, node.async)
  }
  if (t.isFunctionExpression(node)) {
    const body = t.blockStatement(
      node.body.body.map((s) => replacePropsObjectRefsInNode(s, propsObjectName) as t.Statement),
    )
    return t.functionExpression(node.id, node.params, body, node.generator, node.async)
  }
  return node
}

function applyTemplateParamContext(statements: t.Statement[], paramContext: TemplateParamContext): t.Statement[] {
  let next = paramContext.propNames.size ? replacePropRefsInStatements(statements, paramContext.propNames) : statements
  if (paramContext.propsObjectName) {
    next = next.map((stmt) => replacePropsObjectRefsInNode(stmt, paramContext.propsObjectName!) as t.Statement)
  }
  return next
}

function referencesIdentifier(nodes: t.Node[], name: string): boolean {
  function walk(node: t.Node | null | undefined): boolean {
    if (!node) return false
    if (t.isIdentifier(node) && node.name === name) return true
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child) if (c && walk(c)) return true
      } else if (child && typeof child === 'object' && child.type) {
        if (walk(child)) return true
      }
    }
    return false
  }
  return nodes.some(walk)
}

function buildArrayItemsExpr(ctx: NonNullable<EventHandler['mapContext']>, opts: { raw?: boolean } = {}): t.Expression {
  const [first] = ctx.arrayPathParts
  const unresolvedMatch = first?.match(/^__unresolved_(\d+)$/)
  if (unresolvedMatch) {
    const mapIdx = Number(unresolvedMatch[1])
    return t.callExpression(
      t.memberExpression(
        t.memberExpression(
          t.memberExpression(t.thisExpression(), t.identifier('__geaMaps')),
          t.numericLiteral(mapIdx),
          true,
        ),
        t.identifier('getItems'),
      ),
      [],
    )
  }
  const base = ctx.isImportedState
    ? opts.raw
      ? t.memberExpression(t.identifier(ctx.storeVar || 'store'), t.identifier('__raw'))
      : t.identifier(ctx.storeVar || 'store')
    : t.thisExpression()
  if (ctx.arrayPathParts.length === 0) return base
  const [, ...rest] = ctx.arrayPathParts
  const isIndex = /^\d+$/.test(first)
  const firstAccess = ctx.isImportedState
    ? t.memberExpression(base, isIndex ? t.numericLiteral(Number(first)) : t.identifier(first), isIndex)
    : t.optionalMemberExpression(base, isIndex ? t.numericLiteral(Number(first)) : t.identifier(first), isIndex, true)
  return rest.length > 0 ? buildMemberChainFromParts(firstAccess, rest) : firstAccess
}

function buildGeaItemDomWalk(): t.Statement[] {
  return jsBlockBody`
    var __el = e.target;
    while (__el && __el.__geaKey == null && (!__el.getAttribute || !__el.getAttribute('data-gea-item-id'))) __el = __el.parentElement;
  `
}

function buildMapEventBody(handler: EventHandler, paramContext: TemplateParamContext): t.Statement[] {
  const ctx = handler.mapContext!
  const itemVar = ctx.itemVariable || 'item'
  const helperName = `__getMapItemFromEvent_${ctx.storeVar || 'store'}_${ctx.arrayPathParts.join('_')}`
  const handlerBody = applyTemplateParamContext(
    extractHandlerBody(handler.handlerExpression, paramContext.propNames),
    paramContext,
  )
  const needsItem = referencesIdentifier(handlerBody, itemVar)
  const needsIndex = !!(ctx.indexVariable && referencesIdentifier(handlerBody, ctx.indexVariable))

  if (needsIndex && !needsItem) {
    const rawArrayExpr = buildArrayItemsExpr(ctx, { raw: true })
    const preamble = [
      ...buildGeaItemDomWalk(),
      ...jsBlockBody`
        if (!__el || !__el.__geaItem) return;
        const ${id(ctx.indexVariable!)} = ${rawArrayExpr}.indexOf(__el.__geaItem);
      `,
    ]
    return [...preamble, ...handlerBody]
  }

  const preamble = jsBlockBody`
    const ${id(itemVar)} = this.${id(helperName)}(e);
    if (!${id(itemVar)}) { return; }
  `
  if (needsIndex) {
    const rawArrayExpr = buildArrayItemsExpr(ctx, { raw: true })
    preamble.push(
      ...buildGeaItemDomWalk(),
      ...jsBlockBody`
        const ${id(ctx.indexVariable!)} = __el ? ${rawArrayExpr}.indexOf(__el.__geaItem) : -1;
      `,
    )
  }
  return [...preamble, ...handlerBody]
}

function prependDependentSetupStatements(
  node: t.Node,
  setupStatements: t.Statement[],
  paramContext: TemplateParamContext,
): t.Statement[] {
  if (setupStatements.length === 0) return []
  const statements = collectTemplateSetupStatements(node, {
    params: [],
    statements: setupStatements,
  })
  return applyTemplateParamContext(statements, paramContext)
}

function buildHandlerBody(
  handler: EventHandler,
  paramContext: TemplateParamContext,
  setupStatements: t.Statement[] = [],
): t.Statement[] {
  const expr = handler.handlerExpression
  if (t.isIdentifier(expr)) {
    const localFn = getLocalFunctionInSetup(expr.name, setupStatements)
    if (localFn) {
      const localBody = t.isBlockStatement(localFn.body) ? localFn.body.body : [t.expressionStatement(localFn.body)]
      const dependentSetup = prependDependentSetupStatements(localFn.body, setupStatements, paramContext)
      const body = applyTemplateParamContext(localBody, paramContext)
      return [...dependentSetup, ...body]
    }
  }
  if (handler.mapContext) {
    return buildMapEventBody(handler, paramContext)
  }
  const dependentSetup = prependDependentSetupStatements(expr, setupStatements, paramContext)
  return [
    ...dependentSetup,
    ...applyTemplateParamContext(extractHandlerBody(expr, paramContext.propNames), paramContext),
  ]
}

function findClassMethod(classBody: t.ClassBody, name: string): t.ClassMethod | null {
  return (
    (classBody.body.find(
      (member): member is t.ClassMethod =>
        t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === name,
    ) as t.ClassMethod | undefined) ?? null
  )
}
