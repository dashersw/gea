import * as t from '@babel/types'
import { DOM_EVENTS, ATTR_TO_PROP, DOM_PROPERTIES, toEventName } from '../utils.js'
import type { SubstitutionMap } from '../analyze/index.js'
import { substituteExpression, exprToString } from './jsx-expression.js'

export interface StaticAttr {
  kind: 'static'
  name: string // DOM property/attribute name (already mapped)
  value: string // string literal value
  isProperty: boolean // true if should be set as el.prop = val
}

export interface DynamicAttr {
  kind: 'dynamic'
  name: string
  expression: t.Expression // already substituted
  isProperty: boolean
}

export interface EventAttr {
  kind: 'event'
  event: string // e.g. "click"
  handler: t.Expression // already substituted
}

export type ClassifiedAttr = StaticAttr | DynamicAttr | EventAttr

/**
 * Classify JSX attributes into static, dynamic, or event categories.
 */
export function classifyAttributes(
  attrs: (t.JSXAttribute | t.JSXSpreadAttribute)[],
  subs: SubstitutionMap,
): ClassifiedAttr[] {
  const result: ClassifiedAttr[] = []

  for (const attr of attrs) {
    if (t.isJSXSpreadAttribute(attr)) {
      // We don't handle spread attributes in this version
      continue
    }

    const rawName = t.isJSXIdentifier(attr.name) ? attr.name.name : ''
    if (!rawName) continue

    // Skip 'key' — it's only for keyedList, not a real prop
    if (rawName === 'key') continue

    // Event attribute (direct lowercase or React-style on-prefix)
    const eventName = toEventName(rawName)
    if (eventName) {
      let handler: t.Expression
      if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
        handler = substituteExpression(attr.value.expression, subs)
      } else {
        continue // events must have expression values
      }
      result.push({ kind: 'event', event: eventName, handler })
      continue
    }

    // Map JSX name → DOM name
    const domName = ATTR_TO_PROP[rawName] || rawName
    const isProperty = DOM_PROPERTIES.has(domName)

    // String literal value → static
    if (t.isStringLiteral(attr.value)) {
      result.push({ kind: 'static', name: domName, value: attr.value.value, isProperty })
      continue
    }

    // Expression container
    if (t.isJSXExpressionContainer(attr.value) && t.isExpression(attr.value.expression)) {
      const expr = attr.value.expression

      // Static string in expression container: class={"foo"}
      if (t.isStringLiteral(expr)) {
        result.push({ kind: 'static', name: domName, value: expr.value, isProperty })
        continue
      }

      // Dynamic expression
      const substituted = substituteExpression(expr, subs)
      result.push({ kind: 'dynamic', name: domName, expression: substituted, isProperty })
      continue
    }

    // No value (boolean attribute like `disabled`)
    if (attr.value === null) {
      result.push({ kind: 'static', name: domName, value: 'true', isProperty })
      continue
    }
  }

  return result
}
