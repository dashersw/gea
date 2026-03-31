/**
 * Array item patch and create method generation for the Gea compiler codegen.
 *
 * Generates patchXxxItem and createXxxItem class methods that handle
 * incremental DOM updates for array-mapped list items. Also provides
 * the collectPatchEntries walker and templateRequiresRerender detector.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { appendToBody, id, js, jsAll, jsExpr, jsMethod } from 'eszter'
import type { ArrayMapBinding } from '../ir/types.ts'
import {
  buildOptionalMemberChain,
  camelToKebab,
  getJSXTagName,
  isComponentTag,
  loggingCatchClause,
  normalizePathParts,
  optionalizeMemberChainsAfterComputedItemKey,
  pathPartsToString,
  replacePropRefsInExpression,
} from './ast-helpers.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import { EVENT_NAMES } from './event-helpers.ts'
import { emitPatch } from '../emit/registry.ts'

// ─── Patch entry types ─────────────────────────────────────────────

interface PatchEntry {
  childPath: number[]
  type: 'text' | 'className' | 'attribute'
  expression: t.Expression
  attributeName?: string
}

interface PatchPlan {
  entries: PatchEntry[]
  requiresRerender: boolean
}

// ─── Shared helpers ───────────────────────────────────────────────

function thisPrivate(name: string): t.MemberExpression {
  return t.memberExpression(t.thisExpression(), t.privateName(id(name)))
}

/** Collect declared variable names from template setup statements. */
function collectSetupVarNames(statements: t.Statement[]): Set<string> {
  const names = new Set<string>()
  for (const stmt of statements) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const decl of stmt.declarations) {
      if (t.isIdentifier(decl.id)) names.add(decl.id.name)
      else if (t.isObjectPattern(decl.id)) {
        for (const prop of decl.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) names.add(prop.value.name)
          else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) names.add(prop.argument.name)
        }
      }
    }
  }
  return names
}

/** Collect free variable names referenced in a list of expressions. */
function collectFreeVars(expressions: t.Expression[]): Set<string> {
  const freeVars = new Set<string>()
  for (const expr of expressions) {
    traverse(t.expressionStatement(t.cloneNode(expr, true)), {
      noScope: true,
      Identifier(p: NodePath<t.Identifier>) {
        if (t.isMemberExpression(p.parent) && p.parent.property === p.node && !p.parent.computed) return
        freeVars.add(p.node.name)
      },
    })
  }
  return freeVars
}

/** Check if any setup variable is referenced by patch entries; if so, rerender is required. */
function setupForcesRerender(
  setupCtx: { statements: t.Statement[] } | undefined,
  entries: PatchEntry[],
): boolean {
  if (!setupCtx || setupCtx.statements.length === 0) return false
  const setupVars = collectSetupVarNames(setupCtx.statements)
  if (setupVars.size === 0) return false
  const freeVars = collectFreeVars(entries.map((e) => e.expression))
  for (const name of setupVars) {
    if (freeVars.has(name)) return true
  }
  return false
}

// ─── Shared ref-cache + emit loop ─────────────────────────────────

function buildRefCacheAndApply(entries: PatchEntry[], elVar: t.Identifier, lazyCache: boolean): t.Statement[] {
  const stmts: t.Statement[] = []
  const refMap = new Map<string, t.Expression>()
  for (const entry of entries) {
    if (entry.childPath.length === 0) continue
    const key = entry.childPath.join('_')
    if (refMap.has(key)) continue
    const refName = childPathRefName(entry.childPath)
    const navExpr = buildElementNavExpr(elVar, entry.childPath)
    if (lazyCache) {
      const refExpr = jsExpr`${elVar}.${id(refName)}`
      stmts.push(js`if (!${refExpr}) ${elVar}.${id(refName)} = ${navExpr};`)
      refMap.set(key, refExpr)
    } else {
      stmts.push(js`${elVar}.${id(refName)} = ${navExpr};`)
      refMap.set(key, jsExpr`${elVar}.${id(refName)}`)
    }
  }
  for (const entry of entries) {
    const navExpr = entry.childPath.length > 0
      ? refMap.get(entry.childPath.join('_')) || buildElementNavExpr(elVar, entry.childPath)
      : elVar
    const emitType = entry.type === 'className' ? 'class' : entry.type
    stmts.push(...emitPatch(emitType, navExpr, entry.expression, { attributeName: entry.attributeName }))
  }
  return stmts
}

