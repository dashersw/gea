import * as t from '@babel/types'
import type { ChildComponent, EventHandler, HandlerPropInMap, ObserveDependency } from './ir.ts'
import type { StateRefMeta } from './parse.ts'
import {
  buildTrimmedClassJoinedExpression,
  buildTrimmedClassValueExpression,
  buildOptionalMemberChain,
  getDirectChildElements,
  getJSXTagName,
  isComponentTag as isCompTag,
} from './utils.ts'
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
import {
  ITEM_IS_KEY,
  detectItemIdProperty,
  extractItemTemplate,
  extractKeyExpression,
  hasExplicitItemKey,
  normalizeDestructuredMapCallback,
} from './analyze-helpers.ts'

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
export function pascalToKebabCase(tagName: string): string {
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

function tryStaticClassObjectToString(expr: t.ObjectExpression): string | null {
  const parts: string[] = []
  for (const prop of expr.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) return null
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
    if (!key) return null
    if (t.isBooleanLiteral(prop.value)) {
      if (prop.value.value) parts.push(key)
    } else {
      return null
    }
  }
  return parts.join(' ')
}

function buildClassObjectExpression(expr: t.Expression): t.Expression {
  // Object.entries(obj).filter(([,v]) => v).map(([k]) => k).join(' ')
  return t.callExpression(
    t.memberExpression(
      t.callExpression(
        t.memberExpression(
          t.callExpression(
            t.memberExpression(
              t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [expr]),
              t.identifier('filter'),
            ),
            [
              t.arrowFunctionExpression(
                [t.arrayPattern([t.identifier('__k'), t.identifier('__v')])],
                t.identifier('__v'),
              ),
            ],
          ),
          t.identifier('map'),
        ),
        [t.arrowFunctionExpression([t.arrayPattern([t.identifier('__k')])], t.identifier('__k'))],
      ),
      t.identifier('join'),
    ),
    [t.stringLiteral(' ')],
  )
}

function tryStaticStyleObjectToCSS(expr: t.ObjectExpression): string | null {
  const parts: string[] = []
  for (const prop of expr.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) return null
    const key = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null
    if (!key) return null
    const value = t.isStringLiteral(prop.value)
      ? prop.value.value
      : t.isNumericLiteral(prop.value)
        ? prop.value.value === 0
          ? '0'
          : `${prop.value.value}px`
        : null
    if (value === null) return null
    parts.push(`${camelToKebab(key)}: ${value}`)
  }
  return parts.join('; ')
}

function buildStyleObjectExpression(expr: t.Expression): t.Expression {
  return t.callExpression(
    t.memberExpression(
      t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [expr]),
      t.identifier('map'),
    ),
    [
      t.arrowFunctionExpression(
        [t.arrayPattern([t.identifier('__k'), t.identifier('__v')])],
        t.templateLiteral(
          [
            t.templateElement({ raw: '', cooked: '' }, false),
            t.templateElement({ raw: ': ', cooked: ': ' }, false),
            t.templateElement({ raw: '', cooked: '' }, true),
          ],
          [
            t.callExpression(t.memberExpression(t.identifier('__k'), t.identifier('replace')), [
              t.regExpLiteral('[A-Z]', 'g'),
              t.stringLiteral('-$&'),
            ]),
            t.conditionalExpression(
              t.logicalExpression(
                '&&',
                t.binaryExpression('===', t.unaryExpression('typeof', t.identifier('__v')), t.stringLiteral('number')),
                t.binaryExpression('!==', t.identifier('__v'), t.numericLiteral(0)),
              ),
              t.binaryExpression('+', t.identifier('__v'), t.stringLiteral('px')),
              t.identifier('__v'),
            ),
          ],
        ),
      ),
    ],
  )
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

