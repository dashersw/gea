import type {
  ClassDeclaration,
  Expression,
  Identifier,
  ObjectPattern,
  ObjectProperty,
  Statement,
  VariableDeclaration,
  VariableDeclarator,
} from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { collectBindings, compileJsxToBlock, createEmitContext, substituteBindings, type EmitContext } from '../emit.ts'
import { extractTemplateJsx, findTemplateMethod } from '../generator.ts'

export function extendsComponent(classDecl: ClassDeclaration): boolean {
  const sc = classDecl.superClass
  if (!sc) return false
  // Recognize the identifier `Component` directly (common case).
  if (t.isIdentifier(sc, { name: 'Component' })) return true
  // Any class with a `template()` method returning JSX is a gea component, regardless
  // of which intermediate base class it extends (e.g. ZagComponent in gea-ui).
  const templateMethod = findTemplateMethod(classDecl)
  if (!templateMethod) return false
  const jsx = extractTemplateJsx(templateMethod)
  return jsx != null
}

/** Recursive scan: does this Node tree contain any JSXElement or JSXFragment? */
export function bodyContainsJsx(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isJSXElement(node) || t.isJSXFragment(node)) return true
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = (node as any)[k]
    if (Array.isArray(v)) {
      for (const x of v) if (bodyContainsJsx(x)) return true
    } else if (v && typeof v === 'object') {
      if (bodyContainsJsx(v)) return true
    }
  }
  return false
}

export function canSkipComponentStoreProxy(classDecl: ClassDeclaration): boolean {
  if (!t.isIdentifier(classDecl.superClass, { name: 'Component' })) return false
  for (const member of classDecl.body.body as any[]) {
    if (member.static) continue
    if (t.isClassProperty(member) || t.isClassPrivateProperty(member)) return false
    if (t.isClassMethod(member) && member.kind === 'constructor') return false
    if (nodeContainsThis(member)) return false
  }
  return true
}

export function canUseStaticCompiledComponent(classDecl: ClassDeclaration): boolean {
  if (!t.isIdentifier(classDecl.superClass, { name: 'Component' })) return false
  for (const member of classDecl.body.body as any[]) {
    if (member.static) continue
    if (t.isClassProperty(member) || t.isClassPrivateProperty(member)) return false
    if (!t.isClassMethod(member)) return false
    if (member.kind !== 'method' || member.computed || member.key?.name !== 'template') return false
    if (member.params.length > 0) return false
    if (nodeContainsThis(member)) return false
  }
  return true
}

export function canUseLeanReactiveComponent(classDecl: ClassDeclaration): boolean {
  if (!t.isIdentifier(classDecl.superClass, { name: 'Component' })) return false
  for (const member of classDecl.body.body as any[]) {
    if (member.static) continue
    if (t.isClassPrivateMethod(member) || t.isClassPrivateProperty(member)) return false
    if (t.isClassProperty(member)) {
      if (member.computed || !t.isIdentifier(member.key)) return false
      if (nodeUsesUnsupportedArrayMutation(member.value)) return false
      continue
    }
    if (t.isClassMethod(member)) {
      if (member.kind === 'constructor' || member.kind === 'set') return false
      if (member.computed) return false
      if (nodeContainsSuper(member)) return false
      if (nodeUsesUnsupportedArrayMutation(member.body)) return false
      continue
    }
    return false
  }
  return true
}

export function canUseTinyReactiveComponent(classDecl: ClassDeclaration): boolean {
  if (!canUseLeanReactiveComponent(classDecl)) return false
  for (const member of classDecl.body.body as any[]) {
    if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
      if (member.key.name === 'created' || member.key.name === 'onAfterRender') return false
    }
    if (nodeContainsThisMember(member, 'id')) return false
    if (nodeContainsThisMember(member, '$')) return false
    if (nodeContainsThisMember(member, '$$')) return false
    if (nodeContainsThisMember(member, 'children')) return false
  }
  return true
}

export function nodeContainsThisMember(node: any, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isThisExpression(node.object) &&
    t.isIdentifier(node.property, { name })
  ) {
    return true
  }
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsThisMember(child, name)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsThisMember(node[key], name)) return true
  }
  return false
}

function nodeContainsSuper(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isSuper(node)) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsSuper(child)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeContainsSuper(node[key])) return true
  }
  return false
}

