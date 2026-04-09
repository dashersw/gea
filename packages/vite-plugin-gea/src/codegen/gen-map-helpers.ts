import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsExpr, jsMethod, str, num } from 'eszter'
import type { ClassMethod } from '@babel/types'

import type {
  ArrayMapBinding, ConditionalSlot, PathParts, UnresolvedMapInfo,
} from '../ir/types.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'

import {
  buildObserveKey, buildOptionalMemberChain, buildListItemsSymbol, buildThisListItems, pathPartsToString, resolvePath,
} from './member-chain.ts'
import {
  replacePropRefsInExpression, replacePropRefsInStatements,
} from './prop-ref-utils.ts'

// Private helpers

export function getArrayPropNameFromExpr(expr: t.Expression): string | null {
  if (t.isIdentifier(expr)) return expr.name
  if (t.isMemberExpression(expr) && t.isIdentifier(expr.property)) return expr.property.name
  return null
}

export function getMapIndex(arrayPathParts: PathParts): number {
  const match = pathPartsToString(arrayPathParts).match(/__unresolved_(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function collectFreeIdentifiers(nodes: t.Node[]): Set<string> {
  const names = new Set<string>()
  function walk(node: t.Node, parent?: t.Node): void {
    if (t.isIdentifier(node)) {
      if (t.isMemberExpression(parent) && parent.property === node && !parent.computed) return
      if (t.isObjectProperty(parent) && parent.key === node) return
      if (t.isVariableDeclarator(parent) && parent.id === node) return
      names.add(node.name)
      return
    }
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c === 'object' && 'type' in c) walk(c, node)
      } else if (child && typeof child === 'object' && 'type' in child) {
        walk(child, node)
      }
    }
  }
  for (const node of nodes) walk(node)
  return names
}

export function pruneUnusedSetupStatements(stmts: t.Statement[], usedExpr: t.Expression): t.Statement[] {
  let result = [...stmts]
  let changed = true
  while (changed) {
    changed = false
    const usedNames = collectFreeIdentifiers([...result.map((s) => t.cloneNode(s, true)), t.cloneNode(usedExpr, true)])
    const nextResult: t.Statement[] = []
    for (const stmt of result) {
      if (!t.isVariableDeclaration(stmt)) { nextResult.push(stmt); continue }
      const decl = stmt.declarations[0]
      if (!decl) { nextResult.push(stmt); continue }
      const declaredNames = new Set<string>()
      if (t.isIdentifier(decl.id)) {
        declaredNames.add(decl.id.name)
      } else if (t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) declaredNames.add(prop.value.name)
          else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) declaredNames.add(prop.argument.name)
        }
      }
      if (declaredNames.size === 0 || [...declaredNames].some((n) => usedNames.has(n))) nextResult.push(stmt)
      else changed = true
    }
    result = nextResult
  }
  return result
}

function findRootTemplateLiteral(node: t.Expression | t.BlockStatement): t.TemplateLiteral | null {
  if (t.isTemplateLiteral(node)) return node
  if (t.isConditionalExpression(node))
    return findRootTemplateLiteral(node.consequent) || findRootTemplateLiteral(node.alternate)
  if (t.isLogicalExpression(node)) return findRootTemplateLiteral(node.right)
  if (t.isParenthesizedExpression(node)) return findRootTemplateLiteral(node.expression)
  if (t.isBlockStatement(node)) {
    const ret = node.body.find((s): s is t.ReturnStatement => t.isReturnStatement(s))
    if (ret?.argument) return findRootTemplateLiteral(ret.argument)
  }
  return null
}

function getExpressionPathParts(expr: t.Expression): string[] | null {
  if (t.isIdentifier(expr)) return [expr.name]
  if (t.isThisExpression(expr)) return ['this']
  if ((t.isMemberExpression(expr) || t.isOptionalMemberExpression(expr)) && !expr.computed) {
    if (!t.isIdentifier(expr.property)) return null
    const parent = getExpressionPathParts(expr.object as t.Expression)
    return parent ? [...parent, expr.property.name] : null
  }
  return null
}

