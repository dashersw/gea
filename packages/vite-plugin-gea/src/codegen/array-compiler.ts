/**
 * array-compiler.ts — Unified array compilation for the Gea compiler.
 *
 * Replaces the former gen-array.ts, gen-array-patch.ts, gen-array-render.ts,
 * and gen-array-slot-sync.ts with a single parameterized compilation flow.
 *
 * Handles 3 strategies:
 *  - 'component'    — component child arrays (__itemProps_Xxx)
 *  - 'html-keyed'   — keyed HTML list rendering (render/create/patch)
 *  - 'html-unkeyed' — unkeyed HTML list rendering (render/create/patch)
 *
 * The compile entry points are:
 *  - generateRenderItemMethod()
 *  - generateCreateItemMethod()
 *  - generatePatchItemMethod()
 *  - generateEnsureArrayConfigsMethod()
 *  - generateArrayHandlers()
 *  - generateArrayRelationalObserver()
 *  - generateArrayConditionalPatchObserver()
 *  - generateArrayConditionalRerenderObserver()
 *  - generateComponentArrayResult()
 *  - buildPopulateItemHandlersMethod()
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { appendToBody, id, js, jsAll, jsBlockBody, jsExpr, jsMethod } from 'eszter'
import type {
  ArrayMapBinding,
  ConditionalMapBinding,
  EventHandler,
  HandlerPropInMap,
  RelationalMapBinding,
  UnresolvedMapInfo,
} from '../ir/types.ts'
import { ITEM_IS_KEY } from '../analyze/helpers.ts'
import { buildComponentPropsExpression, collectTemplateSetupStatements } from '../analyze/binding-resolver.ts'
import type { TemplateSetupContext } from '../analyze/binding-resolver.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'
import {
  buildTrimmedClassValueExpression,
  getJSXTagName,
  isComponentTag,
} from './jsx-utils.ts'
import { camelToKebab } from '../utils/html.ts'
import {
  buildOptionalMemberChain,
  buildMemberChain,
  buildListItemsSymbol,
  buildThisListItems,
  normalizePathParts,
  pathPartsToString,
} from './member-chain.ts'
import {
  pruneUnusedSetupDestructuring,
  replacePropRefsInExpression,
  replacePropRefsInStatements,
} from './prop-ref-utils.ts'
import {
  optionalizeMemberChainsAfterComputedItemKey,
  optionalizeComputedItemKeyInStatements,
} from './optionalize-utils.ts'
import { loggingCatchClause } from './postprocess-helpers.ts'
import { EVENT_NAMES } from './event-helpers.ts'
import { emitPatch } from '../emit/registry.ts'
import { transformJSXToTemplate, transformJSXExpression, transformJSXFragmentToTemplate } from './gen-template.ts'


// ═══════════════════════════════════════════════════════════════════════════
// Shared internal helpers
// ═══════════════════════════════════════════════════════════════════════════

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

function thisProp(name: string): t.MemberExpression { return t.memberExpression(t.thisExpression(), id(name)) }
function thisPrivate(name: string): t.MemberExpression { return t.memberExpression(t.thisExpression(), t.privateName(id(name))) }

function getArrayPathParts(am: ArrayMapBinding): string[] { return am.arrayPathParts || normalizePathParts((am as any).arrayPath || '') }
function getArrayPath(am: ArrayMapBinding): string { return pathPartsToString(getArrayPathParts(am)) }
function getArrayCapName(am: ArrayMapBinding): string { const p = getArrayPath(am); return p.charAt(0).toUpperCase() + p.slice(1).replace(/\./g, '') }
function getArrayConfigPropName(am: ArrayMapBinding): string { return `__${getArrayPath(am).replace(/\./g, '_')}ListConfig` }
function getArrayCreateMethodName(am: ArrayMapBinding): string { return `create${getArrayCapName(am)}Item` }
function getArrayRenderMethodName(am: ArrayMapBinding): string { return `render${getArrayCapName(am)}Item` }
function getArrayPatchMethodName(am: ArrayMapBinding): string { return `patch${getArrayCapName(am)}Item` }

/** Cap name from a simple string prop name (used by gen-array-patch / slot-sync). */
function getCapNameFromBinding(arrayMap: ArrayMapBinding): string {
  const arrayPath = pathPartsToString(arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''))
  const arrayName = arrayPath.replace(/\./g, '')
  return arrayName.charAt(0).toUpperCase() + arrayName.slice(1)
}

function isComponentRootTemplate(arrayMap: ArrayMapBinding): boolean {
  return t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))
}


// ═══════════════════════════════════════════════════════════════════════════
// Patch entry types and walker (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

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

/** Collect patch entries from an array map's item template. */
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

