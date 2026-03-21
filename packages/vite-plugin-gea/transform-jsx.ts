import * as t from '@babel/types'
import type { ChildComponent, EventHandler, HandlerPropInMap, ObserveDependency } from './ir.ts'
import type { StateRefMeta } from './parse.ts'
import { getDirectChildElements, getJSXTagName, isComponentTag as isCompTag } from './utils.ts'
import {
  buildComponentPropsExpression,
  collectExpressionDependencies,
  collectTemplateSetupStatements,
} from './transform-attributes.ts'
import type { TemplateSetupContext } from './transform-attributes.ts'
import {
  getHoistableRootEvent,
  getHoistableRootEventsForImport,
  getPropContext,
  getRootClassSelector,
  toGeaEventType,
} from './component-event-helpers.ts'

const RESERVED_HTML_TAG_NAMES = new Set([
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'search',
  'section',
  'select',
  'slot',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
])

/** Convert PascalCase component name to a safe custom element tag (matches Gea's generateTagName_). */
function pascalToKebabCase(tagName: string): string {
  const normalized = tagName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
  return RESERVED_HTML_TAG_NAMES.has(normalized) ? `gea-${normalized}` : normalized
}

/** Convert camelCase to kebab-case for data-prop-* attribute names. */
function camelToKebab(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

/** Map React-style attribute names to HTML/Gea equivalents. */
function toHtmlAttrName(attrName: string, isComponent: boolean): string {
  if (isComponent) return `data-prop-${camelToKebab(attrName)}`
  if (attrName === 'className') return 'class'
  return attrName
}

function extractHtmlTemplatesFromConditional(expr: t.Expression): {
  truthyHtmlExpr?: t.Expression
  falsyHtmlExpr?: t.Expression
} {
  const normalizeHtmlExpression = (value: t.Expression): t.Expression => {
    if (
      t.isCallExpression(value) &&
      t.isMemberExpression(value.callee) &&
      t.isIdentifier(value.callee.property) &&
      value.callee.property.name === 'map'
    ) {
      return t.callExpression(t.memberExpression(value, t.identifier('join')), [t.stringLiteral('')])
    }
    return value
  }
  if (
    t.isTemplateLiteral(expr) ||
    t.isStringLiteral(expr) ||
    t.isBinaryExpression(expr) ||
    t.isCallExpression(expr) ||
    t.isIdentifier(expr) ||
    t.isMemberExpression(expr)
  ) {
    return { truthyHtmlExpr: normalizeHtmlExpression(expr) }
  }
  if (t.isLogicalExpression(expr) && expr.operator === '&&') {
    return extractHtmlTemplatesFromConditional(expr.right as t.Expression)
  }
  if (t.isConditionalExpression(expr)) {
    const truthy = extractHtmlTemplatesFromConditional(expr.consequent as t.Expression).truthyHtmlExpr
    const falsy = extractHtmlTemplatesFromConditional(expr.alternate as t.Expression).truthyHtmlExpr
    return { truthyHtmlExpr: truthy, falsyHtmlExpr: falsy }
  }
  if (t.isParenthesizedExpression(expr)) {
    return extractHtmlTemplatesFromConditional(expr.expression as t.Expression)
  }
  return {}
}

function extractEnsureChildCall(
  expr: t.Expression,
): { instanceVar: string; ensureMethod: string; guardExpr: t.Expression } | null {
  if (!t.isLogicalExpression(expr) || expr.operator !== '&&') return null
  const right = expr.right
  let ensureCallExpr: t.Expression | null = null
  if (t.isTemplateLiteral(right) && right.expressions.length === 1) {
    ensureCallExpr = right.expressions[0] as t.Expression
  } else if (t.isCallExpression(right)) {
    ensureCallExpr = right
  }
  if (
    !ensureCallExpr ||
    !t.isCallExpression(ensureCallExpr) ||
    !t.isMemberExpression(ensureCallExpr.callee) ||
    !t.isThisExpression(ensureCallExpr.callee.object) ||
    !t.isIdentifier(ensureCallExpr.callee.property) ||
    !ensureCallExpr.callee.property.name.startsWith('__ensureChild_')
  )
    return null

  const ensureMethod = ensureCallExpr.callee.property.name
  const instanceVar = '_' + ensureMethod.replace('__ensureChild_', '')
  return { instanceVar, ensureMethod, guardExpr: expr.left as t.Expression }
}

function expressionMayProduceJSXForCtx(expr: t.Expression): boolean {
  if (t.isJSXElement(expr) || t.isJSXFragment(expr)) return true
  if (t.isLogicalExpression(expr)) {
    return (
      expressionMayProduceJSXForCtx(expr.left as t.Expression) ||
      expressionMayProduceJSXForCtx(expr.right as t.Expression)
    )
  }
  if (t.isConditionalExpression(expr)) {
    return (
      expressionMayProduceJSXForCtx(expr.consequent as t.Expression) ||
      expressionMayProduceJSXForCtx(expr.alternate as t.Expression)
    )
  }
  if (t.isParenthesizedExpression(expr)) return expressionMayProduceJSXForCtx(expr.expression as t.Expression)
  return false
}

/** True if expression can evaluate to false when rendered in template (needs || '' to avoid "false" string). */
function expressionMayBeFalsy(expr: t.Expression): boolean {
  if (t.isLogicalExpression(expr) && expr.operator === '&&') return true
  if (t.isConditionalExpression(expr)) return true
  if (t.isBooleanLiteral(expr) && !expr.value) return true
  return false
}

/** True if expression can evaluate to boolean at runtime (so we need === false check). */
function canBeBoolean(expr: t.Expression): boolean {
  if (t.isNumericLiteral(expr) || t.isStringLiteral(expr) || t.isTemplateLiteral(expr)) return false
  return true
}

/** Build condition to skip attribute when value is null, undefined, or false. */
function buildAttrSkipCondition(expr: t.Expression, rawExpr: t.Expression): t.Expression {
  if (t.isBooleanLiteral(rawExpr)) {
    return rawExpr.value ? t.booleanLiteral(false) : t.booleanLiteral(true)
  }
  if (t.isNumericLiteral(rawExpr) || t.isStringLiteral(rawExpr)) {
    return t.booleanLiteral(false)
  }
  const needsFalseCheck = canBeBoolean(rawExpr)
  const nullCheck = t.binaryExpression('==', t.cloneNode(expr, true), t.nullLiteral())
  if (!needsFalseCheck) return nullCheck
  return t.logicalExpression(
    '||',
    nullCheck,
    t.binaryExpression('===', t.parenthesizedExpression(t.cloneNode(expr, true)), t.booleanLiteral(false)),
  )
}

interface TemplatePart {
  type: 'string' | 'expression'
  value: string | t.Expression
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getStaticStringValue(expr: t.Expression): string | null {
  if (t.isStringLiteral(expr)) return expr.value
  if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) {
    return expr.quasis.map((q) => q.value.cooked ?? q.value.raw).join('')
  }
  return null
}

/**
 * Normalize JSXText whitespace to match standard JSX behavior (React/Babel):
 * - Trim leading/trailing whitespace on each line
 * - Remove whitespace-only lines
 * - Collapse remaining inter-line whitespace to a single space
 */
function normalizeJSXText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/)
  let lastNonEmptyLine = 0
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) lastNonEmptyLine = i
  }
  let str = ''
  for (let i = 0; i < lines.length; i++) {
    const isFirstLine = i === 0
    const isLastLine = i === lines.length - 1
    const isLastNonEmptyLine = i === lastNonEmptyLine
    let trimmed = lines[i].replace(/\t/g, ' ')
    if (!isFirstLine) trimmed = trimmed.replace(/^[ ]+/, '')
    if (!isLastLine) trimmed = trimmed.replace(/[ ]+$/, '')
    if (trimmed) {
      if (!isLastNonEmptyLine) trimmed += ' '
      str += trimmed
    }
  }
  return str
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const EVENT_TYPES = new Set([
  'click',
  'dblclick',
  'change',
  'input',
  'keydown',
  'keyup',
  'blur',
  'focus',
  'mousedown',
  'mouseup',
  'submit',
  'tap',
  'longTap',
  'swipeRight',
  'swipeUp',
  'swipeLeft',
  'swipeDown',
  'dragstart',
  'dragend',
  'dragover',
  'dragleave',
  'drop',
])

