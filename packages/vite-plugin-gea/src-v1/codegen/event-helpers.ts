import { t } from '../utils/babel-interop.ts'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseSource } from '../parse/parser.ts'
import { getTemplateParamBinding } from '../analyze/template-param-utils.ts'

export interface PropContext {
  propsParamName?: string
  destructuredPropNames: Set<string>
}

export interface HoistableRootEventMeta {
  eventType: string
  propName: string
  selector: string
}

export const EVENT_NAMES = new Set([
  'click', 'dblclick',
  'mousedown', 'mouseup', 'mouseover', 'mouseout', 'mousemove',
  'mouseenter', 'mouseleave', 'contextmenu',
  'keydown', 'keyup', 'keypress',
  'focus', 'blur', 'input', 'change', 'submit', 'scroll',
  'touchstart', 'touchmove', 'touchend',
  'tap', 'longTap',
  'swipeRight', 'swipeUp', 'swipeLeft', 'swipeDown',
  'drag', 'dragstart', 'dragend', 'dragover', 'dragleave', 'drop',
  'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave',
  'pointerover', 'pointerout', 'pointercancel',
  'resize', 'reset', 'wheel',
  'animationstart', 'animationend', 'animationiteration',
  'transitionstart', 'transitionend', 'transitionrun', 'transitioncancel',
])

export function toGeaEventType(attrName: string): string {
  if (attrName.startsWith('on') && attrName.length > 2) {
    return attrName.slice(2).toLowerCase()
  }
  return attrName
}

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

  context.propsParamName = 'props'
  binding.properties.forEach((prop) => {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      context.destructuredPropNames.add(prop.key.name)
    }
  })
  return context
}

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

function resolvePropCallbackName(
  expr: t.Expression,
  context: PropContext,
): string | null {
  if (t.isIdentifier(expr) && context.destructuredPropNames.has(expr.name)) return expr.name
  if (
    t.isMemberExpression(expr) &&
    t.isIdentifier(expr.property) &&
    t.isIdentifier(expr.object) &&
    expr.object.name === (context.propsParamName || 'props')
  ) return expr.property.name
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

export function getHoistableRootEvent(
  attrName: string,
  expr: t.Expression,
  elementPath: string[],
  context: PropContext,
  selector: string | null,
): HoistableRootEventMeta | null {
  if (elementPath.length !== 0 || !selector) return null
  const skip = new Set(['class', 'className', 'style', 'id'])
  if (attrName.startsWith('data-') || skip.has(attrName)) return null

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

function resolveImportPath(importer: string, source: string): string | null {
  const base = resolve(dirname(importer), source)
  const exts = ['', '.js', '.jsx', '.ts', '.tsx']
  const candidates = [...exts.map((e) => base + e), ...exts.slice(1).map((e) => resolve(base, `index${e}`))]
  return candidates.find((c) => existsSync(c)) ?? null
}

type RootJSXResult = { jsx: t.JSXElement; context: PropContext }

function findJSXReturn(stmts: t.Statement[]): t.JSXElement | null {
  for (const s of stmts) {
    if (t.isReturnStatement(s) && s.argument && t.isJSXElement(s.argument)) return s.argument
  }
  return null
}

function jsxFromFunctionBody(
  fn: t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration,
): t.JSXElement | null {
  if ('body' in fn && t.isJSXElement(fn.body)) return fn.body
  if ('body' in fn && t.isBlockStatement(fn.body)) return findJSXReturn(fn.body.body)
  return null
}

function jsxFromTemplateMethod(classBody: t.ClassBody): RootJSXResult | null {
  const m = classBody.body.find(
    (member) => t.isClassMethod(member) && t.isIdentifier(member.key) && member.key.name === 'template',
  ) as t.ClassMethod | undefined
  if (!m || !t.isBlockStatement(m.body)) return null
  const jsx = findJSXReturn(m.body.body)
  return jsx ? { jsx, context: getPropContext(m.params as (t.Identifier | t.Pattern | t.RestElement)[]) } : null
}

function getReturnedRootJSX(
  ast: t.File,
  componentClassName: string | null,
): RootJSXResult | null {
  for (const stmt of ast.program.body) {
    if (t.isExportDefaultDeclaration(stmt)) {
      const decl = stmt.declaration
      if (t.isFunctionDeclaration(decl) && decl.body) {
        const jsx = findJSXReturn(decl.body.body)
        if (jsx) return { jsx, context: getPropContext(decl.params) }
      }
      if (t.isIdentifier(decl)) {
        for (const bodyStmt of ast.program.body) {
          if (!t.isVariableDeclaration(bodyStmt)) continue
          for (const dec of bodyStmt.declarations) {
            if (!t.isIdentifier(dec.id, { name: decl.name }) || !dec.init) continue
            if (!t.isArrowFunctionExpression(dec.init) && !t.isFunctionExpression(dec.init)) continue
            const jsx = jsxFromFunctionBody(dec.init)
            if (jsx) return { jsx, context: getPropContext(dec.init.params) }
          }
        }
      }
      if (componentClassName && t.isClassDeclaration(decl) && t.isIdentifier(decl.id, { name: componentClassName })) {
        return jsxFromTemplateMethod(decl.body)
      }
    }
    if (!componentClassName || !t.isClassDeclaration(stmt) || !t.isIdentifier(stmt.id, { name: componentClassName }))
      continue
    const result = jsxFromTemplateMethod(stmt.body)
    if (result) return result
  }
  return null
}

const hoistableRootEventCache = new Map<string, HoistableRootEventMeta[]>()

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

export function clearCaches(): void {
  hoistableRootEventCache.clear()
}