function matchesArrayMapReference(
  expr: t.Expression, arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  const exprParts = getExpressionPathParts(expr)
  if (!exprParts) return false
  const pathOnly = arrayMap.arrayPathParts
  if (exprParts.length === pathOnly.length && exprParts.every((p, i) => p === pathOnly[i])) return true
  if (!arrayMap.storeVar) return false
  const fullPath = [arrayMap.storeVar, ...arrayMap.arrayPathParts]
  return exprParts.length === fullPath.length && exprParts.every((p, i) => p === fullPath[i])
}

/** Wrap a template method body for traverse. */
function wrapTemplateForTraverse(m: t.ClassMethod): t.Program {
  return t.program([t.expressionStatement(t.arrowFunctionExpression(m.params as t.Identifier[], m.body))])
}

/** Return true if path.node is a `.map(...)` CallExpression. */
function isMapCall(path: NodePath<t.CallExpression>): boolean {
  return t.isMemberExpression(path.node.callee) &&
    t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'map'
}

/** If a .map(...).join(...) chain wraps `path`, return the outer .join() call path. */
function getJoinChainPath(path: NodePath<t.CallExpression>): NodePath<t.CallExpression> | null {
  if (
    path.parentPath?.isMemberExpression() &&
    t.isIdentifier(path.parentPath.node.property) && path.parentPath.node.property.name === 'join' &&
    path.parentPath.parentPath?.isCallExpression()
  ) return path.parentPath.parentPath as NodePath<t.CallExpression>
  return null
}

/** Guard for this.someMethod() call expressions on a class body. */
function resolveThisMethodCall(
  expr: t.Expression | undefined, classBody: t.ClassBody | undefined,
): { helperName: string; method: t.ClassMethod } | null {
  if (!expr || !classBody || !t.isCallExpression(expr) || !t.isMemberExpression(expr.callee) ||
      !t.isThisExpression(expr.callee.object) || !t.isIdentifier(expr.callee.property)) return null
  const name = expr.callee.property.name
  const method = classBody.body.find(
    (n) => t.isClassMethod(n) && t.isIdentifier(n.key) && n.key.name === name,
  ) as t.ClassMethod | undefined
  return method && t.isBlockStatement(method.body) ? { helperName: name, method } : null
}

function addResolvedDep(
  deps: Map<string, { observeKey: string; pathParts: PathParts; storeVar?: string }>,
  pathParts: PathParts, storeVar?: string,
): void {
  const observeKey = buildObserveKey(pathParts, storeVar)
  if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts, storeVar })
}

// Map registration