export interface ConditionalSlotInfo {
  slotId: string
  truthyHtmlExpr?: t.Expression
  falsyHtmlExpr?: t.Expression
}

export interface StateChildSlot {
  markerId: string
  childInstanceVar: string
  ensureMethodName: string
  /** The conditional guard expression (e.g. step === 1), untransformed */
  guardExpr: t.Expression
  dependencies: ObserveDependency[]
}

interface Ctx {
  imports: Map<string, string>
  componentInstances?: Map<string, ChildComponent[]>
  componentInstanceCursors?: Map<string, number>
  eventHandlers?: EventHandler[]
  eventIdCounter?: { value: number }
  stateRefs?: Map<string, StateRefMeta>
  templateSetupContext?: TemplateSetupContext
  isRoot?: boolean
  /** elementPath.join(' > ') -> bindingId for injecting id attributes on binding targets */
  elementPathToBindingId?: Map<string, string>
  /** True when processing JSX inside a .map() callback */
  inMapCallback?: boolean
  /** Collect function props to convert to handler registry (itemId + __itemHandlers_) */
  handlerPropsInMap?: HandlerPropInMap[]
  /** itemIdProperty for the current map (e.g. 'id') */
  mapItemIdProperty?: string
  /** Map callback param name (e.g. 'opt', 'item') for itemId expression */
  mapItemVariable?: string
  sourceFile?: string
  lazyChildComponents?: boolean
  conditionalSlots?: ConditionalSlotInfo[]
  conditionalSlotCursor?: { value: number }
  conditionalSlotNodeMap?: Map<t.Node, ConditionalSlotInfo>
  stateChildSlots?: StateChildSlot[]
  stateChildSlotCounter?: { value: number }
  /** Populated by processElement: the event token generated for the root element of a map item */
  mapRootEventToken?: string
  /** True when processing JSX inside a compiled child component's props (children, render props, etc.) */
  inChildrenProp?: boolean
}

