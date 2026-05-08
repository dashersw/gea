import type { ClassDeclaration, Expression } from '@babel/types'
import { generate, t } from '../utils/babel-interop.ts'
import { walkJsxToTemplate, type Slot, type TemplateSpec } from './generator.ts'
import { substituteBindings } from './emit/emit-substitution.ts'

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
  methods?: GeaIrStoreMethod[]
  constants?: GeaIrConstant[]
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

export interface GeaIrStoreMethod {
  name: string
  params: GeaIrStoreMethodParam[]
  body: string
  ops?: GeaIrStoreStmt[]
  sourceSpan?: GeaIrSourceSpan
}

export interface GeaIrStoreMethodParam {
  name: string
}

export interface GeaIrConstant {
  name: string
  value: string
  valueType: 'string' | 'number' | 'boolean' | 'null'
}

export type GeaIrStoreStmt =
  | { kind: 'var'; name: string; mutable?: boolean; init?: GeaIrStoreExpr }
  | { kind: 'assign'; target: GeaIrStoreExpr; value: GeaIrStoreExpr }
  | { kind: 'expr'; expr: GeaIrStoreExpr }
  | { kind: 'if'; test: GeaIrStoreExpr; consequent: GeaIrStoreStmt[]; alternate?: GeaIrStoreStmt[] }
  | { kind: 'for'; init?: GeaIrStoreStmt; test?: GeaIrStoreExpr; update?: GeaIrStoreExpr; body: GeaIrStoreStmt[] }
  | { kind: 'return'; value?: GeaIrStoreExpr }

export type GeaIrStoreExpr =
  | { kind: 'identifier'; name: string }
  | { kind: 'this' }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'member'; object: GeaIrStoreExpr; property: string; computed?: false }
  | { kind: 'index'; object: GeaIrStoreExpr; index: GeaIrStoreExpr }
  | { kind: 'call'; callee: GeaIrStoreExpr; args: GeaIrStoreExpr[] }
  | { kind: 'object'; fields: Array<{ name: string; value: GeaIrStoreExpr }> }
  | { kind: 'unary'; op: string; arg: GeaIrStoreExpr }
  | { kind: 'binary'; op: string; left: GeaIrStoreExpr; right: GeaIrStoreExpr }
  | { kind: 'logical'; op: string; left: GeaIrStoreExpr; right: GeaIrStoreExpr }
  | { kind: 'update'; op: string; arg: GeaIrStoreExpr; prefix: boolean }

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

