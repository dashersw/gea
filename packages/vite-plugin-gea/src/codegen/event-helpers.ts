/**
 * Event helper functions for the Gea compiler codegen.
 *
 * Provides event name mappings, prop context extraction,
 * root-class selectors, and hoistable event detection for
 * child component event delegation.
 */
import { traverse, t } from '../utils/babel-interop.ts'
import type { NodePath } from '@babel/traverse'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseSource } from '../parse/parser.ts'
import { getTemplateParamBinding } from '../template-param-utils.ts'

// ─── Public types ───────────────────────────────────────────────────

export interface PropContext {
  propsParamName?: string
  destructuredPropNames: Set<string>
}

export interface HoistableRootEventMeta {
  eventType: string
  propName: string
  selector: string
}

// ─── Event name sets ────────────────────────────────────────────────

/** All event attribute names the compiler recognises (on* form). */
export const EVENT_NAMES = new Set([
  'click', 'dblclick',
  'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove',
  'keydown', 'keyup', 'keypress',
  'focus', 'blur', 'input', 'change', 'submit', 'scroll',
  'touchstart', 'touchmove', 'touchend',
  'tap', 'longTap',
  'swipeRight', 'swipeUp', 'swipeLeft', 'swipeDown',
  'dragstart', 'dragend', 'dragover', 'dragleave', 'drop',
])

// ─── Attribute-name to event-type conversion ────────────────────────

/**
 * Convert a JSX event attribute name (e.g. `onClick`) to its DOM
 * event type (e.g. `click`).
 */
export function toGeaEventType(attrName: string): string {
  if (attrName.startsWith('on') && attrName.length > 2) {
    const rest = attrName.slice(2)
    return rest.charAt(0).toLowerCase() + rest.slice(1)
  }
  return attrName
}

// ─── Template parameter context ─────────────────────────────────────

/**
 * Extract destructured prop names (or the whole-object param name)
 * from a template method's parameter list.
 */
export function getPropContext(
  params?: Array<t.Identifier | t.Pattern | t.RestElement>,
): PropContext {
  const context: PropContext = { destructuredPropNames: new Set() }
  const firstParam = params?.[0]
  if (!firstParam || t.isRestElement(firstParam)) return context

  const binding = getTemplateParamBinding(firstParam)
  if (!binding) return context

  if (t.isIdentifier(binding)) {
    context.propsParamName = binding.name
    return context
  }

  // ObjectPattern destructuring
  context.propsParamName = 'props'
  binding.properties.forEach((prop) => {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      context.destructuredPropNames.add(prop.key.name)
    }
  })
  return context
}

// ─── Root class selector ────────────────────────────────────────────

/**
 * Extract the first CSS class from a root element's class/className
 * attribute for use as a delegation selector (e.g. `.my-class`).
 */
export function getRootClassSelector(node: t.JSXElement): string | null {
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue
    if (attr.name.name !== 'class' && attr.name.name !== 'className') continue

    let firstClass = ''
    if (t.isStringLiteral(attr.value)) {
      firstClass = attr.value.value.trim().split(/\s+/)[0] || ''
    } else if (
      t.isJSXExpressionContainer(attr.value) &&
      !t.isJSXEmptyExpression(attr.value.expression)
    ) {
      const expr = attr.value.expression
      if (t.isStringLiteral(expr)) {
        firstClass = expr.value.trim().split(/\s+/)[0] || ''
      } else if (t.isTemplateLiteral(expr)) {
        firstClass = expr.quasis[0]?.value.raw.trim().split(/\s+/)[0] || ''
      }
    }
    if (firstClass) return `.${firstClass}`
  }
  return null
}

// ─── Prop callback resolution ───────────────────────────────────────