export function transformJSXToTemplate(el: t.JSXElement, ctx: Ctx, elementPath: string[] = []): t.TemplateLiteral {
  const parts = jsxToTemplateParts(el, ctx, elementPath)
  return partsToTemplateLiteral(parts)
}

export function transformJSXFragmentToTemplate(
  frag: t.JSXFragment,
  ctx: Ctx,
  elementPath: string[] = [],
): t.TemplateLiteral {
  const parts: TemplatePart[] = []
  if (ctx.isRoot) {
    parts.push({ type: 'string', value: '<div id="' })
    parts.push({ type: 'expression', value: t.memberExpression(t.thisExpression(), t.identifier('id')) })
    parts.push({ type: 'string', value: '">' })
  }
  processChildren(frag.children, parts, ctx, elementPath)
  if (ctx.isRoot) {
    appendString(parts, '</div>')
  }
  return partsToTemplateLiteral(parts)
}

/** Collect JSX inside .map() callbacks so we skip event handlers for those. */
function collectMapJSXNodes(node: t.Node, out: Set<t.JSXElement | t.JSXFragment>): void {
  const visit = (n: t.Node) => {
    if (t.isJSXElement(n)) {
      out.add(n)
      n.children.forEach((c) => !t.isJSXText(c) && !t.isJSXEmptyExpression(c) && visit(c as t.Node))
    } else if (t.isJSXFragment(n)) {
      out.add(n)
      n.children.forEach((c) => !t.isJSXText(c) && !t.isJSXEmptyExpression(c) && visit(c as t.Node))
    } else if (t.isLogicalExpression(n)) {
      visit(n.left)
      visit(n.right)
    } else if (t.isConditionalExpression(n)) {
      visit(n.test)
      visit(n.consequent)
      visit(n.alternate)
    } else if (t.isParenthesizedExpression(n)) {
      visit(n.expression)
    } else if (t.isArrowFunctionExpression(n) || t.isFunctionExpression(n)) {
      if (t.isBlockStatement(n.body)) {
        n.body.body.forEach((s) => t.isReturnStatement(s) && s.argument && visit(s.argument))
      } else {
        visit(n.body)
      }
    } else if (
      t.isCallExpression(n) &&
      t.isMemberExpression(n.callee) &&
      t.isIdentifier(n.callee.property) &&
      n.callee.property.name === 'map' &&
      n.arguments[0] &&
      t.isArrowFunctionExpression(n.arguments[0])
    ) {
      const fn = n.arguments[0]
      if (t.isBlockStatement(fn.body)) {
        fn.body.body.forEach((s) => t.isReturnStatement(s) && s.argument && visit(s.argument))
      } else {
        visit(fn.body)
      }
    }
  }
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === 'map' &&
    node.arguments[0] &&
    t.isArrowFunctionExpression(node.arguments[0])
  ) {
    visit(node.arguments[0])
  } else if (t.isLogicalExpression(node)) {
    collectMapJSXNodes(node.left, out)
    collectMapJSXNodes(node.right, out)
  } else if (t.isConditionalExpression(node)) {
    collectMapJSXNodes(node.test, out)
    collectMapJSXNodes(node.consequent, out)
    collectMapJSXNodes(node.alternate, out)
  }
}

