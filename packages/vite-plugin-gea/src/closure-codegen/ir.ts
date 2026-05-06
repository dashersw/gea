import type { ClassDeclaration } from '@babel/types'
import { generate, t } from '../utils/babel-interop.ts'
import { walkJsxToTemplate, type Slot, type TemplateSpec } from './generator.ts'

export interface GeaIrBundleV1 {
  schema: 'gea-ir'
  version: 1
  entry: string
  modules: GeaIrModule[]
  components: GeaIrComponent[]
  stores: GeaIrStore[]
  hostCapabilities: string[]
}

export interface GeaIrModule {
  id: string
  file: string
  components: string[]
  stores: string[]
}

export interface GeaIrComponent {
  id: string
  module: string
  exportName: string
  runtimeBase: GeaIrRuntimeBase
  template: GeaIrTemplate
  sourceSpan?: GeaIrSourceSpan
}

export type GeaIrRuntimeBase =
  | 'static'
  | 'static-element'
  | 'compiled'
  | 'tiny-reactive'
  | 'lean-reactive'
  | 'reactive'

export interface GeaIrTemplate {
  html: string
  slots: GeaIrSlot[]
}

export interface GeaIrSlot {
  index: number
  kind: Slot['kind']
  walk: number[]
  walkKinds?: Array<{ elem: number } | { child: number }>
  expr?: string
  exprPath?: string[]
  exprObjectFields?: GeaIrExpressionObjectField[]
  payload?: unknown
  directText?: boolean
}

export interface GeaIrExpressionObjectField {
  name: string
  expr: string
  exprPath?: string[]
}

export interface GeaIrStore {
  id: string
  module: string
  className: string
  runtimeBase: 'compiled' | 'lean'
  fields: GeaIrStoreField[]
  sourceSpan?: GeaIrSourceSpan
}

export interface GeaIrStoreField {
  name: string
  initializer?: string
  shape?: GeaIrStoreValueShape
}

export type GeaIrStoreValueShape =
  | { kind: 'array'; element?: GeaIrStoreValueShape }
  | { kind: 'object'; fields: GeaIrStoreField[] }
  | { kind: 'literal'; valueType: 'string' | 'number' | 'boolean' | 'null' }

export interface GeaIrSourceSpan {
  start?: number
  end?: number
}

export function componentIrId(moduleId: string, exportName: string): string {
  return `${moduleId}#${exportName}`
}

export function storeIrId(moduleId: string, className: string): string {
  return `${moduleId}#${className}`
}

export function templateSpecToIr(spec: TemplateSpec): GeaIrTemplate {
  return {
    html: spec.html,
    slots: spec.slots.map(slotToIr),
  }
}

export function storeFieldsToIr(classDecl: ClassDeclaration): GeaIrStoreField[] {
  const fields: GeaIrStoreField[] = []
  for (const member of classDecl.body.body) {
    if (!t.isClassProperty(member) || member.static || member.computed || !t.isIdentifier(member.key)) continue
    fields.push({
      name: member.key.name,
      ...(member.value ? { initializer: generate(member.value).code } : {}),
      ...(member.value ? shapeForExpression(member.value) : {}),
    })
  }
  return fields
}

export function sourceSpan(node: { start?: number | null; end?: number | null }): GeaIrSourceSpan | undefined {
  const span: GeaIrSourceSpan = {}
  if (typeof node.start === 'number') span.start = node.start
  if (typeof node.end === 'number') span.end = node.end
  return span.start === undefined && span.end === undefined ? undefined : span
}

function slotToIr(slot: Slot): GeaIrSlot {
  return {
    index: slot.index,
    kind: slot.kind,
    walk: slot.walk,
    ...(slot.walkKinds ? { walkKinds: slot.walkKinds } : {}),
    ...(slot.expr ? { expr: generate(slot.expr).code } : {}),
    ...(slot.expr ? expressionPathToIr(slot.expr) : {}),
    ...(slot.expr ? expressionObjectFieldsToIr(slot.expr) : {}),
    ...(slot.payload ? { payload: slotPayloadToIr(slot) } : {}),
    ...(slot.directText ? { directText: true } : {}),
  }
}

function expressionPathToIr(expr: unknown): { exprPath: string[] } | {} {
  const path = expressionPath(expr)
  return path && path.length > 0 ? { exprPath: path } : {}
}