function extractChildInstanceRef(expr: t.Expression): { instanceVar: string; guardExpr: t.Expression } | null {
  if (!t.isLogicalExpression(expr) || expr.operator !== '&&') return null
  const right = expr.right
  let memberExpr: t.MemberExpression | null = null
  if (t.isTemplateLiteral(right) && right.expressions.length === 1) {
    const inner = right.expressions[0] as t.Expression
    if (t.isMemberExpression(inner)) memberExpr = inner
  } else if (t.isMemberExpression(right)) {
    memberExpr = right
  }
  if (
    !memberExpr ||
    !t.isThisExpression(memberExpr.object) ||
    !t.isIdentifier(memberExpr.property) ||
    !memberExpr.property.name.startsWith('_')
  )
    return null

  const instanceVar = memberExpr.property.name
  return { instanceVar, guardExpr: expr.left as t.Expression }
}

/**
 * True if expression contains any JSX elements or fragments.
 * Such expressions produce HTML strings after compilation and must NOT be escaped.
 */
function expressionContainsJSX(expr: t.Expression): boolean {
  let found = false
  const check = (node: t.Node) => {
    if (found) return
    if (t.isJSXElement(node) || t.isJSXFragment(node)) {
      found = true
      return
    }
    for (const key of t.VISITOR_KEYS[node.type] || []) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && 'type' in c) check(c)
          if (found) return
        }
      } else if (child && typeof child === 'object' && 'type' in child) {
        check(child)
      }
      if (found) return
    }
  }
  check(expr)
  return found
}

/**
 * True if expression accesses `props.children` or `this.props.children`.
 * The `children` prop contains compiler-generated HTML from the parent and must not be escaped.
 */
function isChildrenPropAccess(expr: t.Expression): boolean {
  // Destructured: children (bare identifier from template({ children }))
  if (t.isIdentifier(expr) && expr.name === 'children') return true
  // props.children
  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.property) &&
    expr.property.name === 'children' &&
    t.isIdentifier(expr.object) &&
    expr.object.name === 'props'
  )
    return true
  // this.props.children
  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.property) &&
    expr.property.name === 'children' &&
    t.isMemberExpression(expr.object) &&
    t.isThisExpression(expr.object.object) &&
    t.isIdentifier(expr.object.property) &&
    expr.object.property.name === 'props'
  )
    return true
  return false
}

/** True if expression can evaluate to false when rendered in template (needs || '' to avoid "false" string). */
function expressionMayBeFalsy(expr: t.Expression): boolean {
  if (t.isLogicalExpression(expr) && expr.operator === '&&') return true
  if (t.isConditionalExpression(expr)) return true
  if (t.isBooleanLiteral(expr) && !expr.value) return true
  if (t.isOptionalMemberExpression(expr)) return true
  if (t.isOptionalCallExpression(expr)) return true
  return false
}

/** True if expression can evaluate to boolean at runtime (so we need === false check). */
function canBeBoolean(expr: t.Expression): boolean {
  if (t.isNumericLiteral(expr) || t.isStringLiteral(expr) || t.isTemplateLiteral(expr)) return false
  if (t.isConditionalExpression(expr)) return canBeBoolean(expr.consequent) || canBeBoolean(expr.alternate)
  return true
}

/** True if expression is guaranteed to never produce null, undefined, or false at runtime. */
function isAlwaysTruthy(expr: t.Expression): boolean {
  if (t.isStringLiteral(expr) || t.isNumericLiteral(expr) || t.isTemplateLiteral(expr)) return true
  if (t.isObjectExpression(expr) || t.isArrayExpression(expr)) return true
  if (t.isConditionalExpression(expr)) return isAlwaysTruthy(expr.consequent) && isAlwaysTruthy(expr.alternate)
  return false
}

/** Build condition to skip attribute when value is null, undefined, or false. */
function buildAttrSkipCondition(expr: t.Expression, rawExpr: t.Expression): t.Expression {
  if (t.isBooleanLiteral(rawExpr)) {
    return rawExpr.value ? t.booleanLiteral(false) : t.booleanLiteral(true)
  }
  if (t.isNumericLiteral(rawExpr) || t.isStringLiteral(rawExpr)) {
    return t.booleanLiteral(false)
  }
  if (isAlwaysTruthy(rawExpr)) {
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'cite', 'poster', 'background'])