export function generateMapRegistration(
  arrayMap: {
    arrayPathParts: PathParts; containerSelector: string
    containerBindingId?: string; containerUserIdExpr?: t.Expression; itemIdProperty?: string
  },
  unresolvedMap: UnresolvedMapInfo,
  templatePropNames?: Set<string>, wholeParamName?: string,
): t.ExpressionStatement {
  const arrayPathString = pathPartsToString(arrayMap.arrayPathParts)
  const containerName = `__${arrayPathString.replace(/\./g, '_')}_container`
  const arrayName = arrayPathString.replace(/\./g, '')
  const createMethodName = `create${arrayName.charAt(0).toUpperCase() + arrayName.slice(1)}Item`
  const mapIdx = getMapIndex(arrayMap.arrayPathParts)

  const containerLookup = arrayMap.containerUserIdExpr
    ? (jsExpr`__gid(${t.cloneNode(arrayMap.containerUserIdExpr, true) as t.Expression})` as t.Expression)
    : arrayMap.containerBindingId !== undefined
      ? (jsExpr`__gid(${jsExpr`this.id`} + ${'-' + arrayMap.containerBindingId})` as t.Expression)
      : (jsExpr`this.$(":scope")` as t.Expression)

  let arrExpr = t.cloneNode(unresolvedMap.computationExpr || t.arrayExpression([]), true) as t.Expression
  let setupStatements: t.Statement[] = unresolvedMap.computationSetupStatements?.length
    ? unresolvedMap.computationSetupStatements.map((s) => t.cloneNode(s, true)) : []
  if ((templatePropNames && templatePropNames.size > 0) || wholeParamName) {
    arrExpr = replacePropRefsInExpression(arrExpr, templatePropNames || new Set(), wholeParamName)
    if (setupStatements.length)
      setupStatements = replacePropRefsInStatements(setupStatements, templatePropNames || new Set(), wholeParamName)
  }

  const prunedSetup = pruneUnusedSetupStatements(setupStatements, arrExpr)
  const createArrow = unresolvedMap.indexVariable
    ? jsExpr`(__item, __idx) => this.${id(createMethodName)}(__item, __idx)`
    : jsExpr`(__item) => this.${id(createMethodName)}(__item)`

  const registerArgs: t.Expression[] = [
    num(mapIdx), str(containerName),
    jsExpr`() => ${containerLookup}`,
    t.arrowFunctionExpression([], t.blockStatement([...prunedSetup, js`return ${arrExpr};`])),
    createArrow,
  ]
  if (unresolvedMap.keyExpression) {
    // Complex key expression (e.g. template literal) — pass a key function
    const keyExpr = t.cloneNode(unresolvedMap.keyExpression, true)
    // Rewrite item variable (and index variable if present) for the key function parameters
    const itemVar = unresolvedMap.itemVariable
    const idxVar = unresolvedMap.indexVariable
    traverse(t.program([t.expressionStatement(keyExpr)]), {
      noScope: true,
      Identifier(path: NodePath<t.Identifier>) {
        if (path.node.name === itemVar) path.node.name = '__k'
        else if (idxVar && path.node.name === idxVar) path.node.name = '__ki'
      },
    })
    registerArgs.push(
      t.arrowFunctionExpression(
        idxVar ? [id('__k'), id('__ki')] : [id('__k')],
        t.callExpression(id('String'), [keyExpr]),
      ),
    )
  } else if (arrayMap.itemIdProperty && arrayMap.itemIdProperty !== ITEM_IS_KEY) {
    registerArgs.push(str(arrayMap.itemIdProperty))
  }

  return t.expressionStatement(t.callExpression(jsExpr`this[${id('GEA_REGISTER_MAP')}]`, registerArgs))
}

// Unresolved dependency collection

export function collectUnresolvedDependencies(
  unresolvedMaps: UnresolvedMapInfo[], stateRefs: Map<string, StateRefMeta>, classBody?: t.ClassBody,
): Array<{ observeKey: string; pathParts: PathParts; storeVar?: string }> {
  const deps = new Map<string, { observeKey: string; pathParts: PathParts; storeVar?: string }>()

  for (const unresolvedMap of unresolvedMaps) {
    if (!unresolvedMap.computationExpr) continue

    if (t.isIdentifier(unresolvedMap.computationExpr) && stateRefs.has(unresolvedMap.computationExpr.name)) {
      const ref = stateRefs.get(unresolvedMap.computationExpr.name)!
      if (ref.kind === 'imported-destructured' && ref.storeVar) {
        const storeRef = stateRefs.get(ref.storeVar)
        const getterPaths = ref.propName ? storeRef?.getterDeps?.get(ref.propName) : undefined
        if (getterPaths && getterPaths.length > 0) {
          for (const pp of getterPaths) addResolvedDep(deps, pp, ref.storeVar)
        } else if (storeRef?.reactiveFields?.has(ref.propName!)) {
          addResolvedDep(deps, [ref.propName!], ref.storeVar)
        } else {
          addResolvedDep(deps, [], ref.storeVar)
        }
        continue
      }
    }

    const resolved = resolveThisMethodCall(unresolvedMap.computationExpr, classBody)
    if (resolved) {
      const program = t.program(resolved.method.body.body.map((s) => t.cloneNode(s, true)))
      traverse(program, {
        noScope: true,
        MemberExpression(path: NodePath<t.MemberExpression>) {
          const r = resolvePath(path.node, stateRefs)
          if (r?.parts?.length) addResolvedDep(deps, [r.parts[0]], r.isImportedState ? r.storeVar : undefined)
        },
      })
      if (deps.size > 0) continue
    }

    let targetExpr = unresolvedMap.computationExpr
    if (resolved) {
      const ret = resolved.method.body.body.find(
        (s) => t.isReturnStatement(s) && !!s.argument,
      ) as t.ReturnStatement | undefined
      if (ret?.argument) targetExpr = t.cloneNode(ret.argument, true) as t.Expression
    }

    traverse(t.program([t.expressionStatement(t.cloneNode(targetExpr, true) as t.Expression)]), {
      noScope: true,
      MemberExpression(path: NodePath<t.MemberExpression>) {
        const node = path.parentPath && t.isCallExpression(path.parentPath.node) &&
          path.parentPath.node.callee === path.node ? path.node.object : path.node
        if (!t.isMemberExpression(node) && !t.isIdentifier(node)) return
        const result = resolvePath(node as t.MemberExpression | t.Identifier, stateRefs)
        if (result?.parts?.length)
          addResolvedDep(deps, [result.parts[0]], result.isImportedState ? result.storeVar : undefined)
      },
    })
  }

  return Array.from(deps.values())
}

