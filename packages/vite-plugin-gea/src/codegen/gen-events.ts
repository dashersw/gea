import { t, generate } from '../utils/babel-interop.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'
import { id, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type { EventHandler, StateRefMeta } from '../ir/types.ts'
import {
  buildMemberChainFromParts,
  buildOptionalMemberChain,
} from './member-chain.ts'
import {
  extractHandlerBody,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
} from './prop-ref-utils.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import { collectTemplateSetupStatements } from '../analyze/binding-resolver.ts'
import { rewriteItemVarInExpression } from './array-compiler.ts'

const SKIP_BINDING: Record<string, Set<string>> = {
  VariableDeclarator: new Set(['id']),
  MemberExpression: new Set(['property']),
  OptionalMemberExpression: new Set(['property']),
  ArrowFunctionExpression: new Set(['params']),
  FunctionExpression: new Set(['params', 'id']),
  FunctionDeclaration: new Set(['params', 'id']),
}

function deepMapNode(node: t.Node, visit: (n: t.Node) => t.Node | undefined): t.Node {
  const hit = visit(node)
  if (hit !== undefined) return hit
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys?.length) return node
  const skip = SKIP_BINDING[node.type]
  let changed = false
  const updates: Record<string, any> = {}
  for (const key of keys) {
    if (skip?.has(key)) continue
    if (t.isObjectProperty(node) && key === 'key' && !node.computed) continue
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      let arrChanged = false
      const mapped = child.map((c: any) => {
        if (c && typeof c === 'object' && 'type' in c) {
          const r = deepMapNode(c, visit)
          if (r !== c) arrChanged = true
          return r
        }
        return c
      })
      if (arrChanged) { changed = true; updates[key] = mapped }
    } else if (child && typeof child === 'object' && 'type' in child) {
      const r = deepMapNode(child, visit)
      if (r !== child) { changed = true; updates[key] = r }
    }
  }
  if (!changed) return node
  return { ...node, ...updates } as t.Node
}

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

