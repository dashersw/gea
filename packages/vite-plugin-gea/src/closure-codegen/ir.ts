import type { ClassDeclaration, Expression } from '@babel/types'
import { generate, t } from '../utils/babel-interop.ts'
import { walkJsxToTemplate, type Slot, type TemplateSpec } from './generator.ts'
import { isJsxOrNullish } from './generator/generator-jsx-helpers.ts'
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
  getters?: GeaIrStoreGetter[]
  constants?: GeaIrConstant[]
  sourceSpan?: GeaIrSourceSpan
}

// A getter (`get x() { ... }`) on a Store. Surfaced into the IR so the embedded
// target can back a reactive `{this.x.map(...)}` list with a derived array:
// `deps` are the reactive fields whose change should recompute the list, and
// `elementTypeName`/`shape` describe the row element type. (Getters are NOT
// regular fields — geatsc must CALL the getter, not read stored state.)
export interface GeaIrStoreGetter {
  name: string
  // True when the getter yields an array (array literal/spread, an
  // array-producing call like `.filter`/`.map`/`.slice`, or a `T[]`/`Array<T>`
  // return annotation). Only array getters can back a reactive list.
  returnsArray: boolean
  // The named element type from the return annotation (`get x(): Tile[]` →
  // 'Tile'); geatsc reuses its declared `__gea_type_<Name>` struct as the C++
  // element type.
  elementTypeName?: string
  shape?: GeaIrStoreValueShape
  // `this.<field>` reads inside the body — the reactive dependencies that
  // should re-run the list when they change.
  deps: string[]
  body: string
  ops?: GeaIrStoreStmt[]
  sourceSpan?: GeaIrSourceSpan
}

export interface GeaIrStoreField {
  name: string
  initializer?: string
  shape?: GeaIrStoreValueShape
}

export type GeaIrStoreValueShape =
  | { kind: 'array'; element?: GeaIrStoreValueShape; elementTypeName?: string }
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
  // TS type annotation on the parameter, projected to the same shape vocab the
  // store-field shapes use. Needed downstream by the C++ lowering pass so it
  // can avoid demoting string params to number in equality comparisons; see
  // `cpp-store-method-expressions.ts`'s `lowerBinary`.
  valueType?: 'string' | 'number' | 'boolean'
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
    const field: GeaIrStoreField = {
      name: member.key.name,
      ...(member.value ? { initializer: generate(member.value).code } : {}),
      ...(member.value ? shapeForExpression(member.value) : {}),
    }
    // When the field's storage shape is an array AND the TS type annotation
    // names a concrete interface element type (`cities: CityState[]`), thread
    // that interface name onto the array shape. The geatsc-side store lowering
    // uses it to decide whether the array can reuse geatsc's declared
    // `__gea_type_<Name>` struct as the C++ element type (instead of
    // synthesizing a parallel `<Store>_<field>_item` struct).
    if (field.shape?.kind === 'array') {
      const elementTypeName = arrayElementTypeNameFromAnnotation(member)
      if (elementTypeName) field.shape = { ...field.shape, elementTypeName }
    }
    fields.push(field)
  }
  return fields
}

// Read a class property's TS type annotation and, when it is `T[]` /
// `Array<T>` / `ReadonlyArray<T>` with a single named-type element, return the
// bare interface/type name `T`. Returns undefined for anonymous element types
// (`{ x: number }[]`), unions, or any unrecognised shape.
function arrayElementTypeNameFromAnnotation(member: import('@babel/types').ClassProperty): string | undefined {
  const annotation = member.typeAnnotation
  if (!annotation || !t.isTSTypeAnnotation(annotation)) return undefined
  return arrayElementTypeNameFromTSType(annotation.typeAnnotation)
}

// Given a TS type node, return the bare element interface name for `T[]` /
// `Array<T>` / `ReadonlyArray<T>` with a single named-type element; undefined
// for anonymous element types, unions, or non-array types.
function arrayElementTypeNameFromTSType(typeNode: import('@babel/types').TSType): string | undefined {
  if (t.isTSArrayType(typeNode)) {
    const element = typeNode.elementType
    if (t.isTSTypeReference(element) && t.isIdentifier(element.typeName)) return element.typeName.name
    return undefined
  }
  if (t.isTSTypeReference(typeNode) && t.isIdentifier(typeNode.typeName)) {
    const containerName = typeNode.typeName.name
    if (containerName !== 'Array' && containerName !== 'ReadonlyArray') return undefined
    const args = typeNode.typeParameters?.params
    if (!args || args.length !== 1) return undefined
    const element = args[0]
    if (t.isTSTypeReference(element) && t.isIdentifier(element.typeName)) return element.typeName.name
    return undefined
  }
  return undefined
}