const UNSUPPORTED_LEAN_ARRAY_MUTATIONS = new Set([
  'splice',
  'pop',
  'shift',
  'unshift',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

function nodeUsesUnsupportedArrayMutation(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    !node.callee.computed &&
    t.isIdentifier(node.callee.property) &&
    UNSUPPORTED_LEAN_ARRAY_MUTATIONS.has(node.callee.property.name)
  ) {
    return true
  }
  const assigned = t.isAssignmentExpression(node) ? node.left : t.isUpdateExpression(node) ? node.argument : null
  if (
    assigned &&
    t.isMemberExpression(assigned) &&
    !assigned.computed &&
    t.isIdentifier(assigned.property, { name: 'length' })
  ) {
    return true
  }
  if (Array.isArray(node)) {
    for (const child of node) if (nodeUsesUnsupportedArrayMutation(child)) return true
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (nodeUsesUnsupportedArrayMutation(node[key])) return true
  }
  return false
}

function nodeContainsThis(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isThisExpression(node)) return true
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    const v = node[k]
    if (Array.isArray(v)) {
      for (const x of v) if (nodeContainsThis(x)) return true
    } else if (v && typeof v === 'object') {
      if (nodeContainsThis(v)) return true
    }
  }
  return false
}

function nodeContainsIdentifier(node: any, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isIdentifier(node, { name })) return true
  if (Array.isArray(node)) {
    for (const child of node) if (nodeContainsIdentifier(child, name)) return true
    return false
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
    if (nodeContainsIdentifier(node[k], name)) return true
  }
  return false
}

/** True if the function body returns a JSX expression (PascalCase name + JSX return). */
export function isFunctionComponent(fn: any): boolean {
  if (!fn.id || !t.isIdentifier(fn.id)) return false
  const name = fn.id.name
  if (!name || name[0] !== name[0].toUpperCase()) return false
  // Look for a return <JSX/> in the body
  if (!fn.body || !t.isBlockStatement(fn.body)) return false
  for (const stmt of fn.body.body) {
    if (t.isReturnStatement(stmt) && stmt.argument) {
      if (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument)) return true
    }
  }
  return false
}

/**
 * Rewrite a function component body so it becomes a `(props, d) => Element`
 * usable by the new runtime's `mount()` (mount calls it with the disposer).
 *
 * Reactive helpers inside the fn body use `props` as the reactive root
 * (since there's no `this`). Uses a per-fn EmitContext with reactiveRoot=props,
 * then merges its templates + imports into the parent ctx.
 */
