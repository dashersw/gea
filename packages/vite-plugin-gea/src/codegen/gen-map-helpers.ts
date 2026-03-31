import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsExpr, jsMethod } from 'eszter'
import type { ClassMethod } from '@babel/types'

import type {
  ArrayMapBinding,
  ConditionalSlot,
  PathParts,
  UnresolvedMapInfo,
} from '../ir/types.ts'
import type { StateRefMeta } from '../parse/state-refs.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'

import {
  buildObserveKey,
  buildOptionalMemberChain,
  pathPartsToString,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
  resolvePath,
} from './ast-helpers.ts'

// ═══════════════════════════════════════════════════════════════════════════
// Private helpers
// ═══════════════════════════════════════════════════════════════════════════

export function getArrayPropNameFromExpr(expr: t.Expression): string | null {
  if (t.isIdentifier(expr)) return expr.name
  if (t.isMemberExpression(expr) && t.isIdentifier(expr.property)) return expr.property.name
  return null
}

export function getMapIndex(arrayPathParts: PathParts): number {
  const s = pathPartsToString(arrayPathParts)
  const match = s.match(/__unresolved_(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function collectFreeIdentifiers(nodes: t.Node[]): Set<string> {
  const names = new Set<string>()
  for (const node of nodes) {
    traverse(
      t.isProgram(node) ? node : t.program([t.isStatement(node) ? node : t.expressionStatement(node as t.Expression)]),
      {
        noScope: true,
        Identifier(path: NodePath<t.Identifier>) {
          if (t.isMemberExpression(path.parent) && path.parent.property === path.node && !path.parent.computed) return
          if (t.isObjectProperty(path.parent) && (path.parent.key === path.node || path.parent.value === path.node)) {
            if (path.parentPath && t.isObjectPattern(path.parentPath.parent)) return
          }
          if (t.isVariableDeclarator(path.parent) && path.parent.id === path.node) return
          names.add(path.node.name)
        },
      },
    )
  }
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
      if (!t.isVariableDeclaration(stmt)) {
        nextResult.push(stmt)
        continue
      }
      const decl = stmt.declarations[0]
      if (!decl) {
        nextResult.push(stmt)
        continue
      }
      const declaredNames = new Set<string>()
      if (t.isIdentifier(decl.id)) {
        declaredNames.add(decl.id.name)
      } else if (t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) declaredNames.add(prop.value.name)
          else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) declaredNames.add(prop.argument.name)
        }
      }
      if (declaredNames.size === 0 || [...declaredNames].some((n) => usedNames.has(n))) {
        nextResult.push(stmt)
      } else {
        changed = true
      }
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
  expr: t.Expression,
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  const exprParts = getExpressionPathParts(expr)
  if (!exprParts) return false
  const pathOnly = arrayMap.arrayPathParts
  if (exprParts.length === pathOnly.length && exprParts.every((part, idx) => part === pathOnly[idx])) return true
  if (!arrayMap.storeVar) return false
  const fullPath = [arrayMap.storeVar, ...arrayMap.arrayPathParts]
  return exprParts.length === fullPath.length && exprParts.every((part, idx) => part === fullPath[idx])
}

// ═══════════════════════════════════════════════════════════════════════════
// Map registration
// ═══════════════════════════════════════════════════════════════════════════