/** Recursively replace JSX in expression without Babel traverse (avoids scope/Program errors). */
function replaceJSXInExpression(
  node: t.Expression,
  mapJSXNodes: Set<t.JSXElement | t.JSXFragment>,
  ctx: Ctx,
): t.Expression {
  if (t.isJSXElement(node)) {
    const h = mapJSXNodes.has(node) ? undefined : ctx.eventHandlers
    return transformJSXToTemplate(node, {
      ...ctx,
      isRoot: false,
      eventHandlers: h,
      inMapCallback: mapJSXNodes.has(node) ? ctx.inMapCallback : undefined,
    })
  }
  if (t.isJSXFragment(node)) {
    const h = mapJSXNodes.has(node) ? undefined : ctx.eventHandlers
    return transformJSXFragmentToTemplate(node, {
      ...ctx,
      isRoot: false,
      eventHandlers: h,
      inMapCallback: mapJSXNodes.has(node) ? ctx.inMapCallback : undefined,
    })
  }
  if (t.isParenthesizedExpression(node)) {
    return t.parenthesizedExpression(replaceJSXInExpression(node.expression, mapJSXNodes, ctx))
  }
  if (t.isLogicalExpression(node)) {
    const left = replaceJSXInExpression(node.left, mapJSXNodes, ctx)
    const right = replaceJSXInExpression(node.right, mapJSXNodes, { ...ctx, lazyChildComponents: true })
    return t.logicalExpression(node.operator, left, right)
  }
  if (t.isConditionalExpression(node)) {
    const test = replaceJSXInExpression(node.test, mapJSXNodes, ctx)
    const consequent = replaceJSXInExpression(node.consequent, mapJSXNodes, { ...ctx, lazyChildComponents: true })
    const alternate = replaceJSXInExpression(node.alternate, mapJSXNodes, { ...ctx, lazyChildComponents: true })
    return t.conditionalExpression(test, consequent, alternate)
  }
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === 'map' &&
    node.arguments[0] &&
    t.isArrowFunctionExpression(node.arguments[0])
  ) {
    const fn = node.arguments[0] as t.ArrowFunctionExpression
    const handlerPropsInMap: HandlerPropInMap[] = []
    const mapItemVariable = t.isIdentifier(fn.params[0]) ? fn.params[0].name : 'item'
    const mapCtx = {
      ...ctx,
      inMapCallback: true,
      handlerPropsInMap,
      mapItemIdProperty: 'id',
      mapItemVariable,
      conditionalSlots: undefined,
      conditionalSlotCursor: undefined,
      conditionalSlotNodeMap: undefined,
    }
    let body: t.Expression | undefined
    let newBody: t.BlockStatement | t.Expression
    if (t.isBlockStatement(fn.body)) {
      const jsxReturnIdx = fn.body.body.findIndex(
        (s) =>
          t.isReturnStatement(s) &&
          s.argument &&
          (t.isJSXElement(s.argument) || t.isJSXFragment(s.argument) || t.isParenthesizedExpression(s.argument)),
      )
      if (jsxReturnIdx >= 0) {
        const retStmt = fn.body.body[jsxReturnIdx] as t.ReturnStatement
        body = replaceJSXInExpression(retStmt.argument as t.Expression, mapJSXNodes, mapCtx)
        const preceding = fn.body.body.slice(0, jsxReturnIdx).map((s) => t.cloneNode(s, true) as t.Statement)
        newBody = t.blockStatement([...preceding, t.returnStatement(body)])
      } else if (fn.body.body[0] && t.isReturnStatement(fn.body.body[0]) && fn.body.body[0].argument) {
        body = replaceJSXInExpression(fn.body.body[0].argument as t.Expression, mapJSXNodes, mapCtx)
        newBody = t.blockStatement([t.returnStatement(body)])
      } else {
        body = (fn.body.body[0] as t.ReturnStatement)?.argument as t.Expression
        newBody = t.blockStatement([t.returnStatement(body)])
      }
    } else {
      body = replaceJSXInExpression(fn.body as t.Expression, mapJSXNodes, mapCtx)
      newBody = body
    }
    return t.callExpression(t.cloneNode(node.callee), [
      t.arrowFunctionExpression(fn.params, newBody, fn.async),
      ...node.arguments.slice(1).map((a) => t.cloneNode(a)),
    ])
  }
  return node
}

export function transformJSXExpression(expr: t.Expression, ctx: Ctx, skipEvents = false): t.Expression {
  const effectiveCtx = skipEvents ? { ...ctx, eventHandlers: undefined } : ctx
  if (t.isJSXElement(expr)) return transformJSXToTemplate(expr, effectiveCtx)
  if (t.isJSXFragment(expr)) return transformJSXFragmentToTemplate(expr, effectiveCtx)

  try {
    const cloned = t.cloneNode(expr, true) as t.Expression
    const mapJSXNodes = new Set<t.JSXElement | t.JSXFragment>()
    collectMapJSXNodes(cloned, mapJSXNodes)

    return replaceJSXInExpression(cloned, mapJSXNodes, effectiveCtx)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[gea]')) throw err
    return expr
  }
}