export function rewriteFnComponent(fnDecl: any, parentCtx: EmitContext): void {
  const body = fnDecl.body.body as Statement[]
  let returnIdx = -1
  for (let i = 0; i < body.length; i++) {
    if (t.isReturnStatement(body[i])) {
      returnIdx = i
      break
    }
  }
  if (returnIdx < 0) return
  const ret = body[returnIdx] as any
  if (!ret.argument || !(t.isJSXElement(ret.argument) || t.isJSXFragment(ret.argument))) return
  const jsxRoot = ret.argument

  const fnCtx = createEmitContext(t.identifier('props'))
  const fnName = t.isIdentifier(fnDecl.id) ? fnDecl.id.name : ''
  fnCtx.oneShotProps = parentCtx.directFnComponents?.has(fnName) === true
  const directParams = fnCtx.oneShotProps ? parentCtx.directFnComponentParams?.get(fnName) : undefined
  // Share the tpl/list counters with the parent so hoisted _tplN names don't collide
  fnCtx.tplCounter = parentCtx.tplCounter
  fnCtx.listCounter = parentCtx.listCounter
  fnCtx.directFnComponents = parentCtx.directFnComponents
  fnCtx.directFnComponentParams = parentCtx.directFnComponentParams
  fnCtx.directFnStringProps = parentCtx.directFnStringProps
  fnCtx.directFnNoDisposer = parentCtx.directFnNoDisposer
  fnCtx.directClassComponents = parentCtx.directClassComponents
  // Share IR template recording with the parent so functional components also
  // produce an IR template record. Without this, `emit-core.ts` skips the
  // `irTemplates.push(...)` because the function's `fnCtx.currentIrComponent`
  // is unset, and `buildModuleIr` can't find a template record for the function
  // component name in `rewritten`, so the component is silently dropped from
  // the IR. Class components don't have this problem because they share the
  // parent ctx directly.
  if (parentCtx.irTemplates && fnName) {
    fnCtx.irTemplates = parentCtx.irTemplates
    fnCtx.currentIrComponent = fnName
    fnCtx.currentIrRuntimeBase = 'reactive'
  }
  if (fnCtx.oneShotProps) {
    fnCtx._inKeyedListRow = true
    fnCtx._rowEventTypes = new Set()
    fnCtx._rowFastEventTypes = new Set()
  }

  // PROPS DESTRUCTURING — the key fix for fn-component reactivity.
  // If the fn signature is `({ draft, onAdd })` we MUST NOT emit
  // `const { draft, onAdd } = props` because that captures the thunk
  // results once. Instead populate ctx.bindings so every identifier
  // reference in JSX expressions substitutes to `props.<name>` (which
  // hits the live thunk on each read). `const { … } = props` in the body
  // goes through the same path below.
  const propsLocals: Statement[] = []
  if (directParams) {
    fnDecl.params = directParams.locals.map((name) => t.identifier(name))
    fnCtx.oneShotPropLocals = new Set(directParams.locals)
    const stringProps = parentCtx.directFnStringProps?.get(fnName)
    if (stringProps) {
      fnCtx.oneShotStringPropLocals = new Set(
        directParams.locals.filter((local, index) => stringProps.has(directParams.props[index])),
      )
    }
  } else if (fnDecl.params.length >= 1 && t.isObjectPattern(fnDecl.params[0])) {
    propsLocals.push(...bindPropsPattern(fnDecl.params[0], 'let', fnCtx.bindings))
    fnDecl.params[0] = t.identifier('props')
  } else if (fnDecl.params.length === 0) {
    fnDecl.params.push(t.identifier('props'))
  } else if (!t.isIdentifier(fnDecl.params[0], { name: 'props' })) {
    fnDecl.params[0] = t.identifier('props')
  }

  // Collect bindings from preceding `const X = expr` declarations so reactive
  // getters substitute X transitively (X → its RHS → further bindings).
  // Must happen BEFORE compileJsxToBlock so the JSX walker sees the bindings.
  const precedingRaw: Statement[] = [...propsLocals]
  for (let i = 0; i < returnIdx; i++) {
    const s = body[i]
    if (t.isVariableDeclaration(s) && s.declarations.some(isPropsDestructure)) {
      const others = s.declarations.filter((decl) => !isPropsDestructure(decl))
      for (const decl of s.declarations) {
        if (!isPropsDestructure(decl)) continue
        const locals = bindPropsPattern(decl.id as ObjectPattern, s.kind, fnCtx.bindings)
        precedingRaw.push(...locals)
        propsLocals.push(...locals)
      }
      if (others.length > 0) precedingRaw.push(t.variableDeclaration(s.kind, others))
      continue
    }
    precedingRaw.push(s)
  }
  // collectBindings is imported from emit.ts. Props locals stay real
  // variables, so they must not be inlined as bindings.
  collectBindings(
    precedingRaw.filter((s) => !propsLocals.includes(s)),
    fnCtx.bindings,
  )

  const jsxBlock = compileJsxToBlock(jsxRoot, fnCtx)
  if (
    fnCtx.oneShotProps &&
    fnName &&
    ((fnCtx._rowEventTypes?.size ?? 0) > 0 || (fnCtx._rowFastEventTypes?.size ?? 0) > 0)
  ) {
    const directFnEventTypes = parentCtx.directFnEventTypes ?? (parentCtx.directFnEventTypes = new Map())
    directFnEventTypes.set(fnName, {
      eventTypes: new Set(fnCtx._rowEventTypes),
      fastEventTypes: new Set(fnCtx._rowFastEventTypes),
    })
  }
  parentCtx.tplCounter = fnCtx.tplCounter
  parentCtx.listCounter = fnCtx.listCounter
  parentCtx.templateDecls.push(...fnCtx.templateDecls)
  for (const imp of fnCtx.importsNeeded) parentCtx.importsNeeded.add(imp)

  const precedingStmts: Statement[] = precedingRaw.map((s) => substituteBindings(s, fnCtx.bindings))
  const newBody = precedingStmts.concat(jsxBlock.body)
  const usesDisposer = nodeContainsIdentifier(newBody, 'd')
  if (!usesDisposer && fnName) parentCtx.directFnNoDisposer?.add(fnName)

  if (directParams) {
    fnDecl.params = directParams.locals.map((name) => t.identifier(name))
    if (usesDisposer) fnDecl.params.push(t.identifier('d'))
  } else if (usesDisposer) {
    if (fnDecl.params.length < 2) fnDecl.params.push(t.identifier('d'))
    else fnDecl.params[1] = t.identifier('d')
  }

  fnDecl.body.body = newBody
}

