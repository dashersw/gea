/**
 * Shared JSX tree-walking utilities used by both the analysis phase
 * (template-walker.ts) and the codegen phase (gen-template.ts).
 *
 * Extracts the common traversal skeleton, element-path tracking,
 * attribute classification, and .map() callback detection so that
 * both consumers can focus on their phase-specific logic.
 */
import type * as T from '@babel/types'
import { t } from '../utils/babel-interop.ts'
import {
  getDirectChildElements,
  getJSXTagName,
} from '../codegen/jsx-utils.ts'
import { EVENT_NAMES, toGeaEventType } from '../codegen/event-helpers.ts'

// ─── Walk context ─────────────────────────────────────────────────

export interface WalkContext {
  elementPath: string[]
  childIndices: number[]
  inMapCallback: boolean
  mapItemVariable?: string
}

export function createWalkContext(overrides?: Partial<WalkContext>): WalkContext {
  return {
    elementPath: [],
    childIndices: [],
    inMapCallback: false,
    ...overrides,
  }
}

// ─── Visitor interface ────────────────────────────────────────────

export interface JsxVisitor<C = void> {
  onElement?(node: T.JSXElement, path: string[], ctx: WalkContext, custom: C): void
  onAttribute?(attr: T.JSXAttribute, element: T.JSXElement, path: string[], ctx: WalkContext, custom: C): void
  onTextChild?(node: T.JSXText, path: string[], ctx: WalkContext, custom: C): void
  onExpressionChild?(node: T.JSXExpressionContainer, path: string[], ctx: WalkContext, custom: C): void
  /** Return false to skip descending into this element's children. */
  shouldDescend?(node: T.JSXElement, ctx: WalkContext, custom: C): boolean
}

// ─── Shared recursive walker ──────────────────────────────────────

export function walkJSX<C = void>(
  root: T.JSXElement | T.JSXFragment,
  visitor: JsxVisitor<C>,
  ctx: WalkContext,
  custom: C,
): void {
  if (t.isJSXElement(root)) {
    walkElement(root, visitor, ctx, custom)
  } else if (t.isJSXFragment(root)) {
    walkChildren(root.children, visitor, ctx, custom)
  }
}

function walkElement<C>(
  node: T.JSXElement,
  visitor: JsxVisitor<C>,
  ctx: WalkContext,
  custom: C,
): void {
  visitor.onElement?.(node, ctx.elementPath, ctx, custom)

  for (const attr of node.openingElement.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
      visitor.onAttribute?.(attr, node, ctx.elementPath, ctx, custom)
    }
  }

  if (visitor.shouldDescend && !visitor.shouldDescend(node, ctx, custom)) return

  walkChildren(node.children, visitor, ctx, custom)
}

function walkChildren<C>(
  children: readonly (T.JSXText | T.JSXExpressionContainer | T.JSXSpreadChild | T.JSXElement | T.JSXFragment)[],
  visitor: JsxVisitor<C>,
  ctx: WalkContext,
  custom: C,
): void {
  const dc = getDirectChildElements(children)
  let dcIndex = 0

  for (const child of children) {
    if (t.isJSXText(child)) {
      visitor.onTextChild?.(child, ctx.elementPath, ctx, custom)
    } else if (t.isJSXElement(child)) {
      const seg = dc[dcIndex]?.selectorSegment
      dcIndex++
      const childPath = seg ? [...ctx.elementPath, seg] : ctx.elementPath
      const childCtx: WalkContext = { ...ctx, elementPath: childPath }
      walkElement(child, visitor, childCtx, custom)
    } else if (t.isJSXFragment(child)) {
      walkChildren(child.children, visitor, ctx, custom)
    } else if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
      visitor.onExpressionChild?.(child, ctx.elementPath, ctx, custom)
    }
  }
}

// ─── Attribute classification ─────────────────────────────────────

export type AttributeKind =
  | 'event'
  | 'class'
  | 'style'
  | 'value'
  | 'checked'
  | 'ref'
  | 'key'
  | 'id'
  | 'dangerouslySetInnerHTML'
  | 'generic'

export function isEventAttribute(name: string): boolean {
  return EVENT_NAMES.has(name) || EVENT_NAMES.has(toGeaEventType(name))
}

export function isInternalProp(name: string): boolean {
  return name === 'key' || name === 'ref'
}

export function classifyAttribute(name: string): AttributeKind {
  if (name === 'key') return 'key'
  if (name === 'ref') return 'ref'
  if (name === 'id') return 'id'
  if (name === 'dangerouslySetInnerHTML') return 'dangerouslySetInnerHTML'
  if (isEventAttribute(name)) return 'event'
  if (name === 'class' || name === 'className') return 'class'
  if (name === 'style') return 'style'
  if (name === 'value') return 'value'
  if (name === 'checked') return 'checked'
  return 'generic'
}

// ─── Map-call detection ───────────────────────────────────────────

export function isMapCall(expr: T.Expression | T.JSXEmptyExpression): boolean {
  return (
    t.isCallExpression(expr) &&
    t.isMemberExpression(expr.callee) &&
    t.isIdentifier(expr.callee.property) &&
    expr.callee.property.name === 'map'
  )
}

/** Get tag name from a JSXElement, forwarded from ast-helpers. */
export { getJSXTagName, getDirectChildElements }