export function collectComponentTags(
  node: t.JSXElement | t.JSXFragment,
  imports: Map<string, string>,
  instanceTags: string[],
  inMapCallback = false,
): void {
  const visitExpr = (expr: t.Expression, inMap = false) => {
    if (t.isJSXElement(expr)) collectComponentTags(expr, imports, instanceTags, inMap)
    else if (t.isJSXFragment(expr)) collectComponentTags(expr, imports, instanceTags, inMap)
    else if (t.isLogicalExpression(expr)) {
      visitExpr(expr.left, inMap)
      visitExpr(expr.right, inMap)
    } else if (t.isConditionalExpression(expr)) {
      visitExpr(expr.consequent, inMap)
      visitExpr(expr.alternate, inMap)
    } else if (t.isCallExpression(expr)) {
      expr.arguments.forEach((arg) => {
        if (!t.isArrowFunctionExpression(arg) && !t.isFunctionExpression(arg)) return
        const body = arg.body
        if (t.isJSXElement(body)) collectComponentTags(body, imports, instanceTags, true)
        else if (t.isJSXFragment(body)) collectComponentTags(body, imports, instanceTags, true)
        else if (t.isBlockStatement(body)) {
          const ret = body.body.find((s): s is t.ReturnStatement => t.isReturnStatement(s) && s.argument != null)
          if (ret?.argument) visitExpr(ret.argument as t.Expression, true)
        } else if (t.isExpression(body)) visitExpr(body, true)
      })
    }
  }
  if (t.isJSXElement(node)) {
    const tag = getJSXTagName(node.openingElement.name)
    if (tag && isCompTag(tag) && imports.has(tag)) {
      if (!inMapCallback) instanceTags.push(tag)
    }
    node.children.forEach((c) => {
      if (t.isJSXElement(c)) collectComponentTags(c, imports, instanceTags, inMapCallback)
      else if (t.isJSXFragment(c)) collectComponentTags(c, imports, instanceTags, inMapCallback)
      else if (t.isJSXExpressionContainer(c) && !t.isJSXEmptyExpression(c.expression)) {
        const expr = c.expression as t.Expression
        if (t.isJSXElement(expr)) collectComponentTags(expr, imports, instanceTags, inMapCallback)
        else if (t.isJSXFragment(expr)) collectComponentTags(expr, imports, instanceTags, inMapCallback)
        else visitExpr(expr, inMapCallback)
      }
    })
  } else {
    node.children.forEach((c) => {
      if (t.isJSXElement(c)) collectComponentTags(c, imports, instanceTags, inMapCallback)
      else if (t.isJSXFragment(c)) collectComponentTags(c, imports, instanceTags, inMapCallback)
      else if (t.isJSXExpressionContainer(c) && !t.isJSXEmptyExpression(c.expression)) {
        const expr = c.expression as t.Expression
        if (t.isJSXElement(expr)) collectComponentTags(expr, imports, instanceTags, inMapCallback)
        else if (t.isJSXFragment(expr)) collectComponentTags(expr, imports, instanceTags, inMapCallback)
        else visitExpr(expr, inMapCallback)
      }
    })
  }
}

function jsxToTemplateParts(node: t.JSXElement, ctx: Ctx, elementPath: string[] = []): TemplatePart[] {
  const parts: TemplatePart[] = []
  processElement(node, parts, ctx, elementPath)
  return parts
}