function resolvePropCallbackName(
  expr: t.Expression,
  context: PropContext,
): string | null {
  // Direct destructured prop: `onClick`
  if (t.isIdentifier(expr) && context.destructuredPropNames.has(expr.name)) {
    return expr.name
  }
  // `props.onClick`
  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.property) &&
    t.isIdentifier(expr.object) &&
    expr.object.name === (context.propsParamName || 'props')
  ) {
    return expr.property.name
  }
  // `this.props.onClick` or `props.props.onClick`
  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.property) &&
    t.isMemberExpression(expr.object) &&
    t.isIdentifier(expr.object.property) &&
    expr.object.property.name === 'props' &&
    (t.isThisExpression(expr.object.object) ||
      (t.isIdentifier(expr.object.object) &&
        expr.object.object.name === (context.propsParamName || 'props')))
  ) {
    return expr.property.name
  }
  return null
}

// ─── Hoistable root event detection ─────────────────────────────────

function extractSingleCallExpression(
  expr: t.Expression,
): t.CallExpression | null {
  if (t.isCallExpression(expr)) return expr
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
    if (t.isCallExpression(expr.body)) return expr.body
    if (!t.isBlockStatement(expr.body) || expr.body.body.length !== 1) return null
    const stmt = expr.body.body[0]
    if (t.isExpressionStatement(stmt) && t.isCallExpression(stmt.expression))
      return stmt.expression
    if (
      t.isReturnStatement(stmt) &&
      stmt.argument &&
      t.isCallExpression(stmt.argument)
    )
      return stmt.argument
  }
  return null
}

/**
 * Detect whether a root-element event handler can be hoisted to the
 * parent as a delegated prop callback.  Returns metadata on success.
 */
export function getHoistableRootEvent(
  attrName: string,
  expr: t.Expression,
  elementPath: string[],
  context: PropContext,
  selector: string | null,
): HoistableRootEventMeta | null {
  if (elementPath.length !== 0 || !selector) return null
  if (
    attrName.startsWith('data-') ||
    attrName === 'class' ||
    attrName === 'className' ||
    attrName === 'style' ||
    attrName === 'id'
  )
    return null

  const eventType = toGeaEventType(attrName)
  const directProp = resolvePropCallbackName(expr, context)
  if (directProp) return { eventType, propName: directProp, selector }

  const callExpr = extractSingleCallExpression(expr)
  if (!callExpr) return null
  const propName = resolvePropCallbackName(
    callExpr.callee as t.Expression,
    context,
  )
  if (!propName) return null
  return { eventType, propName, selector }
}

// ─── Cross-file root event analysis ─────────────────────────────────