function wrapWithSanitizeAttr(attrName: string, expr: t.Expression): t.Expression {
  if (!URL_ATTRS.has(attrName)) return expr
  return t.callExpression(t.identifier('__sanitizeAttr'), [
    t.stringLiteral(attrName),
    t.callExpression(t.identifier('String'), [expr]),
  ])
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
  /** The conditional guard expression (e.g. step === 1), untransformed */
  guardExpr: t.Expression
  dependencies: ObserveDependency[]
}

export interface Ctx {
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
  /** elementPath.join(' > ') -> user-provided id expression */
  elementPathToUserIdExpr?: Map<string, t.Expression>
  /** True when processing JSX inside a .map() callback */
  inMapCallback?: boolean
  /** Collect function props to convert to handler registry (itemId + __itemHandlers_) */
  handlerPropsInMap?: HandlerPropInMap[]
  /** itemIdProperty for the current map (e.g. 'id') */
  mapItemIdProperty?: string
  /** Full key expression AST when key is not a simple item.prop */
  mapKeyExpression?: t.Expression
  /** Map callback param name (e.g. 'opt', 'item') for itemId expression */
  mapItemVariable?: string
  /** Container binding ID for map items (when set, use `id` instead of `data-gea-item-id`) */
  mapContainerBindingId?: string
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
  /** Collected ref bindings: target expression + ref marker ID */
  refBindings?: { refId: string; targetExpr: t.Expression }[]
  /** Counter for generating unique ref marker IDs */
  refCounter?: { value: number }
  /** Prefix prepended to element path keys when looking up binding IDs inside conditional slots */
  elementPathPrefix?: string
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
    normalizeDestructuredMapCallback(fn)
    const handlerPropsInMap: HandlerPropInMap[] = []
    const mapItemVariable = t.isIdentifier(fn.params[0]) ? fn.params[0].name : 'item'
    const itemTemplate = extractItemTemplate(fn)
    const mapItemIdProperty = detectItemIdProperty(itemTemplate, mapItemVariable) || 'id'
    const mapKeyExpr = !detectItemIdProperty(itemTemplate, mapItemVariable) && hasExplicitItemKey(itemTemplate)
      ? extractKeyExpression(itemTemplate)
      : undefined
    const mapCtx = {
      ...ctx,
      inMapCallback: true,
      handlerPropsInMap,
      mapItemIdProperty,
      mapItemVariable,
      ...(mapKeyExpr ? { mapKeyExpression: mapKeyExpr } : {}),
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
  if (t.isCallExpression(node) && (t.isArrowFunctionExpression(node.callee) || t.isFunctionExpression(node.callee))) {
    const callee = node.callee
    if (t.isBlockStatement(callee.body)) {
      const replaceReturnsInStatements = (stmts: t.Statement[]): t.Statement[] =>
        stmts.map((stmt) => {
          if (t.isReturnStatement(stmt) && stmt.argument) {
            return t.returnStatement(replaceJSXInExpression(stmt.argument, mapJSXNodes, ctx))
          }
          if (t.isIfStatement(stmt)) {
            const consequent = t.isBlockStatement(stmt.consequent)
              ? t.blockStatement(replaceReturnsInStatements(stmt.consequent.body))
              : t.isReturnStatement(stmt.consequent) && stmt.consequent.argument
                ? t.returnStatement(replaceJSXInExpression(stmt.consequent.argument, mapJSXNodes, ctx))
                : stmt.consequent
            const alternate = stmt.alternate
              ? t.isBlockStatement(stmt.alternate)
                ? t.blockStatement(replaceReturnsInStatements(stmt.alternate.body))
                : t.isIfStatement(stmt.alternate)
                  ? (replaceReturnsInStatements([stmt.alternate])[0] as t.IfStatement)
                  : t.isReturnStatement(stmt.alternate) && stmt.alternate.argument
                    ? t.returnStatement(replaceJSXInExpression(stmt.alternate.argument, mapJSXNodes, ctx))
                    : stmt.alternate
              : null
            return t.ifStatement(stmt.test, consequent, alternate)
          }
          return stmt
        })

      const newBody = t.blockStatement(replaceReturnsInStatements(callee.body.body))
      return t.callExpression(
        t.isArrowFunctionExpression(callee)
          ? t.arrowFunctionExpression(callee.params, newBody, callee.async)
          : t.functionExpression(callee.id, callee.params, newBody, callee.generator, callee.async),
        node.arguments,
      )
    }
    const newBody = replaceJSXInExpression(callee.body as t.Expression, mapJSXNodes, ctx)
    return t.callExpression(t.arrowFunctionExpression(callee.params, newBody, callee.async), node.arguments)
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
    console.warn('[gea] Failed to transform JSX expression:', err instanceof Error ? err.message : err)
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

  if (tagName && isCompTag(tagName) && !ctx.imports.has(tagName) && !ctx.inChildrenProp) {
    const err = new Error(
      `[gea] Component '${tagName}' is used as a JSX tag but is not imported. Dynamic component tags are not supported; import the component statically.`,
    )
    ;(err as any).__geaCompileError = true
    throw err
  }

  if (isComp && ctx.componentInstances && !ctx.inMapCallback) {
    if (ctx.eventHandlers && ctx.sourceFile) {
      const importSource = ctx.imports.get(tagName!)
      if (importSource) {
        const delegatedEvents = getHoistableRootEventsForImport(ctx.sourceFile, importSource)
        delegatedEvents.forEach((meta) => {
          if (!EVENT_TYPES.has(meta.eventType)) return
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
      const rawChildPrefix = elementPath.length > 0 ? elementPath.join(' > ') : undefined
      const childPathPrefix =
        ctx.elementPathPrefix && rawChildPrefix
          ? ctx.elementPathPrefix + ' > ' + rawChildPrefix
          : (rawChildPrefix ?? ctx.elementPathPrefix)
      const childPropCtx = { ...ctx, inChildrenProp: true, elementPathPrefix: childPathPrefix }
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
        value: t.memberExpression(t.thisExpression(), t.identifier(instance.instanceVar)),
      })
      return
    }
  }

  // Components in map callbacks (both root and nested) produce real JS instances, not HTML strings.
  if (isComp) {
    const rawChildPrefix2 = elementPath.length > 0 ? elementPath.join(' > ') : undefined
    const childPathPrefix2 =
      ctx.elementPathPrefix && rawChildPrefix2
        ? ctx.elementPathPrefix + ' > ' + rawChildPrefix2
        : (rawChildPrefix2 ?? ctx.elementPathPrefix)
    const childPropCtx = { ...ctx, inChildrenProp: true, elementPathPrefix: childPathPrefix2 }
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
  let hasBindingId = false
  let userIdExprForEvents: t.Expression | undefined
  let hasDynamicUserId = false
  if (ctx.isRoot) {
    const rootPathKey = ''
    const rootUserIdExpr = ctx.elementPathToUserIdExpr?.get(rootPathKey)
    if (rootUserIdExpr) {
      if (t.isStringLiteral(rootUserIdExpr)) {
        html += ` id="${rootUserIdExpr.value}"`
        userIdExprForEvents = rootUserIdExpr
      } else {
        parts.push({ type: 'string', value: html + ' id="' })
        parts.push({ type: 'expression', value: t.cloneNode(rootUserIdExpr, true) })
        html = '"'
        hasDynamicUserId = true
      }
      parts.push({ type: 'string', value: html + ' data-gea-cid="' })
      parts.push({ type: 'expression', value: t.memberExpression(t.thisExpression(), t.identifier('id')) })
      html = '"'
    } else {
      parts.push({ type: 'string', value: html + ' id="' })
      parts.push({ type: 'expression', value: t.memberExpression(t.thisExpression(), t.identifier('id')) })
      html = '"'
    }
    hasBindingId = true
  } else {
    const rawPathKey = elementPath.join(' > ')
    const pathKey = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey : rawPathKey
    const bindingId =
      ctx.elementPathToBindingId?.get(pathKey) ??
      (ctx.elementPathPrefix ? undefined : ctx.elementPathToBindingId?.get(rawPathKey))
    if (bindingId !== undefined && bindingId !== '') {
      const userIdExpr =
        ctx.elementPathToUserIdExpr?.get(pathKey) ??
        (ctx.elementPathPrefix ? undefined : ctx.elementPathToUserIdExpr?.get(rawPathKey))
      if (userIdExpr) {
        if (t.isStringLiteral(userIdExpr)) {
          html += ` id="${userIdExpr.value}"`
          userIdExprForEvents = userIdExpr
        } else {
          parts.push({ type: 'string', value: html + ' id="' })
          parts.push({ type: 'expression', value: t.cloneNode(userIdExpr, true) })
          html = '"'
        }
      } else {
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
      hasBindingId = true
    }
  }
  if (ctx.inMapCallback && elementPath.length === 0 && ctx.mapItemVariable) {
    const itemVar = ctx.mapItemVariable
    const itemIdProp = ctx.mapItemIdProperty
    const itemIdExpr: t.Expression = ctx.mapKeyExpression
      ? t.callExpression(t.identifier('String'), [t.cloneNode(ctx.mapKeyExpression, true)])
      : itemIdProp && itemIdProp !== ITEM_IS_KEY
        ? t.logicalExpression('??', buildOptionalMemberChain(t.identifier(itemVar), itemIdProp), t.identifier(itemVar))
        : t.callExpression(t.identifier('String'), [t.identifier(itemVar)])

    {
      parts.push({ type: 'string', value: html + ' data-gea-item-id="' })
      parts.push({ type: 'expression', value: itemIdExpr })
      html = '"'
    }
  }
  let generatedEventSuffix: string | undefined
  let generatedEventToken: string | undefined
  let dangerouslySetInnerHTMLExpr: t.Expression | undefined
  node.openingElement.attributes.forEach((attr) => {
    if (t.isJSXSpreadAttribute(attr)) {
      const err = new Error(
        `[gea] Spread attributes (<${effectiveTag} {...expr} />) are not supported. Destructure props and pass them individually.`,
      )
      ;(err as any).__geaCompileError = true
      throw err
    }
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return
    const attrName = attr.name.name
    if (attrName === 'key') return
    if (attrName === 'id' && hasBindingId) return
    if (attrName === 'dangerouslySetInnerHTML') {
      const dsiValue = attr.value
      if (t.isJSXExpressionContainer(dsiValue) && !t.isJSXEmptyExpression(dsiValue.expression)) {
        dangerouslySetInnerHTMLExpr = dsiValue.expression as t.Expression
      }
      return
    }
    if (attrName === 'ref') {
      const attrValue = attr.value
      if (
        t.isJSXExpressionContainer(attrValue) &&
        !t.isJSXEmptyExpression(attrValue.expression) &&
        ctx.refBindings &&
        ctx.refCounter
      ) {
        const refId = `ref${ctx.refCounter.value++}`
        ctx.refBindings.push({ refId, targetExpr: attrValue.expression as t.Expression })
        html += ` data-gea-ref="${refId}"`
      }
      return
    }
    const attrValue = attr.value
    const propAttrName = toHtmlAttrName(attrName, isComp)
    const eventType = toGeaEventType(attrName)

    if (t.isJSXExpressionContainer(attrValue) && !t.isJSXEmptyExpression(attrValue.expression)) {
      if (!isComp && ctx.isRoot && EVENT_TYPES.has(eventType)) {
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

        if (!ctx.inMapCallback && ctx.isRoot && !hasDynamicUserId) {
          selectorExpression = userIdExprForEvents
            ? buildUserIdSelectorExpression(userIdExprForEvents)
            : buildEventSelectorExpression()
        } else {
          const rawPathKey2 = elementPath.join(' > ')
          const pathKey2 = ctx.elementPathPrefix ? ctx.elementPathPrefix + ' > ' + rawPathKey2 : rawPathKey2
          const bindingId =
            ctx.elementPathToBindingId?.get(pathKey2) ??
            (ctx.elementPathPrefix ? undefined : ctx.elementPathToBindingId?.get(rawPathKey2))
          if (!ctx.inMapCallback && bindingId !== undefined && !hasDynamicUserId) {
            selectorExpression = userIdExprForEvents
              ? buildUserIdSelectorExpression(userIdExprForEvents)
              : buildEventSelectorExpression(bindingId)
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
          } else if (explicitIdAttr) {
            const idExpr = getExplicitIdValueExpression(explicitIdAttr as t.JSXAttribute)
            if (!idExpr) {
              const err = new Error(
                `[gea] Event delegation requires id="..." or id={expr} when an id attribute is present on this element.`,
              )
              ;(err as any).__geaCompileError = true
              throw err
            }
            selectorExpression = buildUserIdSelectorExpression(idExpr)
          } else {
            if (!generatedEventToken) {
              generatedEventToken = `ev${ctx.eventIdCounter?.value ?? 0}`
              if (ctx.eventIdCounter) ctx.eventIdCounter.value += 1
              html += ` data-gea-event="${generatedEventToken}"`
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
            const propItemIdExpr: t.Expression =
              itemIdProp && itemIdProp !== ITEM_IS_KEY
                ? t.logicalExpression(
                    '??',
                    buildOptionalMemberChain(t.identifier(itemVar), itemIdProp),
                    t.identifier(itemVar),
                  )
                : t.callExpression(t.identifier('String'), [t.identifier(itemVar)])
            parts.push({ type: 'string', value: html })
            parts.push({
              type: 'expression',
              value: t.templateLiteral(
                [
                  t.templateElement({ raw: ` data-prop-item-id="`, cooked: ` data-prop-item-id="` }, false),
                  t.templateElement({ raw: '"', cooked: '"' }, true),
                ],
                [propItemIdExpr],
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
        if (propAttrName === 'class' && t.isObjectExpression(rawExpr)) {
          const staticClass = tryStaticClassObjectToString(rawExpr)
          if (staticClass !== null) {
            if (staticClass) {
              html += ` class="${staticClass}"`
            }
            return
          }
          parts.push({ type: 'string', value: html })
          const classExpr = buildTrimmedClassJoinedExpression(buildClassObjectExpression(rawExpr))
          parts.push({ type: 'string', value: ` class="` })
          parts.push({ type: 'expression', value: classExpr })
          html = '"'
          return
        }
        if (propAttrName === 'style' && t.isObjectExpression(rawExpr)) {
          const staticCSS = tryStaticStyleObjectToCSS(rawExpr)
          if (staticCSS) {
            html += ` style="${staticCSS}"`
            return
          }
          parts.push({ type: 'string', value: html })
          const styleExpr = t.callExpression(
            t.memberExpression(buildStyleObjectExpression(rawExpr), t.identifier('join')),
            [t.stringLiteral('; ')],
          )
          const skipCondition = buildAttrSkipCondition(styleExpr, rawExpr)
          if (t.isBooleanLiteral(skipCondition) && !skipCondition.value) {
            // Style object is always truthy — inline without guard
            parts.push({ type: 'string', value: ` style="` })
            parts.push({ type: 'expression', value: styleExpr })
            html = '"'
          } else {
            parts.push({
              type: 'expression',
              value: t.conditionalExpression(
                skipCondition,
                t.stringLiteral(''),
                t.templateLiteral(
                  [
                    t.templateElement({ raw: ' style="', cooked: ' style="' }, false),
                    t.templateElement({ raw: '"', cooked: '"' }, true),
                  ],
                  [styleExpr],
                ),
              ),
            })
            html = ''
          }
          return
        }
        parts.push({ type: 'string', value: html })
        const expr = transformJSXExpression(rawExpr, ctx)
        const skipCondition = buildAttrSkipCondition(expr, rawExpr)
        const sanitizedExpr = wrapWithSanitizeAttr(propAttrName, expr)
        const templateExpr = propAttrName === 'class' ? buildTrimmedClassValueExpression(expr) : sanitizedExpr
        if (t.isBooleanLiteral(skipCondition) && !skipCondition.value) {
          // Attribute is always present — inline it without a conditional wrapper
          parts.push({ type: 'string', value: ` ${propAttrName}="` })
          parts.push({ type: 'expression', value: templateExpr })
          html = '"'
        } else {
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
      }
    } else if (t.isStringLiteral(attrValue)) {
      html += ` ${propAttrName}="${attrValue.value}"`
    } else if (attrValue === null) {
      html += ` ${propAttrName}`
    }
  })

  if (dangerouslySetInnerHTMLExpr) {
    html += '>'
    parts.push({ type: 'string', value: html })
    parts.push({ type: 'expression', value: dangerouslySetInnerHTMLExpr })
    appendString(parts, `</${effectiveTag}>`)
  } else if (node.openingElement.selfClosing) {
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
        let condExpr = transformJSXExpression(rawExpr, { ...ctx, elementPathPrefix: '__cs_' + slot.slotId })
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
        if (!ctx.inChildrenProp && (t.isArrowFunctionExpression(rawExpr) || t.isFunctionExpression(rawExpr))) {
          const err = new Error(
            `[gea] Function-as-child ({(ctx) => ...}) is not supported. Pass callback functions via named props instead (e.g., renderItem={...}).`,
          )
          ;(err as any).__geaCompileError = true
          throw err
        }
        pushString(parts, '')
        let expr = transformJSXExpression(rawExpr, ctx)
        const stateSlots = ctx.stateChildSlots
        const stateCounter = ctx.stateChildSlotCounter
        const childCallInfo =
          stateSlots && stateCounter && expressionMayBeFalsy(rawExpr) ? extractChildInstanceRef(expr) : null
        if (childCallInfo && stateSlots && stateCounter) {
          const markerId = `sc${stateCounter.value}`
          stateCounter.value++
          const setupStatements = collectTemplateSetupStatements(childCallInfo.guardExpr, ctx.templateSetupContext)
          stateSlots.push({
            markerId,
            childInstanceVar: childCallInfo.instanceVar,
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
        // Wrap plain text expressions with __escapeHtml to prevent XSS.
        // Skip escaping for:
        // - State child slot expressions (childCallInfo != null): compiler-generated HTML
        // - props.children references: contain HTML from parent component
        // - Expressions containing JSX: produce compiler-generated HTML
        // - Map callback expressions: item properties may hold component instances
        //   whose toString() returns HTML (e.g. {item.content} in Tabs)
        const skipEscape =
          childCallInfo || isChildrenPropAccess(rawExpr) || expressionContainsJSX(rawExpr) || ctx.inMapCallback
        const safeExpr = skipEscape
          ? expr
          : t.callExpression(t.identifier('__escapeHtml'), [
              t.callExpression(t.identifier('String'), [expr]),
            ])
        parts.push({ type: 'expression', value: safeExpr })
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

function buildUserIdSelectorExpression(userIdExpr: t.Expression): t.Expression {
  if (t.isStringLiteral(userIdExpr)) {
    return t.stringLiteral(`#${userIdExpr.value}`)
  }
  return t.templateLiteral(
    [t.templateElement({ raw: '#', cooked: '#' }, false), t.templateElement({ raw: '', cooked: '' }, true)],
    [t.cloneNode(userIdExpr, true)],
  )
}

/** User-authored `id={...}` / `id="..."` — use #id delegation only; never emit data-gea-event for this element. */
function getExplicitIdValueExpression(attr: t.JSXAttribute | undefined): t.Expression | undefined {
  if (!attr || !t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || attr.name.name !== 'id') return undefined
  const v = attr.value
  if (t.isStringLiteral(v)) return t.stringLiteral(v.value)
  if (t.isJSXExpressionContainer(v) && !t.isJSXEmptyExpression(v.expression)) return v.expression as t.Expression
  return undefined
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