/** Detect whether a template requires full rerender (conditional JSX branches or item method calls). */
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
    CallExpression(path: NodePath<t.CallExpression>) {
      // item.method() calls may return HTML/JSX — force full rerender
      const callee = path.node.callee
      if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.object, { name: 'item' })) {
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


// ═══════════════════════════════════════════════════════════════════════════
// Shared ref-cache + emit loop (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════
// Setup helpers (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

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

function applyPropRefs(entries: PatchEntry[], templatePropNames?: Set<string>, wholeParamName?: string): PatchEntry[] {
  const propNames = templatePropNames ?? new Set<string>()
  if (propNames.size === 0 && !wholeParamName) return entries
  return entries.map((e) => ({
    ...e,
    expression: replacePropRefsInExpression(t.cloneNode(e.expression, true) as t.Expression, propNames, wholeParamName),
  }))
}


// ═══════════════════════════════════════════════════════════════════════════
// Item ID expression helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Rewrite occurrences of variable names in a cloned expression (for key expressions). */
export function rewriteItemVarInExpression(
  expr: t.Expression,
  fromVar: string,
  toVar: string,
  renames?: Map<string, string>,
): t.Expression {
  const renameMap = new Map(renames || [])
  renameMap.set(fromVar, toVar)
  const cloned = t.cloneNode(expr, true)
  traverse(t.program([t.expressionStatement(cloned)]), {
    noScope: true,
    Identifier(path: NodePath<t.Identifier>) {
      const replacement = renameMap.get(path.node.name)
      if (replacement) path.node.name = replacement
    },
  })
  return cloned
}

function buildItemIdExpr(itemIdProperty: string | undefined, keyExpression?: t.Expression, itemVariable?: string, indexVariable?: string): t.Expression {
  if (keyExpression) {
    const keyRenames = indexVariable ? new Map([[indexVariable, '__idx']]) : undefined
    const rawExpr = rewriteItemVarInExpression(keyExpression, itemVariable || 'item', 'item', keyRenames)
    return jsExpr`String(${rawExpr})`
  }
  const rawExpr = itemIdProperty && itemIdProperty !== ITEM_IS_KEY
    ? t.logicalExpression('??', buildOptionalMemberChain(id('item'), itemIdProperty), id('item'))
    : id('item')
  return jsExpr`String(${rawExpr})`
}

/** Build `this.renderXxxItem(args)` call expression. */
function buildRenderCall(renderMethodName: string, indexVariable?: string, itemArg?: t.Expression, idxArg?: t.Expression): t.Expression {
  const args: t.Expression[] = [itemArg ?? id('item')]
  if (indexVariable) args.push(idxArg ?? id('__idx'))
  const call = jsExpr`this.${id(renderMethodName)}()`
  ;(call as t.CallExpression).arguments = args
  return call
}


// ═══════════════════════════════════════════════════════════════════════════
// Store read hoisting (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

interface HoistedVar { varName: string; expression: t.Expression }

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


// ═══════════════════════════════════════════════════════════════════════════
// Dummy prop tree (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

interface DummyPropTree {
  [key: string]: DummyPropTree | true | '__fn__'
}

function walkDummyTree(tree: DummyPropTree, parts: string[], write: boolean, leafValue: true | '__fn__' = true): void {
  let cursor = tree
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]
    if (i === parts.length - 1) {
      if (write && !(key in cursor)) cursor[key] = leafValue
      return
    }
    if (!(key in cursor) || cursor[key] === true || cursor[key] === '__fn__') cursor[key] = {}
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
    CallExpression(path: NodePath<t.CallExpression>) {
      // Detect item.method() calls and mark the leaf as a function
      const callee = path.node.callee
      if (!t.isMemberExpression(callee)) return
      const chain: string[] = []
      let node: t.Expression = callee
      while (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.property)) {
        chain.unshift(node.property.name)
        node = node.object
      }
      if (!t.isIdentifier(node, { name: itemVar }) || chain.length === 0) return
      walkDummyTree(tree, chain, true, '__fn__')
    },
    MemberExpression(path: NodePath<t.MemberExpression>) {
      // Skip if this member expression is the callee of a call expression (handled above)
      if (t.isCallExpression(path.parent) && path.parent.callee === path.node) return
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
        ? buildDummyFromTree(value === true || value === '__fn__' ? {} : value, keyPathParts!.slice(1))
        : value === '__fn__'
          ? t.arrowFunctionExpression([], t.stringLiteral(''))
          : value === true
            ? t.stringLiteral(' ')
            : buildDummyFromTree(value, null)
    props.push(t.objectProperty(id(key), val))
  }
  return t.objectExpression(props)
}


// ═══════════════════════════════════════════════════════════════════════════
// Component props collection (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════
// Prop patcher helpers (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

function getPropPatcherTargetExpr(
  binding: { selector: string; childPath?: number[] },
  rowExpr: t.Expression,
): t.Expression {
  if (binding.childPath?.length) return buildElementNavExpr(rowExpr, binding.childPath)
  if (binding.selector === ':scope') return t.cloneNode(rowExpr, true)
  throw new Error(`getPropPatcherTargetExpr: childPath required when selector is not :scope (got "${binding.selector}").`)
}

function buildPropPatcherFunction(
  binding: { type: string; selector: string; classToggleName?: string; childPath?: number[]; attributeName?: string },
  propName: string,
): t.Expression {
  const row = id('row'), value = id('value')
  const targetExpr = getPropPatcherTargetExpr(binding, row)

  if (binding.type === 'class') {
    return t.arrowFunctionExpression([row, value], t.blockStatement(
      emitPatch('class', row, value, { classToggleName: binding.classToggleName || propName }),
    ))
  }

  const bodyStmts: t.Statement[] = jsBlockBody`const __target = ${targetExpr}; if (!__target) return;`
  bodyStmts.push(...emitPatch(binding.type, id('__target'), value, {
    attributeName: binding.attributeName || (binding.type === 'attribute' ? 'class' : undefined),
    isUrlAttr: binding.attributeName ? URL_ATTRS.has(binding.attributeName) : false,
  }))
  return t.arrowFunctionExpression([row, value], t.blockStatement(bodyStmts))
}

function collectItemExpressionKeys(expr: t.Expression): string[] {
  const keys = new Set<string>()
  traverse(t.program([t.expressionStatement(t.cloneNode(expr, true))]), {
    noScope: true,
    MemberExpression(path: NodePath<t.MemberExpression>) {
      if (t.isIdentifier(path.node.object, { name: 'item' }) && !path.node.computed && t.isIdentifier(path.node.property))
        keys.add(path.node.property.name)
    },
  })
  return Array.from(keys)
}

function buildPatchEntryPropPatcher(entry: {
  childPath: number[]
  type: 'text' | 'className' | 'attribute'
  expression: t.Expression
  attributeName?: string
}): t.Expression {
  const row = id('row')
  const refName = childPathRefName(entry.childPath)
  const isRoot = entry.childPath.length === 0
  const targetExpr = isRoot ? row
    : t.logicalExpression('||',
        jsExpr`${row}.${id(refName)}`,
        t.parenthesizedExpression(t.assignmentExpression('=',
          jsExpr`${t.cloneNode(row, true)}.${id(refName)}`,
          buildElementNavExpr(t.cloneNode(row, true), entry.childPath))))

  const stmts: t.Statement[] = isRoot ? [] : jsAll`const __target = ${targetExpr}; if (!__target) return;`
  const emitType = entry.type === 'className' ? 'class' : entry.type
  stmts.push(...emitPatch(emitType, isRoot ? row : id('__target'), t.cloneNode(entry.expression, true) as t.Expression, { attributeName: entry.attributeName }))
  return t.arrowFunctionExpression([id('row'), id('value'), id('item')], t.blockStatement(stmts))
}