function isPropsDestructure(decl: VariableDeclarator): boolean {
  return t.isObjectPattern(decl.id) && t.isIdentifier(decl.init, { name: 'props' })
}

/**
 * Bind a props destructuring pattern so every name reads through `props` on
 * each access instead of capturing the value once:
 *   `{ title }`       → title = props.title
 *   `{ class: cls }`  → cls = props.class
 *   `{ size = 'md' }` → size = props.size === undefined ? 'md' : props.size
 *   `{ ...rest }`     → a real local whose getters read through to `props`
 * Returns the statements that must stay in the body as real locals. Nested
 * patterns stay a plain destructure of `props`, as does the whole pattern when
 * a computed key makes the rest element's excluded keys unknown.
 */
function bindPropsPattern(
  pattern: ObjectPattern,
  kind: VariableDeclaration['kind'],
  bindings: Map<string, Expression>,
): Statement[] {
  const rest = pattern.properties.find((prop) => t.isRestElement(prop))
  const keys: string[] = []
  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) continue
    const key = staticPropKey(prop)
    if (key !== null) keys.push(key)
    else if (rest) return [t.variableDeclaration(kind, [t.variableDeclarator(pattern, t.identifier('props'))])]
  }

  const locals: Statement[] = []
  const nested: ObjectProperty[] = []
  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) continue
    const key = staticPropKey(prop)
    const value = prop.value
    if (key === null || !(t.isIdentifier(value) || (t.isAssignmentPattern(value) && t.isIdentifier(value.left)))) {
      nested.push(prop)
      continue
    }
    const read = () =>
      t.isValidIdentifier(key, false)
        ? t.memberExpression(t.identifier('props'), t.identifier(key))
        : t.memberExpression(t.identifier('props'), t.stringLiteral(key), true)
    if (t.isIdentifier(value)) {
      bindings.set(value.name, read())
    } else {
      bindings.set(
        (value.left as Identifier).name,
        t.conditionalExpression(
          t.binaryExpression('===', read(), t.identifier('undefined')),
          t.cloneNode(value.right, true),
          read(),
        ),
      )
    }
  }
  if (nested.length > 0) {
    locals.push(t.variableDeclaration(kind, [t.variableDeclarator(t.objectPattern(nested), t.identifier('props'))]))
  }

  if (rest && t.isIdentifier(rest.argument)) {
    // Same shape as the direct factory props object in emit-mount.ts: one
    // enumerable getter per remaining prop, so reads stay live.
    const restId = t.identifier(rest.argument.name)
    const keyId = t.identifier('__restKey')
    const define = t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('defineProperty')), [
        t.cloneNode(restId),
        t.cloneNode(keyId),
        t.objectExpression([
          t.objectProperty(t.identifier('enumerable'), t.booleanLiteral(true)),
          t.objectProperty(t.identifier('configurable'), t.booleanLiteral(true)),
          t.objectProperty(
            t.identifier('get'),
            t.arrowFunctionExpression([], t.memberExpression(t.identifier('props'), t.cloneNode(keyId), true)),
          ),
        ]),
      ]),
    )
    const excluded = keys.map((key) => t.binaryExpression('!==', t.cloneNode(keyId), t.stringLiteral(key)))
    const test = excluded.reduce<Expression | null>(
      (acc, cur) => (acc ? t.logicalExpression('&&', acc, cur) : cur),
      null,
    )
    locals.push(
      t.variableDeclaration(kind, [t.variableDeclarator(restId, t.objectExpression([]))]),
      t.forInStatement(
        t.variableDeclaration('const', [t.variableDeclarator(keyId)]),
        t.identifier('props'),
        test ? t.ifStatement(test, define) : define,
      ),
    )
  }
  return locals
}

function staticPropKey(prop: ObjectProperty): string | null {
  if (!prop.computed && t.isIdentifier(prop.key)) return prop.key.name
  if (t.isStringLiteral(prop.key)) return prop.key.value
  if (t.isNumericLiteral(prop.key)) return String(prop.key.value)
  return null
}