export function generateMapRegistration(
  arrayMap: {
    arrayPathParts: PathParts
    containerSelector: string
    containerBindingId?: string
    containerUserIdExpr?: t.Expression
    itemIdProperty?: string
  },
  unresolvedMap: UnresolvedMapInfo,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
): t.ExpressionStatement {
  const arrayPathString = pathPartsToString(arrayMap.arrayPathParts)
  const containerName = `__${arrayPathString.replace(/\./g, '_')}_container`
  const arrayName = arrayPathString.replace(/\./g, '')
  const capName = arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
  const createMethodName = `create${capName}Item`
  const mapIdx = getMapIndex(arrayMap.arrayPathParts)

  const containerLookup = arrayMap.containerUserIdExpr
    ? (jsExpr`document.getElementById(${t.cloneNode(arrayMap.containerUserIdExpr, true) as t.Expression})` as t.Expression)
    : arrayMap.containerBindingId !== undefined
      ? (jsExpr`document.getElementById(${jsExpr`this.id`} + ${'-' + arrayMap.containerBindingId})` as t.Expression)
      : (jsExpr`this.$(":scope")` as t.Expression)

  let arrExpr = t.cloneNode(unresolvedMap.computationExpr || t.arrayExpression([]), true) as t.Expression
  let setupStatements: t.Statement[] = unresolvedMap.computationSetupStatements?.length
    ? unresolvedMap.computationSetupStatements.map((s) => t.cloneNode(s, true))
    : []
  const needsReplace = (templatePropNames && templatePropNames.size > 0) || wholeParamName
  if (needsReplace) {
    arrExpr = replacePropRefsInExpression(arrExpr, templatePropNames || new Set(), wholeParamName)
    if (setupStatements.length) {
      setupStatements = replacePropRefsInStatements(setupStatements, templatePropNames || new Set(), wholeParamName)
    }
  }

  const prunedSetup = pruneUnusedSetupStatements(setupStatements, arrExpr)
  const getItemsBody: t.Statement[] = [...prunedSetup, js`return ${arrExpr};`]

  const createCallExpr = unresolvedMap.indexVariable
    ? jsExpr`this.${id(createMethodName)}(${id('__item')}, ${id('__idx')})`
    : jsExpr`this.${id(createMethodName)}(${id('__item')})`

  const createArrow = unresolvedMap.indexVariable
    ? t.arrowFunctionExpression([id('__item'), id('__idx')], createCallExpr)
    : t.arrowFunctionExpression([id('__item')], createCallExpr)

  const registerArgs: t.Expression[] = [
    t.numericLiteral(mapIdx),
    t.stringLiteral(containerName),
    t.arrowFunctionExpression([], containerLookup),
    t.arrowFunctionExpression([], t.blockStatement(getItemsBody)),
    createArrow,
  ]

  if (arrayMap.itemIdProperty && arrayMap.itemIdProperty !== ITEM_IS_KEY) {
    registerArgs.push(t.stringLiteral(arrayMap.itemIdProperty))
  }

  return t.expressionStatement(
    t.callExpression(jsExpr`this.__geaRegisterMap`, registerArgs),
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Unresolved dependency collection
// ═══════════════════════════════════════════════════════════════════════════

export function collectUnresolvedDependencies(
  unresolvedMaps: UnresolvedMapInfo[],
  stateRefs: Map<string, StateRefMeta>,
  classBody?: t.ClassBody,
): Array<{ observeKey: string; pathParts: PathParts; storeVar?: string }> {
  const deps = new Map<string, { observeKey: string; pathParts: PathParts; storeVar?: string }>()

  unresolvedMaps.forEach((unresolvedMap) => {
    if (!unresolvedMap.computationExpr) return

    if (t.isIdentifier(unresolvedMap.computationExpr) && stateRefs.has(unresolvedMap.computationExpr.name)) {
      const ref = stateRefs.get(unresolvedMap.computationExpr.name)!
      if (ref.kind === 'imported-destructured' && ref.storeVar) {
        const storeRef = stateRefs.get(ref.storeVar)
        const getterPaths = ref.propName ? storeRef?.getterDeps?.get(ref.propName) : undefined
        if (getterPaths && getterPaths.length > 0) {
          for (const pathParts of getterPaths) {
            const observeKey = buildObserveKey(pathParts, ref.storeVar)
            if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts, storeVar: ref.storeVar })
          }
        } else if (storeRef?.reactiveFields?.has(ref.propName!)) {
          const pathParts: PathParts = [ref.propName!]
          const observeKey = buildObserveKey(pathParts, ref.storeVar)
          if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts, storeVar: ref.storeVar })
        } else {
          const observeKey = buildObserveKey([], ref.storeVar)
          if (!deps.has(observeKey)) deps.set(observeKey, { observeKey, pathParts: [], storeVar: ref.storeVar })
        }
        return
      }
    }

    if (collectHelperMethodDependencies(unresolvedMap.computationExpr, classBody, stateRefs, deps)) {
      return
    }
    const depExpr = resolveHelperCallExpressionForDeps(unresolvedMap.computationExpr, classBody)
    const targetExpr = depExpr || unresolvedMap.computationExpr
    const program = t.program([t.expressionStatement(t.cloneNode(targetExpr, true) as t.Expression)])
    traverse(program, {
      noScope: true,
      MemberExpression(path: NodePath<t.MemberExpression>) {
        const targetExpr =
          path.parentPath && t.isCallExpression(path.parentPath.node) && path.parentPath.node.callee === path.node
            ? path.node.object
            : path.node
        if (!t.isMemberExpression(targetExpr) && !t.isIdentifier(targetExpr)) return
        const result = resolvePath(targetExpr as t.MemberExpression | t.Identifier, stateRefs)
        if (!result?.parts?.length) return
        const observeParts = [result.parts[0]]
        const observeKey = buildObserveKey(observeParts, result.isImportedState ? result.storeVar : undefined)
        if (!deps.has(observeKey))
          deps.set(observeKey, {
            observeKey,
            pathParts: observeParts,
            storeVar: result.isImportedState ? result.storeVar : undefined,
          })
      },
    })
  })

  return Array.from(deps.values())
}