function processElement(node: t.JSXElement, parts: TemplatePart[], ctx: Ctx, elementPath: string[] = []): void {
  const tagName = getJSXTagName(node.openingElement.name)
  const isComp = tagName && isCompTag(tagName) && ctx.imports.has(tagName)

  if (isComp && ctx.componentInstances && !ctx.inMapCallback) {
    if (ctx.eventHandlers && ctx.sourceFile) {
      const importSource = ctx.imports.get(tagName!)
      if (importSource) {
        const delegatedEvents = getHoistableRootEventsForImport(ctx.sourceFile, importSource)
        delegatedEvents.forEach((meta) => {
          ctx.eventHandlers!.push({
            eventType: meta.eventType,
            selector: meta.selector,
            delegatedPropName: meta.propName,
            usesTargetComponent: true,
          })
        })
      }
    }
    const instances = ctx.componentInstances.get(tagName)
    const cursor = ctx.componentInstanceCursors?.get(tagName) || 0
    const instance = instances?.[cursor]
    if (instance) {
      ctx.componentInstanceCursors?.set(tagName, cursor + 1)
      if (ctx.lazyChildComponents) instance.lazy = true
      const childPropCtx = { ...ctx, inChildrenProp: true }
      const props = buildComponentPropsExpression(
        node,
        ctx.imports,
        ctx.componentInstances,
        ctx.eventHandlers,
        ctx.stateRefs,
        ctx.templateSetupContext,
        (e: t.Expression) => transformJSXExpression(e, childPropCtx),
        (f: t.JSXFragment) => transformJSXFragmentToTemplate(f, childPropCtx),
      )
      instance.propsExpression = props.expression
      instance.dependencies = props.dependencies
      instance.setupStatements = props.setupStatements
      pushString(parts, '')
      parts.push({
        type: 'expression',
        value: t.callExpression(
          t.memberExpression(
            t.thisExpression(),
            t.identifier(`__ensureChild_${instance.instanceVar.replace(/^_/, '')}`),
          ),
          [],
        ),
      })
      return
    }
  }

  // In .map(), root item is a custom element placeholder (<issue-card>) for list sync; nested components need `new X()`.
  if (isComp && (!ctx.inMapCallback || elementPath.length > 0)) {
    const childPropCtx = { ...ctx, inChildrenProp: true }
    const props = buildComponentPropsExpression(
      node,
      ctx.imports,
      ctx.componentInstances,
      ctx.eventHandlers,
      ctx.stateRefs,
      ctx.templateSetupContext,
      (e: t.Expression) => transformJSXExpression(e, childPropCtx),
      (f: t.JSXFragment) => transformJSXFragmentToTemplate(f, childPropCtx),
    )
    pushString(parts, '')
    parts.push({
      type: 'expression',
      value: t.newExpression(t.identifier(tagName!), [props.expression]),
    })
    return
  }

  const effectiveTag = isComp ? pascalToKebabCase(tagName!) : tagName
  const propContext = getPropContext(ctx.templateSetupContext?.params)
  const rootClassSelector = elementPath.length === 0 ? getRootClassSelector(node) : null
  const explicitIdAttr = node.openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'id',
  )
  let html = `<${effectiveTag}`
  if (ctx.isRoot) {
    parts.push({ type: 'string', value: html + ' id="' })
    parts.push({ type: 'expression', value: t.memberExpression(t.thisExpression(), t.identifier('id')) })
    html = '"'
  } else {
    const pathKey = elementPath.join(' > ')
    const bindingId = ctx.elementPathToBindingId?.get(pathKey)
    if (bindingId !== undefined && bindingId !== '') {
      parts.push({ type: 'string', value: html + ' id="' })
      parts.push({
        type: 'expression',
        value: t.binaryExpression(
          '+',
          t.memberExpression(t.thisExpression(), t.identifier('id')),
          t.stringLiteral('-' + bindingId),
        ),
      })
      html = '"'
    }
  }
  let generatedEventSuffix: string | undefined
  let generatedEventToken: string | undefined
  node.openingElement.attributes.forEach((attr) => {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    const attrName = attr.name.name
    if (attrName === 'key') return
    const attrValue = attr.value
    const propAttrName = toHtmlAttrName(attrName, isComp)
    const eventType = toGeaEventType(attrName)

    if (t.isJSXExpressionContainer(attrValue) && !t.isJSXEmptyExpression(attrValue.expression)) {
      if (!isComp && ctx.isRoot) {
        const hoistedRootEvent = getHoistableRootEvent(
          attrName,
          attrValue.expression as t.Expression,
          elementPath,
          propContext,
          rootClassSelector,
        )
        if (hoistedRootEvent) {
          if (ctx.eventHandlers) {
            ctx.eventHandlers.push({
              eventType: hoistedRootEvent.eventType,
              selector: hoistedRootEvent.selector,
              delegatedPropName: hoistedRootEvent.propName,
              usesTargetComponent: false,
            })
          }
          return
        }
      }
      if (!isComp && EVENT_TYPES.has(eventType) && ctx.inMapCallback && !ctx.eventHandlers) {
        return
      }
      if (!isComp && EVENT_TYPES.has(eventType) && ctx.eventHandlers) {
        let selectorExpression: t.Expression | undefined
        let selector: string | undefined

        if (!ctx.inMapCallback && ctx.isRoot) {
          selectorExpression = buildEventSelectorExpression()
        } else {
          const pathKey = elementPath.join(' > ')
          const bindingId = ctx.elementPathToBindingId?.get(pathKey)
          if (!ctx.inMapCallback && bindingId !== undefined) {
            selectorExpression = buildEventSelectorExpression(bindingId)
          } else if (!ctx.inMapCallback && !ctx.inChildrenProp && !explicitIdAttr) {
            if (!generatedEventSuffix) {
              generatedEventSuffix = `ev${ctx.eventIdCounter?.value ?? 0}`
              if (ctx.eventIdCounter) ctx.eventIdCounter.value += 1
              parts.push({ type: 'string', value: html + ' id="' })
              parts.push({
                type: 'expression',
                value: t.binaryExpression(
                  '+',
                  t.memberExpression(t.thisExpression(), t.identifier('id')),
                  t.stringLiteral(`-${generatedEventSuffix}`),
                ),
              })
              html = '"'
            }
            selectorExpression = buildEventSelectorExpression(generatedEventSuffix)
          } else {
            if (!generatedEventToken) {
              generatedEventToken = `ev${ctx.eventIdCounter?.value ?? 0}`
              if (ctx.eventIdCounter) ctx.eventIdCounter.value += 1
              if (ctx.inMapCallback && elementPath.length === 0) {
                ctx.mapRootEventToken = generatedEventToken
              } else {
                html += ` data-gea-event="${generatedEventToken}"`
              }
            }
            selector = `[data-gea-event="${generatedEventToken}"]`
          }
        }

        if (selectorExpression || selector) {
          ctx.eventHandlers.push({
            eventType,
            handlerExpression: attrValue.expression as t.Expression,
            selectorExpression,
            selector,
          })
          return
        }
      }
      if (attrName === 'checked') {
        parts.push({ type: 'string', value: html })
        const expr = transformJSXExpression(attrValue.expression as t.Expression, ctx)
        parts.push({
          type: 'expression',
          value: t.conditionalExpression(expr, t.stringLiteral(` ${propAttrName}`), t.stringLiteral('')),
        })
        html = ''
      } else {
        const rawExpr = attrValue.expression as t.Expression
        const isFunctionProp = t.isArrowFunctionExpression(rawExpr) || t.isFunctionExpression(rawExpr)
        if (isComp && ctx.inMapCallback && isFunctionProp && ctx.handlerPropsInMap != null) {
          ctx.handlerPropsInMap.push({
            propName: attrName,
            handlerExpression: rawExpr as t.ArrowFunctionExpression | t.FunctionExpression,
            itemIdProperty: ctx.mapItemIdProperty || 'id',
          })
          const itemIdProp = ctx.mapItemIdProperty || 'id'
          const hasItemId = node.openingElement.attributes.some(
            (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === 'itemId',
          )
          if (!hasItemId) {
            const itemVar = ctx.mapItemVariable || 'item'
            parts.push({ type: 'string', value: html })
            parts.push({
              type: 'expression',
              value: t.templateLiteral(
                [
                  t.templateElement({ raw: ` data-prop-item-id="`, cooked: ` data-prop-item-id="` }, false),
                  t.templateElement({ raw: '"', cooked: '"' }, true),
                ],
                [t.memberExpression(t.identifier(itemVar), t.identifier(itemIdProp))],
              ),
            })
            html = ''
          }
          return
        }
        if (isComp && ctx.inMapCallback && isFunctionProp) {
          const propName = attrName
          const err = new Error(
            `[gea] Cannot pass function as prop "${propName}" to a component inside .map(). ` +
              `Functions cannot be serialized to HTML attributes. Use event delegation instead: ` +
              `pass a scalar like itemId and handle the click on the parent container.`,
          )
          ;(err as any).__geaCompileError = true
          throw err
        }
        parts.push({ type: 'string', value: html })
        const expr = transformJSXExpression(rawExpr, ctx)
        const skipCondition = buildAttrSkipCondition(expr, rawExpr)
        const templateExpr =
          propAttrName === 'class' ? t.callExpression(t.memberExpression(expr, t.identifier('trim')), []) : expr
        parts.push({
          type: 'expression',
          value: t.conditionalExpression(
            skipCondition,
            t.stringLiteral(''),
            t.templateLiteral(
              [
                t.templateElement({ raw: ` ${propAttrName}="`, cooked: ` ${propAttrName}="` }, false),
                t.templateElement({ raw: '"', cooked: '"' }, true),
              ],
              [templateExpr],
            ),
          ),
        })
        html = ''
      }
    } else if (t.isStringLiteral(attrValue)) {
      html += ` ${propAttrName}="${attrValue.value}"`
    } else if (attrValue === null) {
      html += ` ${propAttrName}`
    }
  })

  if (node.openingElement.selfClosing) {
    if (isComp) {
      parts.push({ type: 'string', value: html + `></${effectiveTag}>` })
    } else if (VOID_ELEMENTS.has(effectiveTag!)) {
      parts.push({ type: 'string', value: html + ' />' })
    } else {
      parts.push({ type: 'string', value: html + `></${effectiveTag}>` })
    }
  } else {
    html += '>'
    parts.push({ type: 'string', value: html })
    processChildren(node.children, parts, ctx, elementPath)
    appendString(parts, `</${effectiveTag}>`)
  }
}