function resolveImportPath(
  importer: string,
  source: string,
): string | null {
  const base = resolve(dirname(importer), source)
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.js'),
    resolve(base, 'index.jsx'),
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function getReturnedRootJSX(
  ast: t.File,
  componentClassName: string | null,
): { jsx: t.JSXElement; context: PropContext } | null {
  let found: { jsx: t.JSXElement; context: PropContext } | null = null

  for (const stmt of ast.program.body) {
    if (t.isExportDefaultDeclaration(stmt)) {
      const decl = stmt.declaration
      if (t.isFunctionDeclaration(decl) && decl.body) {
        const ret = decl.body.body.find(
          (node) =>
            t.isReturnStatement(node) &&
            node.argument &&
            t.isJSXElement(node.argument),
        )
        if (
          ret &&
          t.isReturnStatement(ret) &&
          ret.argument &&
          t.isJSXElement(ret.argument)
        ) {
          return { jsx: ret.argument, context: getPropContext(decl.params) }
        }
      }
      if (t.isIdentifier(decl)) {
        for (const bodyStmt of ast.program.body) {
          if (!t.isVariableDeclaration(bodyStmt)) continue
          for (const dec of bodyStmt.declarations) {
            if (!t.isIdentifier(dec.id, { name: decl.name })) continue
            if (
              !dec.init ||
              (!t.isArrowFunctionExpression(dec.init) &&
                !t.isFunctionExpression(dec.init))
            )
              continue
            const fn = dec.init
            if (t.isJSXElement(fn.body))
              return { jsx: fn.body, context: getPropContext(fn.params) }
            if (t.isBlockStatement(fn.body)) {
              const ret = fn.body.body.find(
                (node) =>
                  t.isReturnStatement(node) &&
                  node.argument &&
                  t.isJSXElement(node.argument),
              )
              if (
                ret &&
                t.isReturnStatement(ret) &&
                ret.argument &&
                t.isJSXElement(ret.argument)
              ) {
                return { jsx: ret.argument, context: getPropContext(fn.params) }
              }
            }
          }
        }
      }
      if (
        componentClassName &&
        t.isClassDeclaration(stmt.declaration) &&
        t.isIdentifier(stmt.declaration.id, { name: componentClassName })
      ) {
        const templateMethod = stmt.declaration.body.body.find(
          (member) =>
            t.isClassMethod(member) &&
            t.isIdentifier(member.key) &&
            member.key.name === 'template',
        ) as t.ClassMethod | undefined
        if (!templateMethod || !t.isBlockStatement(templateMethod.body))
          return null
        const ret = templateMethod.body.body.find(
          (node) =>
            t.isReturnStatement(node) &&
            node.argument &&
            t.isJSXElement(node.argument),
        )
        if (
          ret &&
          t.isReturnStatement(ret) &&
          ret.argument &&
          t.isJSXElement(ret.argument)
        ) {
          return {
            jsx: ret.argument,
            context: getPropContext(
              templateMethod.params as (
                | t.Identifier
                | t.Pattern
                | t.RestElement
              )[],
            ),
          }
        }
      }
    }
    if (
      !componentClassName ||
      !t.isClassDeclaration(stmt) ||
      !t.isIdentifier(stmt.id, { name: componentClassName })
    )
      continue
    const templateMethod = stmt.body.body.find(
      (member) =>
        t.isClassMethod(member) &&
        t.isIdentifier(member.key) &&
        member.key.name === 'template',
    ) as t.ClassMethod | undefined
    if (!templateMethod || !t.isBlockStatement(templateMethod.body)) continue
    const ret = templateMethod.body.body.find(
      (node) =>
        t.isReturnStatement(node) &&
        node.argument &&
        t.isJSXElement(node.argument),
    )
    if (
      ret &&
      t.isReturnStatement(ret) &&
      ret.argument &&
      t.isJSXElement(ret.argument)
    ) {
      found = {
        jsx: ret.argument,
        context: getPropContext(
          templateMethod.params as (t.Identifier | t.Pattern | t.RestElement)[],
        ),
      }
      break
    }
  }
  return found
}

const hoistableRootEventCache = new Map<string, HoistableRootEventMeta[]>()

/**
 * Analyse a child component file to discover root-element events
 * that can be delegated to the parent. Results are cached per file.
 */
export function getHoistableRootEventsForImport(
  importer: string,
  source: string,
): HoistableRootEventMeta[] {
  const resolved = resolveImportPath(importer, source)
  if (!resolved) return []
  const cached = hoistableRootEventCache.get(resolved)
  if (cached) return cached

  let result: HoistableRootEventMeta[]
  try {
    const code = readFileSync(resolved, 'utf8')
    const parsed = parseSource(code)
    if (!parsed) return []
    const root = getReturnedRootJSX(parsed.ast, parsed.componentClassName)
    if (!root) return []
    const selector = getRootClassSelector(root.jsx)
    if (!selector) return []

    result = root.jsx.openingElement.attributes.flatMap((attr) => {
      if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) return []
      if (
        !attr.value ||
        !t.isJSXExpressionContainer(attr.value) ||
        t.isJSXEmptyExpression(attr.value.expression)
      ) {
        return []
      }
      const meta = getHoistableRootEvent(
        attr.name.name,
        attr.value.expression as t.Expression,
        [],
        root.context,
        selector,
      )
      return meta ? [meta] : []
    })
  } catch (err) {
    console.warn(
      `[gea] Failed to analyze root events for ${resolved}:`,
      err instanceof Error ? err.message : err,
    )
    result = []
  }

  hoistableRootEventCache.set(resolved, result)
  return result
}

/** Clear all internal caches. Useful between test runs. */
export function clearCaches(): void {
  hoistableRootEventCache.clear()
}