function collectHelperMethodDependencies(
  expr: t.Expression | undefined,
  classBody: t.ClassBody | undefined,
  stateRefs: Map<string, StateRefMeta>,
  deps: Map<string, { observeKey: string; pathParts: PathParts; storeVar?: string }>,
): boolean {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property) ||
    !classBody
  ) {
    return false
  }

  const helperMethodName = expr.callee.property.name

  const helperMethod = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === helperMethodName,
  ) as t.ClassMethod | undefined
  if (!helperMethod || !t.isBlockStatement(helperMethod.body)) return false

  const program = t.program(helperMethod.body.body.map((stmt) => t.cloneNode(stmt, true)))
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const resolved = resolvePath(path.node, stateRefs)
      if (!resolved?.parts?.length) return
      const observeParts = [resolved.parts[0]]
      const observeKey = buildObserveKey(observeParts, resolved.isImportedState ? resolved.storeVar : undefined)
      if (!deps.has(observeKey)) {
        deps.set(observeKey, {
          observeKey,
          pathParts: observeParts,
          storeVar: resolved.isImportedState ? resolved.storeVar : undefined,
        })
      }
    },
  })
  return deps.size > 0
}

function resolveHelperCallExpressionForDeps(
  expr: t.Expression | undefined,
  classBody?: t.ClassBody,
): t.Expression | undefined {
  if (
    !expr ||
    !t.isCallExpression(expr) ||
    !t.isMemberExpression(expr.callee) ||
    !t.isThisExpression(expr.callee.object) ||
    !t.isIdentifier(expr.callee.property) ||
    !classBody
  ) {
    return expr
  }

  const helperName = expr.callee.property.name
  const helperMethod = classBody.body.find(
    (node) => t.isClassMethod(node) && t.isIdentifier(node.key) && node.key.name === helperName,
  ) as t.ClassMethod | undefined
  if (!helperMethod || !t.isBlockStatement(helperMethod.body)) return expr

  const returnStmt = helperMethod.body.body.find((stmt) => t.isReturnStatement(stmt) && !!stmt.argument) as
    | t.ReturnStatement
    | undefined
  return returnStmt?.argument ? (t.cloneNode(returnStmt.argument, true) as t.Expression) : expr
}

// ═══════════════════════════════════════════════════════════════════════════
// Template map replacement helpers
// ═══════════════════════════════════════════════════════════════════════════

export function replaceMapWithComponentArrayItems(
  templateMethod: t.ClassMethod,
  arrayExpr: t.Expression | undefined,
  itemsName: string,
  opts?: { slotBranch?: boolean },
): boolean {
  if (!arrayExpr || !t.isBlockStatement(templateMethod.body)) return false
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])
  let replaced = false
  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (replaced) return
      if (!t.isMemberExpression(path.node.callee)) return
      const prop = path.node.callee.property
      const mapObj = path.node.callee.object
      if (!t.isIdentifier(prop) || prop.name !== 'map') return

      const matches =
        (t.isIdentifier(arrayExpr) && t.isIdentifier(mapObj) && mapObj.name === arrayExpr.name) ||
        (t.isMemberExpression(arrayExpr) &&
          t.isMemberExpression(mapObj) &&
          t.isIdentifier(arrayExpr.property) &&
          t.isIdentifier(mapObj.property) &&
          arrayExpr.property.name === mapObj.property.name) ||
        (t.isMemberExpression(arrayExpr) &&
          t.isIdentifier(mapObj) &&
          t.isIdentifier(arrayExpr.property) &&
          mapObj.name === arrayExpr.property.name)
      if (!matches) return

      let toReplace: NodePath<t.Node> = path
      if (
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()
      ) {
        toReplace = path.parentPath.parentPath as NodePath<t.CallExpression>
      }

      const replacement = opts?.slotBranch
        ? t.stringLiteral('')
        : jsExpr`this.${id(itemsName)}.join("")`
      toReplace.replaceWith(replacement)
      replaced = true
    },
  })
  return replaced
}