function processChildren(
  children: readonly (t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment)[],
  parts: TemplatePart[],
  ctx: Ctx,
  elementPath: string[],
  dcCursor?: { index: number },
  directChildren?: { node: t.JSXElement; selectorSegment: string }[],
): void {
  const cursor = dcCursor ?? { index: 0 }
  const dc = directChildren ?? getDirectChildElements(children)
  const childCtx = { ...ctx, isRoot: false }
  children.forEach((child) => {
    if (t.isJSXText(child)) {
      const normalized = normalizeJSXText(child.value)
      if (normalized) appendString(parts, normalized)
    } else if (t.isJSXElement(child)) {
      const seg = dc[cursor.index]?.selectorSegment
      cursor.index++
      processElement(child, parts, childCtx, seg ? [...elementPath, seg] : elementPath)
    } else if (t.isJSXFragment(child)) {
      processChildren(child.children, parts, childCtx, elementPath, cursor, dc)
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      const rawExpr = child.expression as t.Expression
      const staticStr = getStaticStringValue(rawExpr)
      if (staticStr !== null) {
        appendString(parts, escapeHtml(staticStr))
        return
      }
      const slot = ctx.conditionalSlotNodeMap?.get(rawExpr)
      if (slot) {
        appendString(parts, `<!--`)
        parts.push({
          type: 'expression',
          value: t.binaryExpression(
            '+',
            t.memberExpression(t.thisExpression(), t.identifier('id')),
            t.stringLiteral('-' + slot.slotId),
          ),
        })
        appendString(parts, `-->`)
        pushString(parts, '')
        let condExpr = transformJSXExpression(rawExpr, ctx)
        const extracted = extractHtmlTemplatesFromConditional(condExpr)
        slot.truthyHtmlExpr = extracted.truthyHtmlExpr
        slot.falsyHtmlExpr = extracted.falsyHtmlExpr
        if (expressionMayBeFalsy(rawExpr)) {
          condExpr = t.logicalExpression('||', condExpr, t.stringLiteral(''))
        }
        parts.push({ type: 'expression', value: condExpr })
        appendString(parts, `<!--`)
        parts.push({
          type: 'expression',
          value: t.binaryExpression(
            '+',
            t.memberExpression(t.thisExpression(), t.identifier('id')),
            t.stringLiteral('-' + slot.slotId + '-end'),
          ),
        })
        appendString(parts, `-->`)
      } else {
        pushString(parts, '')
        let expr = transformJSXExpression(rawExpr, ctx)
        const stateSlots = ctx.stateChildSlots
        const stateCounter = ctx.stateChildSlotCounter
        const childCallInfo =
          stateSlots && stateCounter && expressionMayBeFalsy(rawExpr) ? extractEnsureChildCall(expr) : null
        if (childCallInfo && stateSlots && stateCounter) {
          const markerId = `sc${stateCounter.value}`
          stateCounter.value++
          const setupStatements = collectTemplateSetupStatements(childCallInfo.guardExpr, ctx.templateSetupContext)
          stateSlots.push({
            markerId,
            childInstanceVar: childCallInfo.instanceVar,
            ensureMethodName: childCallInfo.ensureMethod,
            guardExpr: childCallInfo.guardExpr,
            dependencies: collectExpressionDependencies(childCallInfo.guardExpr, ctx.stateRefs, setupStatements),
          })
          appendString(parts, `<template id="`)
          parts.push({
            type: 'expression',
            value: t.binaryExpression(
              '+',
              t.memberExpression(t.thisExpression(), t.identifier('id')),
              t.stringLiteral('-' + markerId),
            ),
          })
          appendString(parts, `"></template>`)
          pushString(parts, '')
        }
        if (expressionMayBeFalsy(rawExpr)) {
          expr = t.logicalExpression('||', expr, t.stringLiteral(''))
        }
        parts.push({ type: 'expression', value: expr })
      }
    }
  })
}