// Template map replacement helpers

export function replaceMapWithComponentArrayItems(
  templateMethod: t.ClassMethod, arrayExpr: t.Expression | undefined,
  arrayPropName: string, opts?: { slotBranch?: boolean },
): boolean {
  if (!arrayExpr || !t.isBlockStatement(templateMethod.body)) return false
  let replaced = false
  traverse(wrapTemplateForTraverse(templateMethod), {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (replaced || !isMapCall(path)) return
      const mapObj = (path.node.callee as t.MemberExpression).object
      const matches =
        (t.isIdentifier(arrayExpr) && t.isIdentifier(mapObj) && mapObj.name === arrayExpr.name) ||
        (t.isMemberExpression(arrayExpr) && t.isMemberExpression(mapObj) &&
          t.isIdentifier(arrayExpr.property) && t.isIdentifier(mapObj.property) &&
          arrayExpr.property.name === mapObj.property.name) ||
        (t.isMemberExpression(arrayExpr) && t.isIdentifier(mapObj) &&
          t.isIdentifier(arrayExpr.property) && mapObj.name === arrayExpr.property.name)
      if (!matches) return
      const toReplace = getJoinChainPath(path) || path
      if (opts?.slotBranch) {
        toReplace.replaceWith(t.stringLiteral(''))
      } else {
        const joinCall = t.callExpression(
          t.memberExpression(buildThisListItems(arrayPropName), id('join')),
          [t.stringLiteral('')],
        )
        toReplace.replaceWith(joinCall)
      }
      replaced = true
    },
  })
  return replaced
}

export function replaceMapWithComponentArrayItemsInConditionalSlots(
  slots: ConditionalSlot[], arrayExpr: t.Expression | undefined, arrayPropName: string,
): void {
  if (!arrayExpr || slots.length === 0) return
  for (const slot of slots) {
    for (const key of ['truthyHtmlExpr', 'falsyHtmlExpr'] as const) {
      const expr = slot[key]
      if (!expr) continue
      const fakeMethod = jsMethod`${id('__tmpSlotMapReplace')}(__p) { return ${t.cloneNode(expr, true)}; }`
      replaceMapWithComponentArrayItems(fakeMethod, arrayExpr, arrayPropName, { slotBranch: true })
      const ret = fakeMethod.body.body[0]
      if (t.isReturnStatement(ret) && ret.argument) slot[key] = ret.argument
    }
  }
}