// ─── Array map naming helpers ──────────────────────────────────────

function getCapName(arrayMap: ArrayMapBinding): string {
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))
  const arrayName = arrayPath.replace(/\./g, '')
  return arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
}

function isComponentRootTemplate(arrayMap: ArrayMapBinding): boolean {
  return t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))
}

function applyPropRefs(entries: PatchEntry[], templatePropNames?: Set<string>, wholeParamName?: string): PatchEntry[] {
  const propNames = templatePropNames ?? new Set<string>()
  if (propNames.size === 0 && !wholeParamName) return entries
  return entries.map((e) => ({
    ...e,
    expression: replacePropRefsInExpression(t.cloneNode(e.expression, true) as t.Expression, propNames, wholeParamName),
  }))
}

function buildItemIdExpr(itemIdProperty: string | undefined): t.Expression {
  const rawExpr = itemIdProperty && itemIdProperty !== ITEM_IS_KEY
    ? t.logicalExpression('??', buildOptionalMemberChain(id('item'), itemIdProperty), id('item'))
    : id('item')
  return jsExpr`String(${rawExpr})`
}

/** Build `this.renderXxxItem(args)` call expression. For create's dummy call, pass dummyItem/dummyIdx. */
function buildRenderCall(renderMethodName: string, indexVariable?: string, itemArg?: t.Expression, idxArg?: t.Expression): t.Expression {
  const args: t.Expression[] = [itemArg ?? id('item')]
  if (indexVariable) args.push(idxArg ?? id('__idx'))
  const call = jsExpr`this.${id(renderMethodName)}()`
  ;(call as t.CallExpression).arguments = args
  return call
}

/** Collect component __geaProps properties from a JSX element template. */
function collectComponentProps(arrayMap: ArrayMapBinding, propNames: Set<string>, wholeParamName?: string): t.ObjectProperty[] {
  const propsProperties: t.ObjectProperty[] = []
  const cloned = t.cloneNode(arrayMap.itemTemplate!, true) as t.JSXElement
  for (const attr of cloned.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    const name = attr.name.name
    if (name === 'key' || EVENT_NAMES.has(name)) continue
    if (!t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue
    const exprClone = t.cloneNode(attr.value.expression as t.Expression, true)
    const tempProg = t.file(t.program([t.expressionStatement(exprClone)]))
    traverse(tempProg, {
      Identifier(path: NodePath<t.Identifier>) {
        if (path.node.name === arrayMap.itemVariable) path.node.name = 'item'
        else if (arrayMap.indexVariable && path.node.name === arrayMap.indexVariable) path.node.name = '__idx'
      },
    })
    let rewrittenExpr = (tempProg.program.body[0] as t.ExpressionStatement).expression
    if (propNames.size > 0 || wholeParamName) {
      rewrittenExpr = replacePropRefsInExpression(t.cloneNode(rewrittenExpr, true) as t.Expression, propNames, wholeParamName)
    }
    propsProperties.push(t.objectProperty(id(name), rewrittenExpr))
  }
  return propsProperties
}

// ─── Dummy prop tree ───────────────────────────────────────────────

interface DummyPropTree {
  [key: string]: DummyPropTree | true
}

function walkDummyTree(tree: DummyPropTree, parts: string[], write: boolean): void {
  let cursor = tree
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]
    if (i === parts.length - 1) {
      if (write && !(key in cursor)) cursor[key] = true
      return
    }
    if (!(key in cursor) || cursor[key] === true) cursor[key] = {}
    cursor = cursor[key] as DummyPropTree
  }
}

function ensureDummyTreePath(tree: DummyPropTree, path: string): void {
  const parts = normalizePathParts(path)
  if (parts.length > 0) walkDummyTree(tree, parts, true)
}

function collectItemTemplatePropTree(template: t.JSXElement | t.JSXFragment, itemVar: string): DummyPropTree {
  const tree: DummyPropTree = {}
  const program = t.program([t.expressionStatement(t.cloneNode(template, true))])
  traverse(program, {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      const chain: string[] = []
      let node: t.Expression = path.node
      while (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
        chain.unshift(node.property.name)
        node = node.object
      }
      if (!t.isIdentifier(node, { name: itemVar }) || chain.length === 0) return
      walkDummyTree(tree, chain, true)
    },
  })
  return tree
}