function pushString(parts: TemplatePart[], value: string) {
  parts.push({ type: 'string', value })
}

function appendString(parts: TemplatePart[], value: string) {
  if (parts.length > 0 && parts[parts.length - 1].type === 'string') {
    ;(parts[parts.length - 1].value as string) += value
  } else {
    parts.push({ type: 'string', value })
  }
}

function buildEventSelectorExpression(suffix?: string): t.Expression {
  return t.templateLiteral(
    [
      t.templateElement({ raw: '#', cooked: '#' }, false),
      t.templateElement({ raw: suffix ? `-${suffix}` : '', cooked: suffix ? `-${suffix}` : '' }, true),
    ],
    [t.memberExpression(t.thisExpression(), t.identifier('id'))],
  )
}

function partsToTemplateLiteral(parts: TemplatePart[]): t.TemplateLiteral {
  const strings: t.TemplateElement[] = []
  const expressions: t.Expression[] = []
  let current = ''
  parts.forEach((p) => {
    if (p.type === 'string') {
      current += p.value as string
    } else {
      strings.push(t.templateElement({ raw: current, cooked: current }, false))
      current = ''
      expressions.push(p.value as t.Expression)
    }
  })
  strings.push(t.templateElement({ raw: current, cooked: current }, true))
  return t.templateLiteral(strings, expressions)
}