export function inlineIntoConstructor(classBody: t.ClassBody, statements: t.Statement[]): void {
  let ctor = classBody.body.find(
    (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'constructor',
  ) as t.ClassMethod | undefined
  if (!ctor) {
    ctor = appendToBody(jsMethod`${id('constructor')}(...args) {}`, js`super(...args);` as t.ExpressionStatement, ...statements)
    classBody.body.unshift(ctor)
    return
  }
  ctor.body.body.push(...statements)
}

export function ensureDisposeCalls(classBody: t.ClassBody, targets: string[]): void {
  // targets are raw arrayPropNames; access via geaListItemsSymbol computed property
  const stmts = targets.map((arrayPropName) => {
    const sym = buildListItemsSymbol(arrayPropName)
    return js`this[${sym}]?.forEach?.(item => item?.dispose?.());` as t.ExpressionStatement
  })
  const existing = classBody.body.find(
    (m) => t.isClassMethod(m) && t.isIdentifier(m.key) && m.key.name === 'dispose',
  ) as t.ClassMethod | undefined
  if (existing) { existing.body.body.unshift(...stmts); return }
  classBody.body.push(appendToBody(jsMethod`${id('dispose')}() {}`, ...stmts, js`super.dispose();` as t.ExpressionStatement))
}

export function injectMapItemAttrsIntoTemplate(
  templateMethod: t.ClassMethod,
  mapInfos: Array<{ itemVariable: string; itemIdProperty?: string; keyExpression?: t.Expression; containerBindingId?: string; eventToken?: string }>,
): void {
  if (mapInfos.length === 0) return
  const infoQueueByVar = new Map<string, typeof mapInfos>()
  for (const info of mapInfos) {
    if (!infoQueueByVar.has(info.itemVariable)) infoQueueByVar.set(info.itemVariable, [])
    infoQueueByVar.get(info.itemVariable)!.push(info)
  }
  traverse(wrapTemplateForTraverse(templateMethod), {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isMapCall(path)) return
      const fn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(fn)) return
      const paramName = t.isIdentifier(fn.params[0]) ? fn.params[0].name : null
      if (!paramName) return
      const info = infoQueueByVar.get(paramName)?.shift()
      if (!info) return

      const rootTL = findRootTemplateLiteral(t.isBlockStatement(fn.body) ? fn.body : fn.body)
      if (!rootTL) return

      // Strip any leftover data-gid
      for (let qi = 0; qi < rootTL.quasis.length; qi++) {
        const raw = rootTL.quasis[qi].value.raw
        const attrIdx = raw.indexOf(' data-gid="')
        if (attrIdx === -1) continue
        const before = raw.substring(0, attrIdx)
        const nextRaw = rootTL.quasis[qi + 1]?.value.raw
        if (nextRaw !== undefined && nextRaw.startsWith('"')) {
          const after = nextRaw.substring(1)
          rootTL.quasis[qi] = t.templateElement({ raw: before + after, cooked: before + after }, rootTL.quasis[qi + 1].tail)
          rootTL.quasis.splice(qi + 1, 1)
          rootTL.expressions.splice(qi, 1)
        }
        break
      }

      const first = rootTL.quasis[0].value.raw
      const tagMatch = first.match(/^(<[\w-]+)/)
      if (!tagMatch) return
      const tagPart = tagMatch[1], remainder = first.substring(tagPart.length)
      const tagName = tagPart.slice(1).toLowerCase()
      const eventAttr = info.eventToken && !tagName.includes('-') ? ` data-ge="${info.eventToken}"` : ''
      const itemIdExpr = info.keyExpression
        ? t.callExpression(id('String'), [t.cloneNode(info.keyExpression, true)])
        : info.itemIdProperty && info.itemIdProperty !== ITEM_IS_KEY
          ? t.logicalExpression('??', buildOptionalMemberChain(id(info.itemVariable), info.itemIdProperty), id(info.itemVariable))
          : jsExpr`String(${id(info.itemVariable)})`

      rootTL.quasis = [
        t.templateElement({ raw: `${tagPart} data-gid="`, cooked: `${tagPart} data-gid="` }),
        t.templateElement({ raw: `"${eventAttr}${remainder}`, cooked: `"${eventAttr}${remainder}` }, rootTL.quasis[0].tail),
        ...rootTL.quasis.slice(1),
      ]
      rootTL.expressions = [itemIdExpr, ...rootTL.expressions]
    },
  })
}

export function addJoinToUnresolvedMapCalls(templateMethod: t.ClassMethod, _unresolvedMaps: UnresolvedMapInfo[]): void {
  traverse(wrapTemplateForTraverse(templateMethod), {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isMapCall(path)) return
      if (!path.node.arguments[0] || !t.isArrowFunctionExpression(path.node.arguments[0])) return
      const joinPath = getJoinChainPath(path)
      if (joinPath) {
        joinPath.replaceWith(
          t.binaryExpression('+', t.cloneNode(joinPath.node, true) as t.Expression, t.stringLiteral('<!---->'))
        )
        joinPath.skip()
        return
      }
      path.replaceWith(
        t.binaryExpression(
          '+',
          t.callExpression(
            t.memberExpression(t.cloneNode(path.node, true) as t.Expression, t.identifier('join')),
            [t.stringLiteral('')]
          ),
          t.stringLiteral('<!---->')
        )
      )
    },
  })
}