function expressionPath(expr: unknown): string[] | null {
  if (t.isIdentifier(expr)) return [expr.name]
  if (t.isThisExpression(expr)) return ['this']
  if (t.isMemberExpression(expr) && !expr.computed) {
    const objectPath = expressionPath(expr.object)
    const property = t.isIdentifier(expr.property) ? expr.property.name : null
    return objectPath && property ? [...objectPath, property] : null
  }
  if (t.isOptionalMemberExpression(expr) && !expr.computed) {
    const objectPath = expressionPath(expr.object)
    const property = t.isIdentifier(expr.property) ? expr.property.name : null
    return objectPath && property ? [...objectPath, property] : null
  }
  return null
}

function expressionObjectFieldsToIr(expr: unknown): { exprObjectFields: GeaIrExpressionObjectField[] } | {} {
  if (!t.isObjectExpression(expr)) return {}
  const fields: GeaIrExpressionObjectField[] = []
  for (const property of expr.properties) {
    if (!t.isObjectProperty(property) || property.computed) continue
    const name = objectPropertyName(property.key)
    if (!name) continue
    fields.push({
      name,
      expr: generate(property.value).code,
      ...expressionPathToIr(property.value),
    })
  }
  return fields.length > 0 ? { exprObjectFields: fields } : {}
}

function slotPayloadToIr(slot: Slot): unknown {
  const payload = serializePayload(slot.payload)
  if (slot.kind !== 'keyed-list' || !isRecord(payload)) return payload

  const cb = slot.payload?.mapCallback
  const row = keyedListRowIr(cb)
  return row ? { ...payload, ...row } : payload
}

function keyedListRowIr(cb: unknown): { itemParam?: string; indexParam?: string; rowTemplate: GeaIrTemplate } | null {
  if (!t.isArrowFunctionExpression(cb) && !t.isFunctionExpression(cb)) return null
  const body = callbackJsxBody(cb.body)
  if (!body) return null
  const itemParam = callbackParamName(cb.params[0])
  const indexParam = callbackParamName(cb.params[1])
  return {
    ...(itemParam ? { itemParam } : {}),
    ...(indexParam ? { indexParam } : {}),
    rowTemplate: templateSpecToIr(walkJsxToTemplate(body)),
  }
}

function callbackJsxBody(body: unknown): unknown | null {
  if (t.isJSXElement(body) || t.isJSXFragment(body)) return body
  if (!t.isBlockStatement(body)) return null
  for (const statement of body.body) {
    if (!t.isReturnStatement(statement) || !statement.argument) continue
    if (t.isJSXElement(statement.argument) || t.isJSXFragment(statement.argument)) return statement.argument
  }
  return null
}

function callbackParamName(param: unknown): string | undefined {
  return t.isIdentifier(param) ? param.name : undefined
}

function serializePayload(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(serializePayload)
  if (isBabelNode(value)) {
    return {
      nodeType: value.type,
      code: generate(value).code,
    }
  }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) out[key] = serializePayload(child)
  return out
}

function isBabelNode(value: unknown): value is { type: string } {
  return !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function shapeForExpression(value: unknown): { shape: GeaIrStoreValueShape } | {} {
  if (t.isStringLiteral(value)) return { shape: { kind: 'literal', valueType: 'string' } }
  if (t.isNumericLiteral(value)) return { shape: { kind: 'literal', valueType: 'number' } }
  if (t.isBooleanLiteral(value)) return { shape: { kind: 'literal', valueType: 'boolean' } }
  if (t.isNullLiteral(value)) return { shape: { kind: 'literal', valueType: 'null' } }
  if (t.isArrayExpression(value)) {
    const firstElement = value.elements.find((element) => !!element && !t.isSpreadElement(element))
    const shapedElement = firstElement ? shapeForExpression(firstElement) : {}
    const elementShape = 'shape' in shapedElement ? shapedElement.shape : undefined
    return {
      shape: {
        kind: 'array',
        ...(elementShape ? { element: elementShape } : {}),
      },
    }
  }
  if (t.isObjectExpression(value)) {
    const fields: GeaIrStoreField[] = []
    for (const property of value.properties) {
      if (!t.isObjectProperty(property) || property.computed) continue
      const name = objectPropertyName(property.key)
      if (!name) continue
      fields.push({
        name,
        ...(property.value ? { initializer: generate(property.value).code } : {}),
        ...(property.value ? shapeForExpression(property.value) : {}),
      })
    }
    return { shape: { kind: 'object', fields } }
  }
  return {}
}

function objectPropertyName(key: unknown): string | null {
  if (t.isIdentifier(key)) return key.name
  if (t.isStringLiteral(key)) return key.value
  if (t.isNumericLiteral(key)) return String(key.value)
  return null
}