function buildDummyFromTree(tree: DummyPropTree, keyPathParts: string[] | null): t.ObjectExpression {
  const props: t.ObjectProperty[] = []
  for (const [key, value] of Object.entries(tree)) {
    const matchesKey = keyPathParts && keyPathParts.length > 0 && keyPathParts[0] === key
    const val = matchesKey && keyPathParts!.length === 1
      ? t.numericLiteral(0)
      : matchesKey
        ? buildDummyFromTree(value === true ? {} : value, keyPathParts!.slice(1))
        : value === true
          ? t.stringLiteral(' ')
          : buildDummyFromTree(value, null)
    props.push(t.objectProperty(id(key), val))
  }
  return t.objectExpression(props)
}

// ─── Patch item method ─────────────────────────────────────────────

export function generatePatchItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): { method: t.ClassMethod | null; privateFields: string[] } {
  if (!arrayMap.itemTemplate) return { method: null, privateFields: [] }
  const methodName = `patch${getCapName(arrayMap)}Item`

  if (isComponentRootTemplate(arrayMap)) return { method: null, privateFields: [] }

  let { entries, requiresRerender } = collectPatchEntries(arrayMap)
  if (arrayMap.callbackBodyStatements?.length) requiresRerender = true
  if (!requiresRerender) requiresRerender = setupForcesRerender(templateSetupContext, entries)
  if (requiresRerender || entries.length === 0) return { method: null, privateFields: [] }

  entries = applyPropRefs(entries, templatePropNames, wholeParamName)
  const { hoists, patchedEntries } = hoistStoreReads(entries, arrayMap.storeVar)
  const elVar = id('row')
  const body: t.Statement[] = [js`if (!${elVar}) return;`]

  for (const hoist of hoists) body.push(js`var ${id(hoist.varName)} = ${hoist.expression};`)
  body.push(...buildRefCacheAndApply(patchedEntries, elVar, true))

  const itemIdExpr = buildItemIdExpr(arrayMap.itemIdProperty)
  body.push(js`${elVar}.__geaKey = ${itemIdExpr};`)

  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const privateElsRef = thisPrivate(rowElsProp)
  body.push(
    js`(${t.cloneNode(privateElsRef, true)} || (${t.cloneNode(privateElsRef, true)} = {}))[${t.cloneNode(itemIdExpr, true)}] = ${elVar};`,
  )
  body.push(js`${elVar}.__geaItem = item;`)

  const params: t.Identifier[] = [id('row'), id('item'), id('__prevItem')]
  if (arrayMap.indexVariable) params.push(id('__idx'))
  return {
    method: t.classMethod('method', id(methodName), params, t.blockStatement(body)),
    privateFields: [rowElsProp],
  }
}

// ─── Collect patch entries ─────────────────────────────────────────

export function collectPatchEntries(arrayMap: ArrayMapBinding): PatchPlan {
  const cloned = t.cloneNode(arrayMap.itemTemplate!, true) as t.JSXElement | t.JSXFragment
  const tempFile = t.file(t.program([t.expressionStatement(cloned)]))

  traverse(tempFile, {
    Identifier(path: NodePath<t.Identifier>) {
      if (path.node.name === arrayMap.itemVariable) path.node.name = 'item'
      else if (arrayMap.indexVariable && path.node.name === arrayMap.indexVariable) path.node.name = '__idx'
    },
  })

  const modified = (tempFile.program.body[0] as t.ExpressionStatement).expression
  const entries: PatchEntry[] = []
  const requiresRerender = templateRequiresRerender(tempFile)
  if (t.isJSXElement(modified)) {
    const rootTagName = getJSXTagName(modified.openingElement.name)
    const rootIsComponent = isComponentTag(rootTagName)
    walkJSXForPatch(modified, [], entries, rootIsComponent)
  }
  for (const ent of entries) {
    ent.expression = optionalizeMemberChainsAfterComputedItemKey(ent.expression, 'item')
  }
  return { entries, requiresRerender }
}

// ─── Walk JSX tree for patch entries ───────────────────────────────