export function replaceInlineMapWithRenderCall(
  classPath: NodePath<t.ClassDeclaration>,
  arrayMap: { arrayPathParts: PathParts; itemVariable: string; indexVariable?: string },
  renderMethodName: string,
) {
  const templateMethod = classPath.node.body.body.find(
    (n) => t.isClassMethod(n) && t.isIdentifier(n.key) && n.key.name === 'template',
  ) as ClassMethod | undefined
  if (!templateMethod) return
  const arrayLastSegment = arrayMap.arrayPathParts[arrayMap.arrayPathParts.length - 1]!

  traverse(wrapTemplateForTraverse(templateMethod), {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isMapCall(path) || !path.node.arguments[0]) return
      const obj = (path.node.callee as t.MemberExpression).object
      if (!t.isMemberExpression(obj) || !t.isIdentifier(obj.property) || obj.property.name !== arrayLastSegment) return
      const arrowFn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(arrowFn)) return

      const hasTplBody = t.isTemplateLiteral(arrowFn.body) ||
        (t.isBlockStatement(arrowFn.body) && arrowFn.body.body.length === 1 &&
          t.isReturnStatement(arrowFn.body.body[0]) && arrowFn.body.body[0].argument &&
          t.isTemplateLiteral(arrowFn.body.body[0].argument))
      if (!hasTplBody) return

      const paramName = t.isIdentifier(arrowFn.params[0]) ? arrowFn.params[0].name : '__item'
      if (!t.isIdentifier(arrowFn.params[0])) arrowFn.params[0] = t.identifier(paramName)
      const idxParam = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined
      arrowFn.body = idxParam
        ? jsExpr`this.${id(renderMethodName)}(${id(paramName)}, ${id(idxParam)})`
        : jsExpr`this.${id(renderMethodName)}(${id(paramName)})`

      const replacement = jsExpr`${path.node}.join('')`
      const joinPath = getJoinChainPath(path)
      if (joinPath) joinPath.replaceWith(replacement)
      else path.replaceWith(replacement)
      path.stop()
    },
  })
}

export function stripHtmlArrayMapJoinChainsInAst(
  rootStmt: t.Statement, arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  let replaced = false
  traverse(t.program([rootStmt]), {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isMapCall(path)) return
      if (!matchesArrayMapReference((path.node.callee as t.MemberExpression).object as t.Expression, arrayMap)) return
      const fn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(fn) && !t.isFunctionExpression(fn)) return
      const toReplace = getJoinChainPath(path) || path
      toReplace.replaceWith(t.stringLiteral(''))
      replaced = true
    },
  })
  return replaced
}

export function stripHtmlArrayMapJoinInTemplateMethod(
  templateMethod: t.ClassMethod, arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  if (!t.isBlockStatement(templateMethod.body)) return false
  return stripHtmlArrayMapJoinChainsInAst(wrapTemplateForTraverse(templateMethod).body[0]!, arrayMap)
}

export function replaceMapInConditionalSlots(
  slots: ConditionalSlot[], arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  let replaced = false
  for (const slot of slots) {
    for (const key of ['truthyHtmlExpr', 'falsyHtmlExpr'] as const) {
      const expr = slot[key]
      if (!expr) continue
      const wrap = t.expressionStatement(expr)
      replaced = stripHtmlArrayMapJoinChainsInAst(wrap, arrayMap) || replaced
      slot[key] = wrap.expression as t.Expression
    }
  }
  return replaced
}

export function collectPropNamesFromItemTemplate(
  itemTemplate: t.JSXElement | t.JSXFragment | null | undefined, templatePropNames: Set<string>,
): string[] {
  if (!itemTemplate) return []
  const used = new Set<string>()
  traverse(itemTemplate, {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      if (templatePropNames.has(path.node.name)) used.add(path.node.name)
    },
  })
  return Array.from(used)
}