function buildPropPatchersObject(arrayMap: ArrayMapBinding): t.ObjectExpression | null {
  const groups = new Map<string, t.Expression[]>()

  if (arrayMap.itemTemplate) {
    const patchPlan = collectPatchEntries(arrayMap)
    if (!patchPlan.requiresRerender) {
      patchPlan.entries.forEach((entry) => {
        const keys = collectItemExpressionKeys(entry.expression)
        keys.forEach((key) => {
          const existing = groups.get(key) || []
          existing.push(buildPatchEntryPropPatcher(entry))
          groups.set(key, existing)
        })
      })
    }
  }

  arrayMap.itemBindings.forEach((binding) => {
    if (binding.type !== 'checked' && binding.type !== 'value' && binding.type !== 'class') return
    const bindingPathParts = binding.pathParts || normalizePathParts((binding as any).path || '')
    const wildcardIndex = bindingPathParts.indexOf('*')
    if (wildcardIndex === -1) return

    const propParts = bindingPathParts.slice(wildcardIndex + 1)
    if (propParts.length === 0) return

    const key = propParts.join('.')
    const propName = propParts[propParts.length - 1]
    const patcher = buildPropPatcherFunction(binding, propName)
    const existing = groups.get(key) || []
    existing.push(patcher)
    groups.set(key, existing)
  })

  if (groups.size === 0) return null

  return t.objectExpression(
    Array.from(groups.entries()).map(([key, patchers]) =>
      t.objectProperty(t.stringLiteral(key), t.arrayExpression(patchers)),
    ),
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// Comparison operand unwrapping (from gen-array-render.ts)
// ═══════════════════════════════════════════════════════════════════════════

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
  return t.callExpression(id('__v'), [node])
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


// ═══════════════════════════════════════════════════════════════════════════
// Handler registration (from gen-array-render.ts)
// ═══════════════════════════════════════════════════════════════════════════

function buildHandlerArrowFn(handlerExpr: t.ArrowFunctionExpression, propNames: Set<string>, wholeParamName?: string): t.ArrowFunctionExpression {
  const body = t.isBlockStatement(handlerExpr.body) ? handlerExpr.body.body : [t.expressionStatement(handlerExpr.body)]
  const bodyWithProps = replacePropRefsInStatements(body, propNames, wholeParamName)
  return bodyWithProps.length === 1 && t.isExpressionStatement(bodyWithProps[0]) && !t.isBlockStatement(handlerExpr.body)
    ? t.arrowFunctionExpression([id('e')], (bodyWithProps[0] as t.ExpressionStatement).expression)
    : t.arrowFunctionExpression([id('e')], t.blockStatement(bodyWithProps))
}

function buildItemKeyExpr(itemIdProperty: string | undefined, itemVar: string): t.Expression {
  return itemIdProperty && itemIdProperty !== ITEM_IS_KEY
    ? t.logicalExpression('??', buildOptionalMemberChain(id(itemVar), itemIdProperty), id(itemVar))
    : t.callExpression(id('String'), [id(itemVar)])
}

function buildHandlerRegistrationStatements(
  handlerProps: HandlerPropInMap[],
  itemVariable: string,
  propNames: Set<string>,
  wholeParamName?: string,
): t.Statement[] {
  if (handlerProps.length === 0) return []
  const stmts: t.Statement[] = [js`if (!this.__itemHandlers_) { this.__itemHandlers_ = {}; }`]
  for (const hp of handlerProps) {
    const fn = buildHandlerArrowFn(t.cloneNode(hp.handlerExpression, true) as t.ArrowFunctionExpression, propNames, wholeParamName)
    stmts.push(js`this.__itemHandlers_[${buildItemKeyExpr(hp.itemIdProperty, itemVariable)}] = ${fn};`)
  }
  return stmts
}


// ═══════════════════════════════════════════════════════════════════════════
// Lazy init helper (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

function lazyInit(name: string, selector: string, bindingId?: string, userIdExpr?: t.Expression): t.Statement {
  if (userIdExpr) {
    const idArg = t.isStringLiteral(userIdExpr) ? userIdExpr : t.cloneNode(userIdExpr, true)
    return js`
      if (!this.${id(name)}) {
        this.${id(name)} = document.getElementById(${idArg});
      }
    `
  }
  if (bindingId) {
    return js`
      if (!this.${id(name)}) {
        this.${id(name)} = document.getElementById(this.id + '-' + ${bindingId});
      }
    `
  }
  return js`
    if (!this.${id(name)}) {
      this.${id(name)} = this.$(":scope");
    }
  `
}


// ═══════════════════════════════════════════════════════════════════════════
// Relational observer helpers (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

function buildQueryByItemId(
  _containerExpr: t.Expression,
  idExpr: t.Expression,
  containerBindingId: string | undefined,
): t.Expression {
  const bind = containerBindingId ?? 'list'
  return jsExpr`document.getElementById(this.id + ${'-' + bind + '-gk-'} + ${t.cloneNode(idExpr, true)})`
}

function buildPathPartsEquals(expr: t.Expression, parts: string[]): t.Expression {
  let result: t.Expression = jsExpr`${t.cloneNode(expr)} && ${t.cloneNode(expr)}.length === ${parts.length}`
  for (let i = 0; i < parts.length; i++) {
    result = t.logicalExpression('&&', result, jsExpr`${t.cloneNode(expr)}[${i}] === ${parts[i]}`)
  }
  return result
}

function buildConditionalPatchStatement(
  binding: ConditionalMapBinding,
  target: t.Identifier,
  itemVariable: string,
): t.Statement {
  const expression = renameItemVariable(binding.expression, itemVariable)
  if (binding.type === 'text') {
    return js`${jsExpr`${target}.textContent`} = ${expression};`
  }
  if (binding.type === 'className') {
    return js`${jsExpr`${target}.className`} = ${buildTrimmedClassValueExpression(expression)};`
  }
  if (binding.attributeName === 'style') {
    return t.blockStatement(
      jsBlockBody`
      const __attrValue = ${expression};
      if (__attrValue == null || __attrValue === false) {
        ${jsExpr`${target}.removeAttribute('style')`};
      } else if (typeof __attrValue === 'object') {
        ${jsExpr`${target}.style.cssText`} = Object.entries(__attrValue).map(([k, v]) => k.replace(/[A-Z]/g, '-$&') + ': ' + v).join('; ');
      } else {
        ${jsExpr`${target}.style.cssText`} = String(__attrValue);
      }
    `,
    )
  }
  return t.blockStatement(
    jsBlockBody`
    const __attrValue = ${expression};
    if (__attrValue == null || __attrValue === false) {
      ${jsExpr`${target}.removeAttribute(${binding.attributeName || 'class'})`};
    } else {
      const __newAttr = String(__attrValue);
      if (${jsExpr`${target}.getAttribute(${binding.attributeName || 'class'})`} !== __newAttr) {
        ${jsExpr`${target}.setAttribute(${binding.attributeName || 'class'}, __newAttr)`};
      }
    }
  `,
  )
}

function renameItemVariable(expr: t.Expression, itemVariable: string): t.Expression {
  const cloned = t.cloneNode(expr, true) as t.Expression
  const program = t.program([t.expressionStatement(cloned)])
  traverse(program, { noScope: true, Identifier(path: NodePath<t.Identifier>) { if (path.node.name === itemVariable) path.node.name = 'item' } })
  return (program.body[0] as t.ExpressionStatement).expression
}

function buildRelationalClassStatements(
  rowExpr: t.Expression,
  bindings: RelationalMapBinding[],
  isMatch: boolean,
  phase: string,
): t.Statement[] {
  return bindings.flatMap((binding, index) => {
    const enabled = binding.classWhenMatch ? isMatch : !isMatch
    if (binding.selector === ':scope') {
      const expr = t.cloneNode(rowExpr, true)
      if (binding.scopeClassIsPure) {
        return jsBlockBody`
          ${expr}.className = ${enabled ? binding.classToggleName : ''};
        `
      }
      const cnVar = `__cn_${phase}_${index}`
      return jsBlockBody`
        var ${id(cnVar)} = ${expr}.className;
        if (${id(cnVar)} === '' || ${id(cnVar)} === ${binding.classToggleName}) {
          ${expr}.className = ${enabled ? binding.classToggleName : ''};
        } else {
          ${expr}.classList.toggle(${binding.classToggleName}, ${enabled});
        }
      `
    }
    const targetVar = `__target_${phase}_${index}`
    const targetExpr = t.cloneNode(rowExpr, true)
    return jsBlockBody`
      var ${id(targetVar)} = ${targetExpr};
      if (${id(targetVar)}) {
        ${jsExpr`${id(targetVar)}.classList.toggle(${binding.classToggleName}, ${enabled})`};
      }
    `
  })
}

function buildElsLookup(
  elsRef: t.MemberExpression,
  containerRef: t.MemberExpression,
  idExpr: t.Expression,
  rowVar: string,
  containerBindingId?: string,
): t.Statement[] {
  const elsFallback = buildQueryByItemId(t.cloneNode(containerRef), t.cloneNode(idExpr, true), containerBindingId)
  const ctr = id('__ctr')
  const ch = id('__ch')
  const i = id('__i')
  const qsFallback = t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement([
      js`const ${ctr} = ${t.cloneNode(containerRef)};`,
      t.forStatement(
        js`let ${i} = 0;` as unknown as t.VariableDeclaration,
        jsExpr`${i} < ${t.cloneNode(ctr, true)}.children.length`,
        t.updateExpression('++', t.cloneNode(i, true)),
        t.blockStatement([
          js`const ${ch} = ${t.cloneNode(ctr, true)}.children[${t.cloneNode(i, true)}];`,
          t.ifStatement(
            t.logicalExpression('||',
              jsExpr`${ch}[${id('GEA_DOM_KEY')}] == ${t.cloneNode(idExpr, true)}`,
              t.logicalExpression('&&',
                jsExpr`${ch}[${id('GEA_DOM_KEY')}] == null`,
                t.binaryExpression('==',
                  t.optionalCallExpression(
                    t.optionalMemberExpression(t.cloneNode(ch, true), id('getAttribute'), false, true),
                    [t.stringLiteral('data-gea-item-id')], false),
                  t.cloneNode(idExpr, true)),
              ),
            ),
            t.returnStatement(t.cloneNode(ch, true)),
          ),
        ]),
      ),
      t.returnStatement(t.nullLiteral()),
    ])),
    [],
  )
  const cached = id('__cached')
  return [
    js`var ${cached} = ${t.cloneNode(elsRef)} && ${t.cloneNode(elsRef)}[${t.cloneNode(idExpr, true)}];`,
    t.variableDeclaration('var', [t.variableDeclarator(
      id(rowVar),
      t.logicalExpression('||',
        t.logicalExpression('||',
          t.logicalExpression('&&',
            jsExpr`${t.cloneNode(cached, true)} && ${t.cloneNode(cached, true)}.isConnected`,
            t.cloneNode(cached, true)),
          elsFallback),
        qsFallback),
    )]),
  ]
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Ensure array configs method (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generateEnsureArrayConfigsMethod(arrayMaps: ArrayMapBinding[]): t.ClassMethod | null {
  if (arrayMaps.length === 0) return null

  const prop = (key: string, val: t.Expression) => t.objectProperty(id(key), val)

  const body = arrayMaps.map((arrayMap) => {
    const configProp = jsExpr`this.${id(getArrayConfigPropName(arrayMap))}`
    const renderMethodName = getArrayRenderMethodName(arrayMap)
    const createMethodName = getArrayCreateMethodName(arrayMap)
    const patchMethodName = getArrayPatchMethodName(arrayMap)
    const propPatchers = buildPropPatchersObject(arrayMap)
    const properties: t.ObjectProperty[] = [
      prop('arrayPathParts', t.arrayExpression(getArrayPathParts(arrayMap).map((p) => t.stringLiteral(p)))),
      prop('render', jsExpr`this.${id(renderMethodName)}.bind(this)`),
      prop('create', jsExpr`this.${id(createMethodName)}.bind(this)`),
      prop('patchRow', jsExpr`this.${id(patchMethodName)} && this.${id(patchMethodName)}.bind(this)`),
    ]

    if (arrayMap.itemIdProperty === ITEM_IS_KEY) {
      properties.push(prop('getKey', jsExpr`(item) => String(item)`))
    } else if (arrayMap.itemIdProperty) {
      properties.push(prop('getKey', t.arrowFunctionExpression(
        [id('item')],
        jsExpr`String(${buildOptionalMemberChain(id('item'), arrayMap.itemIdProperty)} ?? item)`,
      )))
    }

    if (propPatchers) properties.push(prop('propPatchers', propPatchers))

    const rootIsComponent =
      t.isJSXElement(arrayMap.itemTemplate) && isComponentTag(getJSXTagName(arrayMap.itemTemplate.openingElement.name))
    if (rootIsComponent) properties.push(prop('hasComponentItems', t.booleanLiteral(true)))

    return js`if (!${configProp}) {
      ${configProp} = ${t.objectExpression(properties)};
    }`
  })

  return appendToBody(jsMethod`[${id('GEA_ENSURE_ARRAY_CONFIGS')}]() {}`, ...body)
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Array relational observer (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generateArrayRelationalObserver(
  path: string[],
  arrayMap: ArrayMapBinding,
  bindings: RelationalMapBinding[],
  methodName: string,
): { method: t.ClassMethod; privateFields: string[] } {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = thisProp(containerName)
  const previousValue = id('__previousValue')
  const previousRowName = `__prev_${pathPartsToString(path).replace(/\./g, '_')}_row`
  const previousRowProp = thisPrivate(previousRowName)

  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const elsRef = thisPrivate(rowElsProp)

  const body: t.Statement[] = [
    lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
    js`var ${previousValue} = change[0] ? change[0].previousValue : null;`,
    js`var __previousRow = ${previousRowProp};`,
    t.ifStatement(
      jsExpr`${previousValue} != null`,
      t.blockStatement([
        t.ifStatement(
          jsExpr`!__previousRow || !__previousRow.isConnected`,
          t.blockStatement(buildElsLookup(elsRef, containerRef, previousValue, '__previousRow', arrayMap.containerBindingId)),
        ),
        t.ifStatement(id('__previousRow'), t.blockStatement(buildRelationalClassStatements(id('__previousRow'), bindings, false, 'old'))),
      ]),
    ),
    js`var __nextRow = null;`,
    t.ifStatement(
      jsExpr`value != null`,
      t.blockStatement([
        ...buildElsLookup(elsRef, containerRef, id('value'), '__nextRow', arrayMap.containerBindingId),
        t.ifStatement(id('__nextRow'), t.blockStatement(buildRelationalClassStatements(id('__nextRow'), bindings, true, 'new'))),
      ]),
    ),
    js`${previousRowProp} = __nextRow || null;`,
  ]

  return {
    method: appendToBody(jsMethod`${id(methodName)}(value, change) {}`, ...body),
    privateFields: [previousRowName, rowElsProp],
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Array conditional patch observer (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generateArrayConditionalPatchObserver(
  arrayMap: ArrayMapBinding,
  bindings: ConditionalMapBinding[],
  methodName: string,
): t.ClassMethod {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = thisProp(containerName)
  const proxiedArr = arrayMap.isImportedState
    ? buildMemberChain(
        jsExpr`${id(arrayMap.storeVar || 'store')}[${id('GEA_STORE_ROOT')}]`,
        arrayPath,
      )
    : buildMemberChain(t.thisExpression(), arrayPath)

  const rawArrExpr = jsExpr`${t.cloneNode(proxiedArr, true)}.__getTarget || ${t.cloneNode(proxiedArr, true)}`

  const loopBody: t.Statement[] = [
    ...jsAll`
      const item = __arr[__i];
      const row = ${containerRef}.children[__i];
    `,
    js`if (!row) continue;`,
  ]

  bindings.forEach((binding, index) => {
    const targetId = `__target_${index}`
    const targetExpr = binding.childPath.length
      ? buildElementNavExpr(t.identifier('row'), binding.childPath)
      : t.identifier('row')
    loopBody.push(
      ...jsAll`const ${id(targetId)} = ${targetExpr}; if (!${id(targetId)}) continue;`,
      buildConditionalPatchStatement(binding, t.identifier(targetId), arrayMap.itemVariable),
    )
  })

  return appendToBody(
    jsMethod`${id(methodName)}(value, change) {}`,
    t.blockStatement([
      lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
      js`if (!${containerRef}) return;`,
      ...jsAll`const __arr = Array.isArray(${rawArrExpr}) ? ${rawArrExpr} : [];`,
      t.forStatement(
        js`let __i = 0;` as unknown as t.VariableDeclaration,
        jsExpr`__i < __arr.length`,
        t.updateExpression('++', id('__i')),
        t.blockStatement(loopBody),
      ),
    ]),
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Array conditional rerender observer (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generateArrayConditionalRerenderObserver(arrayMap: ArrayMapBinding, methodName: string): t.ClassMethod {
  const arrayPath = pathPartsToString(getArrayPathParts(arrayMap))
  const arrayPathParts = getArrayPathParts(arrayMap)
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = thisProp(containerName)
  const configRef = thisProp(getArrayConfigPropName(arrayMap))
  const proxiedArr = arrayMap.isImportedState
    ? buildMemberChain(
        jsExpr`${id(arrayMap.storeVar || 'store')}[${id('GEA_STORE_ROOT')}]`,
        arrayPath,
      )
    : buildMemberChain(t.thisExpression(), arrayPath)

  const rawArrExpr = jsExpr`${t.cloneNode(proxiedArr, true)}.__getTarget || ${t.cloneNode(proxiedArr, true)}`

  return appendToBody(
    jsMethod`${id(methodName)}(value, change) {}`,
    t.blockStatement([
      lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
      js`if (!${containerRef}) return;`,
      ...jsAll`const __c0 = change[0];`,
      (() => {
        const skipTypes: t.Expression[] = [
          jsExpr`__c0.type === 'append'`,
          jsExpr`__c0.type === 'add'`,
          jsExpr`__c0.type === 'delete'`,
          jsExpr`__c0.type === 'reorder'`,
          jsExpr`__c0.arrayOp === 'swap'`,
          t.logicalExpression('&&', jsExpr`__c0.type === 'update'`, buildPathPartsEquals(jsExpr`__c0.pathParts`, arrayPathParts)),
        ]
        const orChain = skipTypes.reduce<t.Expression>((a, b) => t.logicalExpression('||', a, b))
        return t.variableDeclaration('const', [
          t.variableDeclarator(id('__skipArrayConditionalRerender'), t.logicalExpression('&&', id('__c0'), orChain)),
        ])
      })(),
      t.ifStatement(
        jsExpr`!__skipArrayConditionalRerender`,
        t.blockStatement([
          js`this[${id('GEA_ENSURE_ARRAY_CONFIGS')}]();`,
          ...jsAll`const __arr = Array.isArray(${rawArrExpr}) ? ${rawArrExpr} : [];`,
          js`this[${id('GEA_APPLY_LIST_CHANGES')}](${containerRef}, __arr, null, ${configRef});`,
        ]),
      ),
    ]),
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Array handlers (from gen-array.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generateArrayHandlers(
  arrayMap: ArrayMapBinding,
  methodName: string,
): { methods: t.ClassMethod[]; privateFields: string[] } {
  const arrayPathPartsValue = getArrayPathParts(arrayMap)
  const arrayPath = pathPartsToString(arrayPathPartsValue)
  const paramName = arrayPathPartsValue[arrayPathPartsValue.length - 1] || 'items'
  const containerName = `__${arrayPath.replace(/\./g, '_')}_container`
  const containerRef = thisProp(containerName)
  const configRef = thisProp(getArrayConfigPropName(arrayMap))
  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const elsRef = thisPrivate(rowElsProp)

  const clearElsStmt = js`${t.cloneNode(elsRef)} = null;`

  const body: t.Statement[] = [
    lazyInit(containerName, arrayMap.containerSelector, arrayMap.containerBindingId, arrayMap.containerUserIdExpr),
    js`if (!${containerRef}) return;`,
    t.ifStatement(
      jsExpr`Array.isArray(${id(paramName)}) && ${id(paramName)}.length === 0`,
      t.blockStatement([
        clearElsStmt,
        js`${containerRef}.textContent = '';`,
        t.returnStatement(),
      ]),
    ),
    js`this[${id('GEA_ENSURE_ARRAY_CONFIGS')}]();`,
    js`this[${id('GEA_APPLY_LIST_CHANGES')}](${containerRef}, ${id(paramName)}, change, ${configRef});`,
  ]

  const method = appendToBody(jsMethod`${id(methodName)}(${id(paramName)}, change) {}`, ...body)
  return { methods: [method], privateFields: [rowElsProp] }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Patch item method (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generatePatchItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): { method: t.ClassMethod | null; privateFields: string[] } {
  if (!arrayMap.itemTemplate) return { method: null, privateFields: [] }
  const methodName = `patch${getCapNameFromBinding(arrayMap)}Item`

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

  const itemIdExpr = buildItemIdExpr(arrayMap.itemIdProperty, arrayMap.keyExpression, arrayMap.itemVariable, arrayMap.indexVariable)
  body.push(js`${elVar}[${id('GEA_DOM_KEY')}] = ${itemIdExpr};`)

  const rowElsProp = `__rowEls_${arrayMap.containerBindingId ?? 'list'}`
  const privateElsRef = thisPrivate(rowElsProp)
  body.push(
    js`(${t.cloneNode(privateElsRef, true)} || (${t.cloneNode(privateElsRef, true)} = {}))[${t.cloneNode(itemIdExpr, true)}] = ${elVar};`,
  )
  body.push(js`${elVar}[${id('GEA_DOM_ITEM')}] = item;`)

  const params: t.Identifier[] = [id('row'), id('item'), id('__prevItem')]
  if (arrayMap.indexVariable) params.push(id('__idx'))
  return {
    method: t.classMethod('method', id(methodName), params, t.blockStatement(body)),
    privateFields: [rowElsProp],
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Create item method (from gen-array-patch.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function generateCreateItemMethod(
  arrayMap: ArrayMapBinding,
  templatePropNames?: Set<string>,
  wholeParamName?: string,
  templateSetupContext?: { params: Array<t.Identifier | t.Pattern | t.RestElement>; statements: t.Statement[] },
): { method: t.ClassMethod | null; needsRawStoreCache: boolean; privateFields: string[] } {
  if (!arrayMap.itemTemplate) return { method: null, needsRawStoreCache: false, privateFields: [] }
  const capName = getCapNameFromBinding(arrayMap)
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
        rerenderBody.push(js`el[${id('GEA_DOM_PROPS')}] = ${t.objectExpression(propsProperties)};`)
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
  // Each .map() needs its own template-cache field; sharing `#__dc` makes the second map reuse the
  // first map's container ref and corrupt DOM (e.g. two tabs.map() in one component).
  const dcFieldSuffix = arrayMap.containerBindingId ?? arrayPath.replace(/\./g, '_')
  const dcPrivateName = `__dc_${dcFieldSuffix}`
  const privateDcField = thisPrivate(dcPrivateName)
  const cVar = id('__c')
  const elVar = id('el')
  const body: t.Statement[] = []

  if (useRawStoreCache) {
    const privateRsField = thisPrivate('__rs')
    body.push(js`var __rs = ${t.cloneNode(privateRsField, true)} || (${t.cloneNode(privateRsField, true)} = ${id(arrayMap.storeVar!)}[${id('GEA_PROXY_RAW')}]);`)
  }

  body.push(js`var ${cVar} = ${t.cloneNode(privateDcField, true)} || (${t.cloneNode(privateDcField, true)} = ${containerRef});`)

  const isPrimitiveKey = (!itemIdProperty || itemIdProperty === ITEM_IS_KEY) && !arrayMap.keyExpression
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

  const patchItemIdExpr = buildItemIdExpr(itemIdProperty, arrayMap.keyExpression, arrayMap.itemVariable, arrayMap.indexVariable)
  body.push(js`${elVar}[${id('GEA_DOM_KEY')}] = ${patchItemIdExpr};`)
  body.push(js`${elVar}[${id('GEA_DOM_ITEM')}] = item;`)

  if (itemTemplateRootIsComponent && t.isJSXElement(arrayMap.itemTemplate)) {
    const propsProperties = collectComponentProps(arrayMap, propNames, wholeParamName)
    if (propsProperties.length > 0) body.push(js`${elVar}[${id('GEA_DOM_PROPS')}] = ${t.objectExpression(propsProperties)};`)
  }

  body.push(js`return ${elVar};`)

  const createParams: t.Identifier[] = [id('item')]
  if (arrayMap.indexVariable) createParams.push(id('__idx'))
  return {
    method: t.classMethod('method', id(methodName), createParams, t.blockStatement(body)),
    needsRawStoreCache: useRawStoreCache,
    privateFields: [dcPrivateName],
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Render item method (from gen-array-render.ts)
// ═══════════════════════════════════════════════════════════════════════════

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
          path.node.object = id('__rs')
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
    baseMethod.params.push(id(arrayMap.indexVariable))
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

  const privateRsField = t.memberExpression(t.thisExpression(), t.privateName(id('__rs')))
  const rawStoreCacheStmts: t.Statement[] = needsRawStoreCache && arrayMap.storeVar
    ? [js`const __rs = ${t.cloneNode(privateRsField)} || (${t.cloneNode(privateRsField)} = ${id(arrayMap.storeVar)}[${id('GEA_PROXY_RAW')}]);`]
    : []

  const method = appendToBody(
    baseMethod,
    ...rawStoreCacheStmts,
    ...rewrittenSetup,
    ...rewrittenCallbackBody,
    ...handlerRegStmts,
    returnStmt,
  )

  if (handlerPropsInMap.length > 0 && classBody) {
    const handleItemHandler = jsMethod`[${id('GEA_HANDLE_ITEM_HANDLER')}](itemId, e) {
    const fn = this.__itemHandlers_?.[itemId];
    if (fn) fn(e);
  }` as t.ClassMethod
    if (
      !classBody.body.some((m) => t.isClassMethod(m) && m.computed && t.isIdentifier(m.key) && m.key.name === 'GEA_HANDLE_ITEM_HANDLER')
    ) {
      classBody.body.unshift(handleItemHandler)
    }
  }

  renderEventHandlers.forEach((h) => {
    h.mapContext = {
      arrayPathParts: arrayMap.arrayPathParts || normalizePathParts((arrayMap as any).arrayPath || ''),
      itemIdProperty: arrayMap.itemIdProperty || 'id',
      ...(arrayMap.keyExpression ? { keyExpression: t.cloneNode(arrayMap.keyExpression, true) } : {}),
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


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Populate item handlers method (from gen-array-render.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function buildPopulateItemHandlersMethod(
  arrayPropName: string,
  handlerProps: HandlerPropInMap[],
  propNames: Set<string>,
  wholeParamName?: string,
): t.ClassMethod | null {
  if (handlerProps.length === 0) return null
  const loopBody: t.Statement[] = handlerProps.map((hp) => {
    const fn = buildHandlerArrowFn(t.cloneNode(hp.handlerExpression, true) as t.ArrowFunctionExpression, propNames, wholeParamName)
    return js`this.__itemHandlers_[${buildItemKeyExpr(hp.itemIdProperty, 'item')}] = ${fn};`
  })
  return appendToBody(
    jsMethod`${id(`__populateItemHandlersFor_${arrayPropName}`)}(arr) {}`,
    js`if (!this.__itemHandlers_) { this.__itemHandlers_ = {}; }`,
    js`if (!arr) { return; }`,
    t.forOfStatement(
      t.variableDeclaration('const', [t.variableDeclarator(id('item'), null)]),
      id('arr'),
      t.blockStatement(loopBody),
    ),
  ) as t.ClassMethod
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Raw store cache field + value unwrap helper (from gen-array-render.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function buildRawStoreCacheField(): t.ClassPrivateProperty {
  return t.classPrivateProperty(t.privateName(id('__rs')))
}

export function buildValueUnwrapHelper(): t.VariableDeclaration {
  return js`
    const __v = (v) =>
      v != null && typeof v === 'object'
        ? v.valueOf()
        : v;
  ` as t.VariableDeclaration
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Component child detection (from gen-array-slot-sync.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function isUnresolvedMapWithComponentChild(
  um: UnresolvedMapInfo,
  imports: Map<string, string>,
): { componentTag: string } | null {
  const template = um.itemTemplate
  if (!template) return null
  const root = t.isJSXElement(template) ? template : t.isJSXFragment(template) ? null : null
  if (!root || !t.isJSXElement(root)) return null
  const tagName = getJSXTagName(root.openingElement.name)
  if (!tagName || !isComponentTag(tagName) || !imports.has(tagName)) return null
  return { componentTag: tagName }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Component array naming helpers (from gen-array-slot-sync.ts)
// ═══════════════════════════════════════════════════════════════════════════

function getSlotSyncArrayCapName(arrayPropName: string): string {
  return arrayPropName.charAt(0).toUpperCase() + arrayPropName.slice(1)
}

export function getComponentArrayItemsName(arrayPropName: string): string {
  return `_${arrayPropName}Items`
}

export function getComponentArrayBuildMethodName(arrayPropName: string): string {
  return `_build${getSlotSyncArrayCapName(arrayPropName)}Items`
}

export function getComponentArrayRefreshMethodName(arrayPropName: string): string {
  return `__refresh${getSlotSyncArrayCapName(arrayPropName)}Items`
}

export function getComponentArrayMountMethodName(arrayPropName: string): string {
  return `__mount${getSlotSyncArrayCapName(arrayPropName)}Items`
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED: Component array result (from gen-array-slot-sync.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface ComponentArrayResult {
  itemPropsMethod: t.ClassMethod
  constructorInit: t.Statement
  componentTag: string
  containerBindingId?: string
  containerUserIdExpr?: t.Expression
  itemIdProperty?: string
  arrAccessExpr: t.Expression
  arrSetupStatements: t.Statement[]
}

export function generateComponentArrayMethods(
  um: UnresolvedMapInfo,
  arrayPropName: string,
  imports: Map<string, string>,
  propNames: Set<string>,
  _classBody: t.ClassBody,
  storeArrayAccess?: { storeVar: string; propName: string },
  wholeParamName?: string,
  templateSetupContext?: TemplateSetupContext,
): t.ClassMethod[] {
  const result = generateComponentArrayResult(
    um,
    arrayPropName,
    imports,
    propNames,
    _classBody,
    storeArrayAccess,
    wholeParamName,
    templateSetupContext,
  )
  if (!result) return []
  return [result.itemPropsMethod]
}

export function generateComponentArrayResult(
  um: UnresolvedMapInfo,
  arrayPropName: string,
  imports: Map<string, string>,
  propNames: Set<string>,
  _classBody: t.ClassBody,
  storeArrayAccess?: { storeVar: string; propName: string },
  wholeParamName?: string,
  templateSetupContext?: TemplateSetupContext,
): ComponentArrayResult | null {
  const comp = isUnresolvedMapWithComponentChild(um, imports)
  if (!comp) return null

  const itemTemplate = um.itemTemplate
  if (!itemTemplate || !t.isJSXElement(itemTemplate)) return null

  const mapJsxCtx = {
    imports,
    componentInstances: new Map(),
    componentInstanceCursors: new Map(),
    inMapCallback: true,
    isRoot: false,
  }
  const transformExpr = (expr: t.Expression) => {
    const replaced = replacePropRefsInExpression(expr, propNames, wholeParamName)
    return transformJSXExpression(replaced, mapJsxCtx)
  }
  const transformFrag = (frag: t.JSXFragment) => transformJSXFragmentToTemplate(frag, mapJsxCtx)

  const propsResult = buildComponentPropsExpression(
    itemTemplate,
    imports,
    new Map(),
    undefined,
    undefined,
    templateSetupContext,
    transformExpr,
    transformFrag,
  )

  const propsExpr = propsResult.expression
  const itemVar = um.itemVariable
  const indexVar = um.indexVariable
  const needsRename = itemVar !== 'opt'
  const needsIndexRename = indexVar && indexVar !== '__k'
  let finalPropsExpr: t.ObjectExpression = propsExpr
  if (needsRename || needsIndexRename) {
    const cloned = t.cloneNode(propsExpr, true) as t.ObjectExpression
    traverse(cloned, {
      noScope: true,
      Identifier(path: NodePath<t.Identifier>) {
        if (needsRename && path.node.name === itemVar) {
          const parentNode = path.parentPath?.node
          if (parentNode && t.isObjectProperty(parentNode) && parentNode.key === path.node && !parentNode.computed) {
            return
          }
          path.node.name = 'opt'
          return
        }
        if (needsIndexRename && path.node.name === indexVar) {
          const parentNode = path.parentPath?.node
          if (parentNode && t.isObjectProperty(parentNode) && parentNode.key === path.node && !parentNode.computed) {
            return
          }
          path.node.name = '__k'
        }
      },
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (needsRename && t.isIdentifier(path.node.object) && path.node.object.name === itemVar) {
          path.node.object = id('opt')
        }
      },
    })
    finalPropsExpr = cloned
  }

  let arrAccessExpr: t.Expression
  let arrSetupStatements: t.Statement[] = []
  if (storeArrayAccess) {
    arrAccessExpr = jsExpr`${id(storeArrayAccess.storeVar)}.${id(storeArrayAccess.propName)}`
  } else if (um.computationExpr) {
    arrSetupStatements = um.computationSetupStatements
      ? replacePropRefsInStatements(
          um.computationSetupStatements.map((stmt) => t.cloneNode(stmt, true) as t.Statement),
          propNames,
          wholeParamName,
        )
      : []
    arrAccessExpr = replacePropRefsInExpression(t.cloneNode(um.computationExpr, true), propNames, wholeParamName)
  } else {
    arrAccessExpr = jsExpr`this.props.${id(arrayPropName)}`
  }

  arrSetupStatements = pruneUnusedSetupDestructuring(arrSetupStatements, [arrAccessExpr, finalPropsExpr])

  const itemPropsMethodName = `__itemProps_${arrayPropName}`
  const itemPropsCallArgs: t.Expression[] = [id('opt')]
  if (indexVar) itemPropsCallArgs.push(id('__k'))
  const itemPropsCall = t.callExpression(
    jsExpr`this.${id(itemPropsMethodName)}`,
    itemPropsCallArgs,
  )

  const itemPropsSetup = collectTemplateSetupStatements(finalPropsExpr, templateSetupContext)

  const storeVarNames = new Set<string>()
  if (storeArrayAccess) storeVarNames.add(storeArrayAccess.storeVar)
  for (const stmt of [...itemPropsSetup, ...arrSetupStatements]) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const decl of stmt.declarations) {
      if (t.isIdentifier(decl.init) && imports.has(decl.init.name)) {
        storeVarNames.add(decl.init.name)
      }
    }
  }
  const rewriteStoreDestructuring = (stmts: t.Statement[]) => {
    if (storeVarNames.size === 0) return
    for (const stmt of stmts) {
      if (!t.isVariableDeclaration(stmt)) continue
      for (const decl of stmt.declarations) {
        if (t.isIdentifier(decl.init) && storeVarNames.has(decl.init.name)) {
          decl.init = jsExpr`${id(decl.init.name)}[${id('GEA_PROXY_RAW')}]`
        }
      }
    }
  }
  rewriteStoreDestructuring(itemPropsSetup)
  rewriteStoreDestructuring(arrSetupStatements)

  const itemPropsMethod = jsMethod`${id(itemPropsMethodName)}(opt) {}`
  if (indexVar) itemPropsMethod.params.push(id('__k'))
  itemPropsMethod.body.body.push(...itemPropsSetup, t.returnStatement(finalPropsExpr))

  const itemIdProp = um.itemIdProperty
  const keyExpr: t.Expression =
    itemIdProp && itemIdProp !== ITEM_IS_KEY
      ? jsExpr`String(${jsExpr`opt.${id(itemIdProp)}`})`
      : itemIdProp === ITEM_IS_KEY
        ? jsExpr`String(opt)`
        : t.binaryExpression('+', t.stringLiteral('__idx_'), id('__k'))

  const mapParams: t.Identifier[] = [id('opt')]
  if (indexVar || !itemIdProp) mapParams.push(id('__k'))
  const childCall = jsExpr`this[${id('GEA_CHILD')}](${id(comp.componentTag)}, ${t.cloneNode(itemPropsCall, true)}, ${t.cloneNode(keyExpr, true)})`
  const mapCallback = t.arrowFunctionExpression(mapParams, childCall)
  const nullishCoalesce = t.logicalExpression('??', t.cloneNode(arrAccessExpr, true), t.arrayExpression([]))
  const parenthesized = t.parenthesizedExpression ? t.parenthesizedExpression(nullishCoalesce) : nullishCoalesce
  const mapCallExpr = jsExpr`${parenthesized}.map(${mapCallback})`
  const constructorInit = t.expressionStatement(
    t.assignmentExpression('=', buildThisListItems(arrayPropName), mapCallExpr as t.Expression),
  )

  return {
    itemPropsMethod,
    constructorInit,
    componentTag: comp.componentTag,
    containerBindingId: um.containerBindingId,
    containerUserIdExpr: um.containerUserIdExpr,
    itemIdProperty: itemIdProp,
    arrAccessExpr,
    arrSetupStatements,
  }
}