function ensureMapItemHelper(
  classBody: t.ClassBody,
  ctx: NonNullable<EventHandler['mapContext']>,
  helperName: string,
): void {
  if (classBody.body.some((m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === helperName)) return

  const itemsExpr = buildArrayItemsExpr(ctx)

  const findPredicate = ctx.keyExpression
    ? t.arrowFunctionExpression(
        [t.identifier('__candidate')],
        t.binaryExpression(
          '===',
          t.callExpression(t.identifier('String'), [
            rewriteItemVarInExpression(
              t.cloneNode(ctx.keyExpression, true) as t.Expression,
              ctx.itemVariable,
              '__candidate',
            ),
          ]),
          t.identifier('__itemId'),
        ),
      )
    : ctx.itemIdProperty && ctx.itemIdProperty !== ITEM_IS_KEY
      ? (() => {
          const optChain = buildOptionalMemberChain(t.identifier('__candidate'), ctx.itemIdProperty)
          return jsExpr`(__candidate) => String(${optChain} ?? __candidate) === __itemId`
        })()
      : ctx.itemIdProperty === ITEM_IS_KEY
        ? jsExpr`(__candidate) => String(__candidate) === __itemId`
        : jsExpr`(_, __i) => String(__i) === __itemId`
  const method = jsMethod`${id(helperName)}(e) {}`
  if (!ctx.keyExpression && ctx.itemIdProperty && ctx.itemIdProperty !== ITEM_IS_KEY) {
    method.body.body.push(
      ...buildGeaItemDomWalk(),
      ...jsBlockBody`
        if (!__el) return null;
        if (__el[GEA_DOM_ITEM]) return __el[GEA_DOM_ITEM];
        const __itemId = __el[GEA_DOM_KEY] ?? (__el.getAttribute && __el.getAttribute('data-gea-item-id'));
        if (__itemId == null) return null;
        const __items = ${itemsExpr};
        const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
        const __found = __arr.find(${findPredicate});
        return __found !== undefined ? __found : __itemId;
      `,
    )
  } else {
    method.body.body.push(
      ...buildGeaItemDomWalk(),
      ...jsBlockBody`
        if (!__el) return null;
        if (__el[GEA_DOM_ITEM]) return __el[GEA_DOM_ITEM];
        const __itemId = __el[GEA_DOM_KEY] ?? (__el.getAttribute && __el.getAttribute('data-gea-item-id'));
        if (__itemId == null) return null;
        const __items = ${itemsExpr};
        const __arr = Array.isArray(__items) ? __items : Array.isArray(__items?.__getTarget) ? __items.__getTarget : [];
        return __arr.find(${findPredicate}) || __itemId;
      `,
    )
  }
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
    const store = h.mapContext.storeVar || 'store'
    const path = h.mapContext.arrayPathParts.join('_')
    const keyPart = h.mapContext.keyExpression ? `expr:${generate(h.mapContext.keyExpression).code}` : h.mapContext.itemIdProperty
    const key = `${store}_${path}_${keyPart}`
    if (seenContexts.has(key)) continue
    seenContexts.add(key)
    ensureMapItemHelper(classBody, h.mapContext, `__getMapItemFromEvent_${store}_${path}`)
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
  const returnStmt = getter.body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined
  const eventsObject = returnStmt?.argument && t.isObjectExpression(returnStmt.argument) ? returnStmt.argument : null
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
    const selectorCode = generate(selectorExpr).code
    const isDuplicate = selectorMap.properties.some(
      (prop) => t.isObjectProperty(prop) && generate(prop.key).code === selectorCode,
    )
    if (!isDuplicate) {
      selectorMap.properties.push(t.objectProperty(selectorExpr, handlerRef, !handler.selector))
    }
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
    const propLit = t.stringLiteral(handler.delegatedPropName)
    const owner = handler.usesTargetComponent ? t.identifier('targetComponent') : t.thisExpression()
    const callbackInit = t.memberExpression(t.memberExpression(owner, t.identifier('props')), propLit, true)
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
      )
    }
    method.body.body.push(
      t.variableDeclaration('const', [t.variableDeclarator(t.identifier('callback'), callbackInit)]),
      t.ifStatement(
        t.binaryExpression('===', t.unaryExpression('typeof', t.identifier('callback')), t.stringLiteral('function')),
        t.expressionStatement(t.callExpression(t.identifier('callback'), [t.identifier('e')])),
      ),
    )
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
    (m) => t.isClassMethod(m) && m.kind === 'get' && t.isIdentifier(m.key) && m.key.name === 'events',
  ) as t.ClassMethod | undefined
  if (existing) return existing
  const getter = t.classMethod('get', t.identifier('events'), [], t.blockStatement([t.returnStatement(t.objectExpression([]))]))
  classBody.body.push(getter)
  return getter
}

function replacePropsObjectRefsInNode(node: t.Node, propsObjectName: string): t.Node {
  return deepMapNode(node, (n) => {
    if (t.isIdentifier(n) && n.name === propsObjectName) {
      return t.memberExpression(t.thisExpression(), t.identifier('props'))
    }
    return undefined
  })
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
    const mapIdx = t.numericLiteral(Number(unresolvedMatch[1]))
    return jsExpr`this[${id('GEA_MAPS')}][${mapIdx}].getItems()`
  }
  const base = ctx.isImportedState
    ? opts.raw
      ? t.memberExpression(t.identifier(ctx.storeVar || 'store'), id('GEA_PROXY_RAW'), true)
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
    while (__el && __el[GEA_DOM_KEY] == null && (!__el.getAttribute || !__el.getAttribute('data-gea-item-id'))) __el = __el.parentElement;
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
        if (!__el || !__el[GEA_DOM_ITEM]) return;
        const ${id(ctx.indexVariable!)} = ${rawArrayExpr}.indexOf(__el[GEA_DOM_ITEM]);
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
        const ${id(ctx.indexVariable!)} = __el ? ${rawArrayExpr}.indexOf(__el[GEA_DOM_ITEM]) : -1;
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