function walkJSXForPatch(node: t.JSXElement, path: number[], entries: PatchEntry[], rootIsComponent = false): void {
  const isRootLevel = path.length === 0 && rootIsComponent

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    const name = attr.name.name

    if (name === 'key' || EVENT_NAMES.has(name)) continue

    if (!t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue

    if (name === 'class' || name === 'className') {
      entries.push({
        childPath: [...path],
        type: 'className',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
      })
    } else if (name !== 'checked') {
      entries.push({
        childPath: [...path],
        type: 'attribute',
        expression: t.cloneNode(attr.value.expression as t.Expression, true),
        attributeName: isRootLevel ? `data-prop-${camelToKebab(name)}` : name,
      })
    }
  }

  let hasElementChild = false
  const textParts: Array<{ raw: string } | { expr: t.Expression }> = []

  for (const child of node.children) {
    if (t.isJSXElement(child) || t.isJSXFragment(child)) hasElementChild = true
    else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression))
      textParts.push({ expr: child.expression as t.Expression })
    else if (t.isJSXText(child)) {
      const last = textParts[textParts.length - 1]
      if (last && 'raw' in last) last.raw += child.value
      else textParts.push({ raw: child.value })
    }
  }

  if (!hasElementChild && textParts.length > 0) {
    const hasExpr = textParts.some((p) => 'expr' in p)
    if (hasExpr) {
      const quasis: t.TemplateElement[] = []
      const expressions: t.Expression[] = []
      let currentRaw = ''
      for (const part of textParts) {
        if ('raw' in part) {
          currentRaw += part.raw
        } else {
          quasis.push(t.templateElement({ raw: currentRaw, cooked: currentRaw }, false))
          currentRaw = ''
          expressions.push(t.cloneNode(part.expr, true) as t.Expression)
        }
      }
      quasis.push(t.templateElement({ raw: currentRaw, cooked: currentRaw }, true))
      const templateExpr =
        expressions.length > 0 ? t.templateLiteral(quasis, expressions) : t.stringLiteral(quasis[0]?.value?.raw ?? '')
      entries.push({
        childPath: [...path],
        type: 'text',
        expression: templateExpr,
      })
    }
    return
  }

  let elementIndex = 0
  for (const child of node.children) {
    if (t.isJSXElement(child)) {
      walkJSXForPatch(child, [...path, elementIndex], entries)
      elementIndex++
    }
  }
}

/** Build DOM navigation via firstElementChild/nextElementSibling for a child path. */
export function buildElementNavExpr(base: t.Expression, childPath: number[]): t.Expression {
  let expr = base
  for (const idx of childPath) {
    expr = jsExpr`${expr}.firstElementChild`
    for (let i = 0; i < idx; i++) {
      expr = jsExpr`${expr}.nextElementSibling`
    }
  }
  return expr
}

export function childPathRefName(path: number[]): string {
  return `__ref_${path.join('_')}`
}

interface HoistedVar { varName: string; expression: t.Expression }

/** Hoist store property reads out of per-item patch expressions. */
function hoistStoreReads(
  entries: PatchEntry[],
  storeVar: string | undefined,
): { hoists: HoistedVar[]; patchedEntries: PatchEntry[] } {
  if (!storeVar) return { hoists: [], patchedEntries: entries }

  const hoistMap = new Map<string, HoistedVar>()
  let counter = 0

  function replaceStoreReads(expr: t.Expression): t.Expression {
    const cloned = t.cloneNode(expr, true) as t.Expression
    const program = t.program([t.expressionStatement(cloned)])
    traverse(program, {
      noScope: true,
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (!t.isIdentifier(path.node.object, { name: storeVar })) return
        if (!t.isIdentifier(path.node.property)) return
        if (path.node.computed) return
        const key = `${storeVar}.${path.node.property.name}`
        let hoist = hoistMap.get(key)
        if (!hoist) {
          hoist = { varName: `__h${counter++}`, expression: t.cloneNode(path.node, true) }
          hoistMap.set(key, hoist)
        }
        path.replaceWith(t.identifier(hoist.varName))
      },
    })
    return (program.body[0] as t.ExpressionStatement).expression
  }

  const patchedEntries = entries.map((entry) => ({
    ...entry,
    expression: replaceStoreReads(entry.expression),
  }))

  return { hoists: Array.from(hoistMap.values()), patchedEntries }
}