const ARRAY_PRODUCING_METHODS = new Set([
  'filter',
  'map',
  'slice',
  'concat',
  'flat',
  'flatMap',
  'sort',
  'toSorted',
  'reverse',
  'toReversed',
])

export function storeGettersToIr(classDecl: ClassDeclaration): GeaIrStoreGetter[] {
  const getters: GeaIrStoreGetter[] = []
  // Sibling field shapes, so a getter that derives from an array field
  // (`this.bricks.filter(...)`) can borrow that field's element shape.
  const fieldShapeByName = new Map<string, GeaIrStoreValueShape>()
  for (const field of storeFieldsToIr(classDecl)) {
    if (field.shape) fieldShapeByName.set(field.name, field.shape)
  }
  for (const member of classDecl.body.body) {
    if (!t.isClassMethod(member) || member.static || member.computed || member.kind !== 'get') continue
    if (!t.isIdentifier(member.key)) continue
    const returnType = member.returnType
    const elementTypeName =
      returnType && t.isTSTypeAnnotation(returnType)
        ? arrayElementTypeNameFromTSType(returnType.typeAnnotation)
        : undefined
    const deps = collectThisFieldReads(member.body)
    const elementShape = getterElementShape(member.body, deps, elementTypeName, fieldShapeByName)
    const returnsArray = !!elementTypeName || !!elementShape || getterBodyReturnsArray(member.body)
    const shape: GeaIrStoreValueShape | undefined = returnsArray
      ? {
          kind: 'array',
          ...(elementShape ? { element: elementShape } : {}),
          ...(elementTypeName ? { elementTypeName } : {}),
        }
      : undefined
    const ops = storeStmtsToIr(member.body.body)
    const getter: GeaIrStoreGetter = {
      name: member.key.name,
      returnsArray,
      deps,
      body: generate(member.body).code,
      ...(elementTypeName ? { elementTypeName } : {}),
      ...(shape ? { shape } : {}),
      ...(ops ? { ops } : {}),
      ...(sourceSpan(member) ? { sourceSpan: sourceSpan(member) } : {}),
    }
    getters.push(getter)
  }
  return getters
}

// Best-effort element (row) object shape for an array-returning getter. Tries
// the body first (an array literal, or a `.map(x => ({...}))` object literal),
// then borrows from a referenced array-of-objects field (`this.bricks.filter`)
// or any field whose element type name matches the getter's return annotation.
function getterElementShape(
  body: unknown,
  deps: string[],
  elementTypeName: string | undefined,
  fieldShapeByName: Map<string, GeaIrStoreValueShape>,
): GeaIrStoreValueShape | undefined {
  const arg = topLevelReturnArgument(body)
  const fromBody = arg ? elementShapeFromArrayExpression(arg, fieldShapeByName) : undefined
  if (fromBody) return fromBody
  if (elementTypeName) {
    for (const shape of fieldShapeByName.values()) {
      if (shape.kind === 'array' && shape.elementTypeName === elementTypeName && shape.element?.kind === 'object') {
        return shape.element
      }
    }
  }
  for (const dep of deps) {
    const shape = fieldShapeByName.get(dep)
    if (shape?.kind === 'array' && shape.element?.kind === 'object') return shape.element
  }
  return undefined
}

function elementShapeFromArrayExpression(
  expr: unknown,
  fieldShapeByName: Map<string, GeaIrStoreValueShape>,
): GeaIrStoreValueShape | undefined {
  if (t.isArrayExpression(expr)) {
    const first = expr.elements.find((element) => !!element && !t.isSpreadElement(element))
    if (!first) return undefined
    const shaped = shapeForExpression(first)
    return 'shape' in shaped ? shaped.shape : undefined
  }
  if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property)) {
    const method = expr.callee.property.name
    if (method === 'map') {
      const objectLiteral = mapCallbackObjectLiteral(expr.arguments[0])
      if (!objectLiteral) return undefined
      const shaped = shapeForExpression(objectLiteral)
      return 'shape' in shaped ? shaped.shape : undefined
    }
    // filter/slice/sort/etc. preserve element type → recurse into the receiver.
    if (ARRAY_PRODUCING_METHODS.has(method)) {
      return elementShapeFromArrayExpression(expr.callee.object, fieldShapeByName)
    }
  }
  if (t.isMemberExpression(expr) && t.isThisExpression(expr.object) && t.isIdentifier(expr.property)) {
    const shape = fieldShapeByName.get(expr.property.name)
    if (shape?.kind === 'array') return shape.element
  }
  return undefined
}