export function templateSpecToIr(spec: TemplateSpec, bindings: Map<string, Expression> = new Map()): GeaIrTemplate {
  return {
    html: spec.html,
    slots: spec.slots.map((slot) => slotToIr(slot, bindings)),
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

export function storeMethodsToIr(classDecl: ClassDeclaration): GeaIrStoreMethod[] {
  const methods: GeaIrStoreMethod[] = []
  for (const member of classDecl.body.body) {
    if (!t.isClassMethod(member) || member.static || member.computed || member.kind !== 'method') continue
    if (!t.isIdentifier(member.key)) continue

    const params: GeaIrStoreMethodParam[] = []
    let unsupportedParam = false
    for (const param of member.params) {
      if (t.isIdentifier(param)) {
        params.push({ name: param.name })
      } else {
        unsupportedParam = true
        break
      }
    }
    if (unsupportedParam) continue

    const ops = storeStmtsToIr(member.body.body)
    methods.push({
      name: member.key.name,
      params,
      body: generate(member.body).code,
      ...(ops ? { ops } : {}),
      ...(sourceSpan(member) ? { sourceSpan: sourceSpan(member) } : {}),
    })
  }
  return methods
}

function storeStmtsToIr(statements: unknown[]): GeaIrStoreStmt[] | null {
  const out: GeaIrStoreStmt[] = []
  for (const statement of statements) {
    const converted = storeStmtToIr(statement)
    if (!converted) return null
    out.push(...converted)
  }
  return out
}

function storeStmtToIr(statement: unknown): GeaIrStoreStmt[] | null {
  if (t.isBlockStatement(statement)) return storeStmtsToIr(statement.body)
  if (t.isVariableDeclaration(statement)) {
    const declarations: GeaIrStoreStmt[] = []
    for (const declaration of statement.declarations) {
      if (!t.isIdentifier(declaration.id)) return null
      const init = declaration.init ? storeExprToIr(declaration.init) : undefined
      if (declaration.init && !init) return null
      declarations.push({ kind: 'var', name: declaration.id.name, mutable: statement.kind !== 'const', ...(init ? { init } : {}) })
    }
    return declarations
  }
  if (t.isExpressionStatement(statement)) {
    const expr = statement.expression
    if (t.isAssignmentExpression(expr) && expr.operator === '=') {
      const target = storeExprToIr(expr.left)
      const value = storeExprToIr(expr.right)
      return target && value ? [{ kind: 'assign', target, value }] : null
    }
    const converted = storeExprToIr(expr)
    return converted ? [{ kind: 'expr', expr: converted }] : null
  }
  if (t.isIfStatement(statement)) {
    const test = storeExprToIr(statement.test)
    const consequent = storeStatementList(statement.consequent)
    const alternate = statement.alternate ? storeStatementList(statement.alternate) : undefined
    if (!test || !consequent || (statement.alternate && !alternate)) return null
    return [{ kind: 'if', test, consequent, ...(alternate ? { alternate } : {}) }]
  }
  if (t.isForStatement(statement)) {
    const init = statement.init ? storeStmtToIr(t.isVariableDeclaration(statement.init) ? statement.init : t.expressionStatement(statement.init)) : undefined
    const test = statement.test ? storeExprToIr(statement.test) : undefined
    const update = statement.update ? storeExprToIr(statement.update) : undefined
    const body = storeStatementList(statement.body)
    if ((statement.init && (!init || init.length !== 1)) || (statement.test && !test) || (statement.update && !update) || !body) return null
    return [{ kind: 'for', ...(init ? { init: init[0] } : {}), ...(test ? { test } : {}), ...(update ? { update } : {}), body }]
  }
  if (t.isReturnStatement(statement)) {
    const value = statement.argument ? storeExprToIr(statement.argument) : undefined
    if (statement.argument && !value) return null
    return [{ kind: 'return', ...(value ? { value } : {}) }]
  }
  return null
}

function storeStatementList(statement: unknown): GeaIrStoreStmt[] | null {
  if (t.isBlockStatement(statement)) return storeStmtsToIr(statement.body)
  return storeStmtToIr(statement)
}

function storeExprToIr(expression: unknown): GeaIrStoreExpr | null {
  if (t.isIdentifier(expression)) return { kind: 'identifier', name: expression.name }
  if (t.isThisExpression(expression)) return { kind: 'this' }
  if (t.isNumericLiteral(expression)) return { kind: 'number', value: expression.value }
  if (t.isStringLiteral(expression)) return { kind: 'string', value: expression.value }
  if (t.isBooleanLiteral(expression)) return { kind: 'boolean', value: expression.value }
  if (t.isNullLiteral(expression)) return { kind: 'null' }
  if (t.isMemberExpression(expression)) {
    const object = storeExprToIr(expression.object)
    if (!object) return null
    if (expression.computed) {
      const index = storeExprToIr(expression.property)
      return index ? { kind: 'index', object, index } : null
    }
    return t.isIdentifier(expression.property) ? { kind: 'member', object, property: expression.property.name } : null
  }
  if (t.isCallExpression(expression)) {
    const callee = storeExprToIr(expression.callee)
    const args = expression.arguments.map((arg) => (t.isSpreadElement(arg) ? null : storeExprToIr(arg)))
    return callee && args.every((arg): arg is GeaIrStoreExpr => !!arg) ? { kind: 'call', callee, args } : null
  }
  if (t.isObjectExpression(expression)) {
    const fields: Array<{ name: string; value: GeaIrStoreExpr }> = []
    for (const property of expression.properties) {
      if (!t.isObjectProperty(property) || property.computed) return null
      const name = objectPropertyName(property.key)
      const value = storeExprToIr(property.value)
      if (!name || !value) return null
      fields.push({ name, value })
    }
    return { kind: 'object', fields }
  }
  if (t.isUnaryExpression(expression)) {
    const arg = storeExprToIr(expression.argument)
    return arg ? { kind: 'unary', op: expression.operator, arg } : null
  }
  if (t.isBinaryExpression(expression)) {
    const left = storeExprToIr(expression.left)
    const right = storeExprToIr(expression.right)
    return left && right ? { kind: 'binary', op: expression.operator, left, right } : null
  }
  if (t.isLogicalExpression(expression)) {
    const left = storeExprToIr(expression.left)
    const right = storeExprToIr(expression.right)
    return left && right ? { kind: 'logical', op: expression.operator, left, right } : null
  }
  if (t.isUpdateExpression(expression)) {
    const arg = storeExprToIr(expression.argument)
    return arg ? { kind: 'update', op: expression.operator, arg, prefix: expression.prefix } : null
  }
  return null
}

export function sourceSpan(node: { start?: number | null; end?: number | null }): GeaIrSourceSpan | undefined {
  const span: GeaIrSourceSpan = {}
  if (typeof node.start === 'number') span.start = node.start
  if (typeof node.end === 'number') span.end = node.end
  return span.start === undefined && span.end === undefined ? undefined : span
}

function slotToIr(slot: Slot, bindings: Map<string, Expression>): GeaIrSlot {
  const expr = slot.expr ? substituteBindings(slot.expr, bindings) : null
  return {
    index: slot.index,
    kind: slot.kind,
    walk: slot.walk,
    ...(slot.walkKinds ? { walkKinds: slot.walkKinds } : {}),
    ...(expr ? { expr: generate(expr).code } : {}),
    ...(expr ? expressionPathToIr(expr) : {}),
    ...(expr ? expressionObjectFieldsToIr(expr) : {}),
    ...(slot.payload ? { payload: slotPayloadToIr(slot, bindings) } : {}),
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

function slotPayloadToIr(slot: Slot, bindings: Map<string, Expression>): unknown {
  const payload = serializePayload(slot.payload, bindings)
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

function serializePayload(value: unknown, bindings: Map<string, Expression>): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((child) => serializePayload(child, bindings))
  if (isBabelNode(value)) {
    const node = substitutePayloadNode(value, bindings)
    return {
      nodeType: node.type,
      code: generate(node).code,
    }
  }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) out[key] = serializePayload(child, bindings)
  return out
}

function substitutePayloadNode(value: { type: string }, bindings: Map<string, Expression>): any {
  if (bindings.size === 0) return value
  if (
    t.isJSXAttribute(value) &&
    value.value &&
    t.isJSXExpressionContainer(value.value) &&
    !t.isJSXEmptyExpression(value.value.expression)
  ) {
    return {
      ...value,
      value: {
        ...value.value,
        expression: substituteBindings(value.value.expression, bindings),
      },
    }
  }
  if (t.isJSXExpressionContainer(value) && !t.isJSXEmptyExpression(value.expression)) {
    return { ...value, expression: substituteBindings(value.expression, bindings) }
  }
  return substituteBindings(value, bindings)
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