export function replaceMapWithComponentArrayItemsInConditionalSlots(
  slots: ConditionalSlot[],
  arrayExpr: t.Expression | undefined,
  itemsName: string,
): void {
  if (!arrayExpr || slots.length === 0) return
  for (const slot of slots) {
    for (const key of ['truthyHtmlExpr', 'falsyHtmlExpr'] as const) {
      const expr = slot[key]
      if (!expr) continue
      const fakeMethod = jsMethod`${id('__tmpSlotMapReplace')}(__p) { return ${t.cloneNode(expr, true)}; }`
      replaceMapWithComponentArrayItems(fakeMethod, arrayExpr, itemsName, { slotBranch: true })
      const ret = fakeMethod.body.body[0]
      if (t.isReturnStatement(ret) && ret.argument) {
        slot[key] = ret.argument
      }
    }
  }
}

export function inlineIntoConstructor(classBody: t.ClassBody, statements: t.Statement[]): void {
  let ctor = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'constructor',
  ) as t.ClassMethod | undefined

  if (!ctor) {
    ctor = appendToBody(
      jsMethod`${id('constructor')}(...args) {}`,
      t.expressionStatement(t.callExpression(t.super(), [t.spreadElement(t.identifier('args'))])),
      ...statements,
    )
    classBody.body.unshift(ctor)
    return
  }

  ctor.body.body.push(...statements)
}

export function ensureDisposeCalls(classBody: t.ClassBody, targets: string[]): void {
  const disposeStatements = targets.map(
    (target) => js`this.${id(target)}?.forEach?.(item => item?.dispose?.());` as t.ExpressionStatement,
  )

  const existingDispose = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'dispose',
  ) as t.ClassMethod | undefined

  if (existingDispose) {
    existingDispose.body.body.unshift(...disposeStatements)
    return
  }

  classBody.body.push(
    appendToBody(jsMethod`${id('dispose')}() {}`, ...disposeStatements, js`super.dispose();` as t.ExpressionStatement),
  )
}

export function injectMapItemAttrsIntoTemplate(
  templateMethod: t.ClassMethod,
  mapInfos: Array<{
    itemVariable: string
    itemIdProperty?: string
    containerBindingId?: string
    eventToken?: string
  }>,
): void {
  if (mapInfos.length === 0) return
  const infoQueueByVar = new Map<string, typeof mapInfos>()
  for (const info of mapInfos) {
    if (!infoQueueByVar.has(info.itemVariable)) infoQueueByVar.set(info.itemVariable, [])
    infoQueueByVar.get(info.itemVariable)!.push(info)
  }
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])
  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      const fn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(fn)) return
      const paramName = t.isIdentifier(fn.params[0]) ? fn.params[0].name : null
      if (!paramName) return
      const info = infoQueueByVar.get(paramName)?.shift()
      if (!info) return

      const rootTL = findRootTemplateLiteral(t.isBlockStatement(fn.body) ? fn.body : fn.body)
      if (!rootTL) return

      // Strip any leftover data-gea-item-id from the template literal
      for (let qi = 0; qi < rootTL.quasis.length; qi++) {
        const raw = rootTL.quasis[qi].value.raw
        const attrIdx = raw.indexOf(' data-gea-item-id="')
        if (attrIdx === -1) continue
        const before = raw.substring(0, attrIdx)
        const nextRaw = rootTL.quasis[qi + 1]?.value.raw
        if (nextRaw !== undefined && nextRaw.startsWith('"')) {
          const after = nextRaw.substring(1)
          rootTL.quasis[qi] = t.templateElement(
            { raw: before + after, cooked: before + after },
            rootTL.quasis[qi + 1].tail,
          )
          rootTL.quasis.splice(qi + 1, 1)
          rootTL.expressions.splice(qi, 1)
        }
        break
      }

      const first = rootTL.quasis[0].value.raw
      const tagMatch = first.match(/^(<[\w-]+)/)
      if (!tagMatch) return
      const tagPart = tagMatch[1]
      const remainder = first.substring(tagPart.length)
      const tagName = tagPart.slice(1).toLowerCase()
      const isIntrinsicRoot = !tagName.includes('-')
      const eventAttr = info.eventToken && isIntrinsicRoot ? ` data-gea-event="${info.eventToken}"` : ''

      const itemIdExpr =
        info.itemIdProperty && info.itemIdProperty !== ITEM_IS_KEY
          ? t.logicalExpression(
              '??',
              buildOptionalMemberChain(id(info.itemVariable), info.itemIdProperty),
              id(info.itemVariable),
            )
          : jsExpr`String(${id(info.itemVariable)})`

      rootTL.quasis = [
        t.templateElement({ raw: `${tagPart} data-gea-item-id="`, cooked: `${tagPart} data-gea-item-id="` }),
        t.templateElement(
          { raw: `"${eventAttr}${remainder}`, cooked: `"${eventAttr}${remainder}` },
          rootTL.quasis[0].tail,
        ),
        ...rootTL.quasis.slice(1),
      ]
      rootTL.expressions = [itemIdExpr, ...rootTL.expressions]
    },
  })
}