// ─── Create item method ────────────────────────────────────────────

export function generateCreateItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): { method: t.ClassMethod | null; needsRawStoreCache: boolean; privateFields: string[] } {
  if (!arrayMap.itemTemplate) return { method: null, needsRawStoreCache: false, privateFields: [] }
  const capName = getCapName(arrayMap)
  const methodName = `create${capName}Item`
  const renderMethodName = `render${capName}Item`
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))
  const containerProp = `__${arrayPath.replace(/\./g, '_')}_container`
  const itemIdProperty = arrayMap.itemIdProperty
  const itemTemplateRootIsComponent = isComponentRootTemplate(arrayMap)
  const propNames = templatePropNames ?? new Set<string>()

  let { entries, requiresRerender } = collectPatchEntries(arrayMap)
  if (arrayMap.callbackBodyStatements?.length) requiresRerender = true
  if (!requiresRerender) requiresRerender = setupForcesRerender(templateSetupContext, entries)

  entries = applyPropRefs(entries, templatePropNames, wholeParamName)

  if (requiresRerender) {
    const createMethod = jsMethod`${id(methodName)}(item) {}`
    if (arrayMap.indexVariable) createMethod.params.push(id('__idx'))
    const renderCall = buildRenderCall(renderMethodName, arrayMap.indexVariable)
    const rerenderBody: t.Statement[] = [
      js`var __tw = document.createElement('template');`,
      js`__tw.innerHTML = ${renderCall};`,
      js`var el = __tw.content.firstElementChild;`,
    ]

    if (itemTemplateRootIsComponent && t.isJSXElement(arrayMap.itemTemplate)) {
      const propsProperties = collectComponentProps(arrayMap, propNames, wholeParamName)
      if (propsProperties.length > 0) {
        if (templateSetupContext && templateSetupContext.statements.length > 0) {
          const setupVars = collectSetupVarNames(templateSetupContext.statements)
          const propsFreeVars = collectFreeVars(propsProperties.map((p) => p.value as t.Expression))
          let needsSetup = false
          for (const name of setupVars) { if (propsFreeVars.has(name)) { needsSetup = true; break } }
          if (needsSetup) {
            for (const stmt of templateSetupContext.statements) {
              let clonedStmt = t.cloneNode(stmt, true) as t.Statement
              if (propNames.size > 0 || wholeParamName) {
                clonedStmt = replacePropRefsInExpression(clonedStmt as any, propNames, wholeParamName) as any as t.Statement
              }
              rerenderBody.push(clonedStmt)
            }
          }
        }
        rerenderBody.push(js`el.__geaProps = ${t.objectExpression(propsProperties)};`)
      }
    }

    rerenderBody.push(js`return el;`)
    return { method: appendToBody(createMethod, ...rerenderBody), needsRawStoreCache: false, privateFields: [] }
  }

  if (entries.length === 0) return { method: null, needsRawStoreCache: false, privateFields: [] }

  const { hoists, patchedEntries } = hoistStoreReads(entries, arrayMap.storeVar)
  const useRawStoreCache = hoists.length > 0 && !!arrayMap.storeVar

  if (useRawStoreCache) {
    for (const hoist of hoists) {
      if (t.isMemberExpression(hoist.expression) && t.isIdentifier(hoist.expression.object) && hoist.expression.object.name === arrayMap.storeVar) {
        hoist.expression.object = id('__rs')
      }
    }
  }

  const propTree = collectItemTemplatePropTree(arrayMap.itemTemplate!, arrayMap.itemVariable)
  const containerRef = jsExpr`this.${id(containerProp)}`
  const privateDcField = thisPrivate('__dc')
  const cVar = id('__c')
  const elVar = id('el')
  const body: t.Statement[] = []

  if (useRawStoreCache) {
    const privateRsField = thisPrivate('__rs')
    body.push(js`var __rs = ${t.cloneNode(privateRsField, true)} || (${t.cloneNode(privateRsField, true)} = ${id(arrayMap.storeVar!)}.__raw);`)
  }

  body.push(js`var ${cVar} = ${t.cloneNode(privateDcField, true)} || (${t.cloneNode(privateDcField, true)} = ${containerRef});`)

  const isPrimitiveKey = !itemIdProperty || itemIdProperty === ITEM_IS_KEY
  const dummyItem: t.Expression = isPrimitiveKey
    ? t.stringLiteral('__dummy__')
    : (() => {
        if (itemIdProperty) ensureDummyTreePath(propTree, itemIdProperty)
        return buildDummyFromTree(propTree, itemIdProperty ? normalizePathParts(itemIdProperty) : null)
      })()

  const hasRootClassNamePatch = patchedEntries.some((e) => e.type === 'className' && e.childPath.length === 0)
  const renderCall = buildRenderCall(renderMethodName, arrayMap.indexVariable, dummyItem, t.numericLiteral(0))

  const tplInit: t.Statement[] = [
    js`var __tw = document.createElement('template');`,
    js`__tw.innerHTML = ${renderCall};`,
    js`${cVar}.__geaTpl = __tw.content.firstElementChild;`,
    t.expressionStatement(
      t.optionalCallExpression(
        t.optionalMemberExpression(jsExpr`${cVar}.__geaTpl`, id('removeAttribute'), false, true),
        [t.stringLiteral('data-gea-item-id')],
        false,
      ),
    ),
  ]

  if (hasRootClassNamePatch) {
    tplInit.push(js`if (${cVar}.__geaTpl && ${cVar}.__geaTpl.className) ${cVar}.__geaTpl.className = '';`)
  }
  body.push(js`if (!${cVar}.__geaTpl) ${t.blockStatement([t.tryStatement(t.blockStatement(tplInit), loggingCatchClause())])}`)

  const tplCloneExpr = jsExpr`${cVar}.__geaTpl.cloneNode(${true})`
  const fallbackRenderCall = buildRenderCall(renderMethodName, arrayMap.indexVariable)
  body.push(
    t.ifStatement(
      jsExpr`${cVar}.__geaTpl`,
      t.blockStatement([js`var ${elVar} = ${tplCloneExpr};`]),
      t.blockStatement([
        ...jsAll`
          var __fw = document.createElement('template');
          __fw.innerHTML = ${fallbackRenderCall};
          var ${elVar} = __fw.content.firstElementChild;
        `,
      ]),
    ),
  )

  for (const hoist of hoists) body.push(js`var ${id(hoist.varName)} = ${hoist.expression};`)
  body.push(...buildRefCacheAndApply(patchedEntries, elVar, false))

  const patchItemIdExpr = buildItemIdExpr(itemIdProperty)
  body.push(js`${elVar}.__geaKey = ${patchItemIdExpr};`)
  body.push(js`${elVar}.__geaItem = item;`)

  if (itemTemplateRootIsComponent && t.isJSXElement(arrayMap.itemTemplate)) {
    const propsProperties = collectComponentProps(arrayMap, propNames, wholeParamName)
    if (propsProperties.length > 0) body.push(js`${elVar}.__geaProps = ${t.objectExpression(propsProperties)};`)
  }

  body.push(js`return ${elVar};`)

  const createParams: t.Identifier[] = [id('item')]
  if (arrayMap.indexVariable) createParams.push(id('__idx'))
  return {
    method: t.classMethod('method', id(methodName), createParams, t.blockStatement(body)),
    needsRawStoreCache: useRawStoreCache,
    privateFields: ['__dc'],
  }
}

// ─── Template requires rerender ────────────────────────────────────

export function templateRequiresRerender(file: t.File): boolean {
  let requiresRerender = false
  traverse(file, {
    noScope: true,
    ConditionalExpression(path: NodePath<t.ConditionalExpression>) {
      if (branchContainsJSX(path.node.consequent) || branchContainsJSX(path.node.alternate)) {
        requiresRerender = true
        path.stop()
      }
    },
    LogicalExpression(path: NodePath<t.LogicalExpression>) {
      if (branchContainsJSX(path.node.left) || branchContainsJSX(path.node.right)) {
        requiresRerender = true
        path.stop()
      }
    },
  })
  return requiresRerender
}

function branchContainsJSX(node: t.Node): boolean {
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c === 'object' && 'type' in c && branchContainsJSX(c)) return true
    } else if (child && typeof child === 'object' && 'type' in child) {
      if (branchContainsJSX(child)) return true
    }
  }
  return false
}