function mapCallbackObjectLiteral(callback: unknown): import('@babel/types').ObjectExpression | undefined {
  if (!callback || (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback))) return undefined
  const body = callback.body
  if (t.isObjectExpression(body)) return body
  if (t.isBlockStatement(body)) {
    for (const statement of body.body) {
      if (t.isReturnStatement(statement) && statement.argument && t.isObjectExpression(statement.argument)) {
        return statement.argument
      }
    }
  }
  return undefined
}

// First `return` argument that is NOT inside a nested function (so a getter's
// own return is found, not a `.map`/`.filter` callback's).
function topLevelReturnArgument(body: unknown): unknown {
  let result: unknown
  let done = false
  const visit = (value: unknown): void => {
    if (done || !value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const node = value as Record<string, unknown>
    const type = node.type
    if (type === 'FunctionExpression' || type === 'ArrowFunctionExpression' || type === 'FunctionDeclaration') return
    if (type === 'ReturnStatement') {
      result = node.argument
      done = true
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue
      visit(node[key])
    }
  }
  visit(body)
  return result
}

// True when a getter body's own `return` yields an array. Nested functions
// (e.g. a `.filter` callback) are skipped so their returns don't count.
function getterBodyReturnsArray(body: unknown): boolean {
  let found = false
  const visit = (value: unknown): void => {
    if (found || !value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const node = value as Record<string, unknown>
    const type = node.type
    if (type === 'FunctionExpression' || type === 'ArrowFunctionExpression' || type === 'FunctionDeclaration') return
    if (type === 'ReturnStatement' && isArrayProducingExpression(node.argument)) {
      found = true
      return
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue
      visit(node[key])
    }
  }
  visit(body)
  return found
}

function isArrayProducingExpression(expr: unknown): boolean {
  if (!expr || typeof expr !== 'object') return false
  const node = expr as Record<string, unknown>
  if (node.type === 'ArrayExpression') return true
  if (node.type === 'TSAsExpression' || node.type === 'TSNonNullExpression') return isArrayProducingExpression(node.expression)
  if (node.type === 'CallExpression') {
    const callee = node.callee as Record<string, unknown> | undefined
    const property = callee?.property as Record<string, unknown> | undefined
    if (callee?.type === 'MemberExpression' && property?.type === 'Identifier') {
      return ARRAY_PRODUCING_METHODS.has(property.name as string)
    }
  }
  return false
}

// Collect the names of `this.<field>` reads anywhere in a node (deduped). These
// are the reactive dependencies of a getter — when any changes, a list derived
// from the getter must recompute.
function collectThisFieldReads(node: unknown): string[] {
  const names = new Set<string>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const rec = value as Record<string, unknown>
    const object = rec.object as Record<string, unknown> | undefined
    const property = rec.property as Record<string, unknown> | undefined
    if (
      rec.type === 'MemberExpression' &&
      object?.type === 'ThisExpression' &&
      rec.computed !== true &&
      property?.type === 'Identifier'
    ) {
      names.add(property.name as string)
    }
    for (const key of Object.keys(rec)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue
      visit(rec[key])
    }
  }
  visit(node)
  return [...names]
}

export function storeMethodsToIr(classDecl: ClassDeclaration): GeaIrStoreMethod[] {
  const methods: GeaIrStoreMethod[] = []
  for (const member of classDecl.body.body) {
    if (!t.isClassMethod(member) || member.static || member.computed || member.kind !== 'method') continue
    if (!t.isIdentifier(member.key)) continue

    const params: GeaIrStoreMethodParam[] = []
    let unsupportedParam = false
    for (const param of member.params) {
      const assignment = t.isAssignmentPattern(param) ? param : null
      const identifier = t.isIdentifier(param)
        ? param
        : assignment && t.isIdentifier(assignment.left)
          ? assignment.left
          : null
      if (identifier) {
        const valueType = paramValueType(identifier) ?? (assignment ? paramDefaultValueType(assignment.right) : undefined)
        params.push(valueType ? { name: identifier.name, valueType } : { name: identifier.name })
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

function paramValueType(param: import('@babel/types').Identifier): 'string' | 'number' | 'boolean' | undefined {
  const annotation = param.typeAnnotation
  if (!annotation || !t.isTSTypeAnnotation(annotation)) return undefined
  const kind = annotation.typeAnnotation
  if (t.isTSStringKeyword(kind)) return 'string'
  if (t.isTSNumberKeyword(kind)) return 'number'
  if (t.isTSBooleanKeyword(kind)) return 'boolean'
  return undefined
}

function paramDefaultValueType(expr: import('@babel/types').Expression): 'string' | 'number' | 'boolean' | undefined {
  if (t.isStringLiteral(expr)) return 'string'
  if (t.isNumericLiteral(expr)) return 'number'
  if (t.isBooleanLiteral(expr)) return 'boolean'
  return undefined
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
  if (!isRecord(payload)) return payload

  if (slot.kind === 'keyed-list') {
    const cb = slot.payload?.mapCallback
    const row = keyedListRowIr(cb)
    return row ? { ...payload, ...row } : payload
  }

  // Conditional slots: the IR walker stored the consequent/alternate branches
  // as raw AST nodes. Walk each branch into its own sub-template so downstream
  // (the cpp direct-mount renderer) can render them without re-parsing the
  // generated `code` string. `mkFalse` may be null/undefined for the
  // `cond && <X/>` shorthand — leave alternateTemplate off in that case.
  if (slot.kind === 'conditional') {
    const result: Record<string, unknown> = { ...payload }
    const consequent = jsxNodeToTemplateIr(slot.payload?.mkTrue, bindings)
    if (consequent) result.consequentTemplate = consequent
    const alternate = jsxNodeToTemplateIr(slot.payload?.mkFalse, bindings)
    if (alternate) result.alternateTemplate = alternate
    return result
  }

  // Mount slots can carry JSX children (e.g. `<View class="x">{cond ? A : B}</View>`).
  // The JS-runtime path forwards those as `props.children`; the direct-mount
  // path can't lower an opaque JSX expression as text, so it would otherwise
  // drop everything inside. Walk the children into a fragment sub-template
  // and attach it as `childrenTemplate` so the inliner can splice it in at
  // the wrapper's `props.children` slot position.
  if (slot.kind === 'mount') {
    const children = slot.payload?.children
    const childrenTemplate = jsxChildrenToTemplateIr(children, bindings)
    if (childrenTemplate) return { ...payload, childrenTemplate }
  }

  return payload
}

function jsxNodeToTemplateIr(node: unknown, bindings: Map<string, Expression>): GeaIrTemplate | null {
  if (!node) return null
  if (t.isJSXElement(node) || t.isJSXFragment(node)) {
    return templateSpecToIr(walkJsxToTemplate(node), bindings)
  }
  if (t.isJSXExpressionContainer(node)) {
    const inner = node.expression
    if (t.isJSXElement(inner) || t.isJSXFragment(inner)) {
      return templateSpecToIr(walkJsxToTemplate(inner), bindings)
    }
    // Conditional/logical expressions don't materialise as JSX themselves but
    // are recognised by the JSX walker when they appear inside a JSXExpressionContainer.
    // Fall through to the wrapping path below so a nested ternary alternate
    // (e.g. the chain `foldEarlyReturnGuards` produces from multiple `if (cond)
    // return <X>` guards) still walks into a real sub-template instead of being
    // dropped.
    if (isWalkableConditionalExpression(inner)) return wrapAsFragmentTemplate(inner, bindings)
  }
  if (isWalkableConditionalExpression(node)) return wrapAsFragmentTemplate(node as any, bindings)
  return null
}

// Mirrors the walker's recognition (walk.ts): `cond ? <A> : <B>`, `cond && <X>`,
// `cond && xs.map(...)`. Anything else has no JSX shape we can lower into a
// template branch.
function isWalkableConditionalExpression(node: unknown): node is Expression {
  if (t.isConditionalExpression(node)) {
    return isJsxOrNullish(node.consequent) || isJsxOrNullish(node.alternate)
  }
  if (t.isLogicalExpression(node) && node.operator === '&&') {
    return isJsxOrNullish(node.right)
  }
  return false
}

function wrapAsFragmentTemplate(expression: Expression, bindings: Map<string, Expression>): GeaIrTemplate {
  const fragment = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxExpressionContainer(expression)])
  return templateSpecToIr(walkJsxToTemplate(fragment), bindings)
}

function jsxChildrenToTemplateIr(children: unknown, bindings: Map<string, Expression>): GeaIrTemplate | null {
  if (!Array.isArray(children) || children.length === 0) return null
  const hasContent = children.some(
    (c) =>
      t.isJSXElement(c) ||
      t.isJSXFragment(c) ||
      (t.isJSXExpressionContainer(c) && !t.isJSXEmptyExpression(c.expression)),
  )
  if (!hasContent) return null
  const fragment = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), children as any)
  return templateSpecToIr(walkJsxToTemplate(fragment), bindings)
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