export function addJoinToUnresolvedMapCalls(templateMethod: t.ClassMethod, _unresolvedMaps: UnresolvedMapInfo[]): void {
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])

  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      if (!path.node.arguments[0] || !t.isArrowFunctionExpression(path.node.arguments[0])) return

      const alreadyHasJoin =
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()

      if (alreadyHasJoin) {
        const joinCall = path.parentPath!.parentPath as NodePath<t.CallExpression>
        const replacement = jsExpr`${t.cloneNode(joinCall.node, true)} + '<!---->'`
        joinCall.replaceWith(replacement)
        joinCall.skip()
        return
      }

      path.replaceWith(jsExpr`${path.node}.join('') + '<!---->'`)
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
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])

  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      if (!path.node.arguments[0]) return

      const obj = path.node.callee.object
      let matches = false
      if (t.isMemberExpression(obj) && t.isIdentifier(obj.property) && obj.property.name === arrayLastSegment) {
        matches = true
      }
      if (!matches) return

      const arrowFn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(arrowFn)) return

      const hasTemplateLiteralBody =
        t.isTemplateLiteral(arrowFn.body) ||
        (t.isBlockStatement(arrowFn.body) &&
          arrowFn.body.body.length === 1 &&
          t.isReturnStatement(arrowFn.body.body[0]) &&
          arrowFn.body.body[0].argument &&
          t.isTemplateLiteral(arrowFn.body.body[0].argument))
      if (!hasTemplateLiteralBody) return

      let paramName: string
      if (t.isIdentifier(arrowFn.params[0])) {
        paramName = arrowFn.params[0].name
      } else {
        paramName = '__item'
        arrowFn.params[0] = t.identifier(paramName)
      }
      const indexParamName = t.isIdentifier(arrowFn.params[1]) ? arrowFn.params[1].name : undefined

      arrowFn.body = indexParamName
        ? jsExpr`this.${id(renderMethodName)}(${id(paramName)}, ${id(indexParamName)})`
        : jsExpr`this.${id(renderMethodName)}(${id(paramName)})`

      const newMapWithJoin = jsExpr`${path.node}.join('')`
      const alreadyHasJoin =
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()
      if (alreadyHasJoin) {
        path.parentPath.parentPath?.replaceWith(newMapWithJoin)
      } else {
        path.replaceWith(newMapWithJoin)
      }
      path.stop()
    },
  })
}

export function stripHtmlArrayMapJoinChainsInAst(
  rootStmt: t.Statement,
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  const tempProg = t.program([rootStmt])
  let replaced = false
  traverse(tempProg, {
    noScope: true,
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return
      if (!t.isIdentifier(path.node.callee.property) || path.node.callee.property.name !== 'map') return
      const obj = path.node.callee.object
      if (!matchesArrayMapReference(obj as t.Expression, arrayMap)) return
      const arrowFn = path.node.arguments[0]
      if (!t.isArrowFunctionExpression(arrowFn) && !t.isFunctionExpression(arrowFn)) return

      let toReplace: NodePath<t.Node> = path
      if (
        path.parentPath?.isMemberExpression() &&
        t.isIdentifier(path.parentPath.node.property) &&
        path.parentPath.node.property.name === 'join' &&
        path.parentPath.parentPath?.isCallExpression()
      ) {
        toReplace = path.parentPath.parentPath as NodePath<t.CallExpression>
      }
      toReplace.replaceWith(t.stringLiteral(''))
      replaced = true
    },
  })
  return replaced
}

export function stripHtmlArrayMapJoinInTemplateMethod(
  templateMethod: t.ClassMethod,
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
): boolean {
  if (!t.isBlockStatement(templateMethod.body)) return false
  const tempProg = t.program([
    t.expressionStatement(t.arrowFunctionExpression(templateMethod.params as t.Identifier[], templateMethod.body)),
  ])
  return stripHtmlArrayMapJoinChainsInAst(tempProg.body[0]!, arrayMap)
}

export function replaceMapInConditionalSlots(
  slots: ConditionalSlot[],
  arrayMap: Pick<ArrayMapBinding, 'arrayPathParts' | 'storeVar'>,
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

/** Collect template prop names referenced in an array item template (for __onPropChange handledPropNames). */
export function collectPropNamesFromItemTemplate(
  itemTemplate: t.JSXElement | t.JSXFragment | null | undefined,
  templatePropNames: Set<string>,
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
