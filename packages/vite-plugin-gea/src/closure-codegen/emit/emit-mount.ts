import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from './emit-context.ts'
import { compileJsxToBlock } from './emit-core.ts'
import { substituteBindings } from './emit-substitution.ts'
import { containsJsx, lowerJsxInExpression } from './emit-jsx-lowering.ts'
import { buildMapBranchFn } from './emit-map-branch.ts'
import { PROP_JSX_HELPER } from './prop-jsx-helper.ts'
import type { Slot } from '../generator.ts'

export function emitMountSlot(slot: Slot, stmts: Statement[], ctx: EmitContext): void {
  const anchorId = t.identifier('anchor' + slot.index)
  const tag: string = slot.payload.tag
  const attrs: any[] = slot.payload.attrs
  const children: any[] | undefined = slot.payload.children
  const propsObj = buildPropsObject(attrs, ctx)
  // If the component tag had JSX children, synthesize a `children` prop whose
  // value is a fresh Node on each read. Callers like `<Card>text</Card>` pass
  // children to the component's `{props.children}` slot.
  if (children && children.length > 0) {
    const meaningful = children.filter((c: any) => !(t.isJSXText(c) && /^\s*$/.test(c.value)))
    if (meaningful.length > 0) {
      const hasChildrenAttr = attrs.some(
        (a: any) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: 'children' }),
      )
      if (!hasChildrenAttr) {
        const childrenThunk = buildChildrenThunk(meaningful, ctx)
        if (childrenThunk) {
          ;(propsObj as any).properties.push(t.objectProperty(t.identifier('children'), childrenThunk))
        }
      }
    }
  }
  if (ctx.directClassComponents?.has(tag)) {
    emitDirectClassMount(tag, anchorId, propsObj, stmts, ctx, slot.index)
    return
  }
  if (ctx.directFactoryComponents?.has(tag)) {
    emitDirectFactoryMount(tag, anchorId, propsObj, stmts, slot.index)
    return
  }
  ctx.importsNeeded.add('mount')
  stmts.push(
    t.expressionStatement(
      t.callExpression(t.identifier('mount'), [
        t.identifier(tag),
        t.memberExpression(anchorId, t.identifier('parentNode')),
        propsObj,
        t.identifier('d'),
        anchorId,
        t.thisExpression(),
      ]),
    ),
  )
}

function emitDirectClassMount(
  tag: string,
  anchorId: Expression,
  propsObj: Expression,
  stmts: Statement[],
  ctx: EmitContext,
  slotIndex: number,
): void {
  ctx.importsNeeded.add('GEA_SET_PROPS')
  ctx.importsNeeded.add('GEA_PARENT_COMPONENT')
  const instId = t.identifier('__c' + slotIndex)
  const parentId = t.identifier('__p' + slotIndex)
  const setPropsId = t.identifier('__sp' + slotIndex)
  const elId = t.identifier('__el' + slotIndex)

  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(parentId, t.memberExpression(anchorId, t.identifier('parentNode'))),
    ]),
    t.variableDeclaration('const', [t.variableDeclarator(instId, t.newExpression(t.identifier(tag), []))]),
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(instId, t.identifier('GEA_PARENT_COMPONENT'), true),
        t.thisExpression(),
      ),
    ),
    t.variableDeclaration('const', [
      t.variableDeclarator(setPropsId, t.memberExpression(instId, t.identifier('GEA_SET_PROPS'), true)),
    ]),
    t.ifStatement(
      t.binaryExpression('===', t.unaryExpression('typeof', setPropsId), t.stringLiteral('function')),
      t.expressionStatement(t.callExpression(t.memberExpression(setPropsId, t.identifier('call')), [instId, propsObj])),
    ),
    t.expressionStatement(t.callExpression(t.memberExpression(instId, t.identifier('render')), [parentId])),
    t.variableDeclaration('const', [t.variableDeclarator(elId, t.memberExpression(instId, t.identifier('el')))]),
    t.ifStatement(
      t.logicalExpression(
        '&&',
        t.cloneNode(elId, true),
        t.binaryExpression('===', t.memberExpression(anchorId, t.identifier('parentNode')), parentId),
      ),
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.memberExpression(parentId, t.identifier('insertBefore')), [elId, anchorId]),
        ),
        t.ifStatement(
          t.memberExpression(anchorId, t.identifier('parentNode')),
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(t.memberExpression(anchorId, t.identifier('parentNode')), t.identifier('removeChild')),
              [anchorId],
            ),
          ),
        ),
      ]),
    ),
    t.expressionStatement(
      t.callExpression(t.memberExpression(t.identifier('d'), t.identifier('add')), [
        t.arrowFunctionExpression([], t.callExpression(t.memberExpression(instId, t.identifier('dispose')), [])),
      ]),
    ),
  )
}

function emitDirectFactoryMount(
  tag: string,
  anchorId: Expression,
  propsObj: Expression,
  stmts: Statement[],
  slotIndex: number,
): void {
  const thunksId = t.identifier('__th' + slotIndex)
  const propsId = t.identifier('__fp' + slotIndex)
  const keyId = t.identifier('__k' + slotIndex)
  const thunkId = t.identifier('__t' + slotIndex)
  const disposerId = t.identifier('__fd' + slotIndex)
  const outId = t.identifier('__out' + slotIndex)
  const directProps = buildDirectFactoryPropsObject(propsObj)

  if (directProps) {
    stmts.push(t.variableDeclaration('const', [t.variableDeclarator(propsId, directProps)]))
  } else {
    stmts.push(
      t.variableDeclaration('const', [t.variableDeclarator(thunksId, propsObj)]),
      t.variableDeclaration('const', [t.variableDeclarator(propsId, t.objectExpression([]))]),
      t.forInStatement(
        t.variableDeclaration('const', [t.variableDeclarator(keyId)]),
        thunksId,
        t.blockStatement([
          t.variableDeclaration('const', [
            t.variableDeclarator(thunkId, t.memberExpression(thunksId, t.cloneNode(keyId), true)),
          ]),
          t.ifStatement(
            t.binaryExpression('===', t.unaryExpression('typeof', thunkId), t.stringLiteral('function')),
            t.expressionStatement(
              t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('defineProperty')), [
                propsId,
                t.cloneNode(keyId),
                t.objectExpression([
                  t.objectProperty(t.identifier('enumerable'), t.booleanLiteral(true)),
                  t.objectProperty(t.identifier('configurable'), t.booleanLiteral(true)),
                  t.objectProperty(
                    t.identifier('get'),
                    t.arrowFunctionExpression([], t.callExpression(t.cloneNode(thunkId), [])),
                  ),
                ]),
              ]),
            ),
            t.expressionStatement(
              t.assignmentExpression('=', t.memberExpression(propsId, t.cloneNode(keyId), true), thunkId),
            ),
          ),
        ]),
      ),
    )
  }

  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        disposerId,
        t.callExpression(t.memberExpression(t.identifier('d'), t.identifier('child')), []),
      ),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(outId, t.callExpression(t.identifier(tag), [propsId, disposerId])),
    ]),
    t.ifStatement(
      t.logicalExpression(
        '&&',
        t.cloneNode(outId),
        t.binaryExpression(
          '===',
          t.unaryExpression('typeof', t.memberExpression(outId, t.identifier('nodeType'))),
          t.stringLiteral('number'),
        ),
      ),
      t.blockStatement([
        t.expressionStatement(t.callExpression(t.memberExpression(anchorId, t.identifier('replaceWith')), [outId])),
        t.expressionStatement(
          t.callExpression(t.memberExpression(disposerId, t.identifier('add')), [
            t.arrowFunctionExpression(
              [],
              t.blockStatement([
                t.ifStatement(
                  t.memberExpression(outId, t.identifier('parentNode')),
                  t.expressionStatement(
                    t.callExpression(
                      t.memberExpression(
                        t.memberExpression(outId, t.identifier('parentNode')),
                        t.identifier('removeChild'),
                      ),
                      [outId],
                    ),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ]),
    ),
  )
}

function buildDirectFactoryPropsObject(propsObj: Expression): Expression | null {
  if (!t.isObjectExpression(propsObj)) return null
  const properties: any[] = []
  for (const prop of propsObj.properties) {
    if (!t.isObjectProperty(prop)) return null
    if (!t.isIdentifier(prop.key) && !t.isStringLiteral(prop.key)) return null
    if (!t.isArrowFunctionExpression(prop.value) || prop.value.params.length > 0) return null
    if (containsThisExpression(prop.value.body)) return null
    const body = t.isBlockStatement(prop.value.body)
      ? t.cloneNode(prop.value.body, true)
      : t.blockStatement([t.returnStatement(t.cloneNode(prop.value.body, true) as Expression)])
    properties.push(t.objectMethod('get', t.cloneNode(prop.key, true), [], body, prop.computed))
  }
  return t.objectExpression(properties)
}

function containsThisExpression(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (t.isThisExpression(node)) return true
  if (Array.isArray(node)) return node.some(containsThisExpression)
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue
    if (containsThisExpression(node[key])) return true
  }
  return false
}

/**
 * Build a `() => children` thunk for a component's JSX children. Returns null
 * if the children can't be represented.
 *
 * JSX children build their Node once (see `memoizedThunk`), so the child's
 * `{props.children}` slot gets the same Node on every read. An expression
 * child goes through `buildExpressionThunk`, which keeps it live.
 */
function buildChildrenThunk(children: any[], ctx: EmitContext): Expression | null {
  if (children.length === 0) return null
  if (children.length === 1) {
    const c = children[0]
    if (t.isJSXText(c)) {
      return t.arrowFunctionExpression([], t.stringLiteral(c.value))
    }
    if (t.isJSXExpressionContainer(c)) {
      if (t.isJSXEmptyExpression(c.expression)) return null
      const substituted = substituteBindings(c.expression, ctx.bindings)
      // Special case: `xs.map(arrow => <JSX/>)` → compile as an inline
      // keyed-list wrapped in a span so the children prop resolves to a
      // single Node, not an array that has to go through fragment+remove/insert.
      if (
        t.isCallExpression(substituted) &&
        t.isMemberExpression(substituted.callee) &&
        !substituted.callee.computed &&
        t.isIdentifier(substituted.callee.property, { name: 'map' }) &&
        substituted.arguments.length >= 1 &&
        (t.isArrowFunctionExpression(substituted.arguments[0]) || t.isFunctionExpression(substituted.arguments[0]))
      ) {
        const arrow = substituted.arguments[0]
        const body: any = arrow.body
        const returned = t.isBlockStatement(body) ? body.body.find((s: any) => t.isReturnStatement(s))?.argument : body
        if (returned && (t.isJSXElement(returned) || t.isJSXFragment(returned))) {
          // Reuse buildMapBranchFn's structure: wrap branch fn invokes keyedList.
          // It returns an arrow `(d) => <span>...</span>`; we need `() => ...` instead.
          const branchFn = buildMapBranchFn(substituted, ctx) as any
          // branchFn.body is a BlockStatement returning the span. The keyed
          // list inside tracks the array itself, so the span is built once.
          return memoizedThunk(branchFn.body)
        }
      }
      return buildExpressionThunk(substituted, ctx, true)
    }
    if (t.isJSXElement(c) || t.isJSXFragment(c)) {
      return memoizedThunk(compileJsxToBlock(c, ctx))
    }
    return null
  }
  // Multiple children — wrap in a JSX fragment and recursively compile.
  const frag = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), children)
  return memoizedThunk(compileJsxToBlock(frag, ctx))
}

/**
 * Wrap a block expression (one that returns a Node) in a memoizing IIFE so
 * callers get the same Node on every invocation. Required for `children`
 * thunks so that child components' `{props.children}` slots don't re-clone
 * each time they're accessed.
 *
 *   (() => { let __c; return () => __c ?? (__c = <block>) })()
 */
function memoizedThunk(block: any): Expression {
  const inner = t.arrowFunctionExpression([], block)
  // IIFE: `(() => { let __c; return () => __c ?? (__c = (<inner>)()) })()`
  // which evaluates to a memoized thunk.
  const memoFn = t.arrowFunctionExpression(
    [],
    t.logicalExpression(
      '??',
      t.identifier('__c'),
      t.assignmentExpression('=', t.identifier('__c'), t.callExpression(inner, [])),
    ),
  )
  const outer = t.arrowFunctionExpression(
    [],
    t.blockStatement([
      t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__c'))]),
      t.returnStatement(memoFn),
    ]),
  )
  return t.callExpression(outer, [])
}

/**
 * Build the thunk for a prop or `children` expression.
 *
 * Every read re-runs the expression, so a condition like `cond ? <A /> : 'b'`
 * stays tracked by whoever reads the prop. Each JSX site the expression
 * evaluates directly builds its Node once while a read selects it and is
 * disposed by the first read that doesn't (see `PROP_JSX_HELPER`):
 *
 *   (() => {
 *     const __j = __geaPropJsx(d, 1, false);
 *     const __v = (d) => cond ? __j.site(0, (d) => { <A block> }) : 'b';
 *     return () => __j.read(__v);
 *   })()
 *
 * JSX inside a nested function (`xs.map((x) => <Row x={x} />)`) is built again
 * on every read. In `children` each read's JSX gets its own disposer, disposed
 * once the slot drops its nodes. A named prop with such JSX keeps a memo of its
 * whole value instead, as before, and so does a `children` function that the
 * read hands out (`(x) => <Row x={x} />`), which can build JSX after the read.
 */
function buildExpressionThunk(expr: any, ctx: EmitContext, isChildren: boolean): Expression {
  const nested = nestedFunctionJsx(expr)
  if (nested !== 'none' && !isChildren) {
    return memoizedThunk(t.blockStatement([t.returnStatement(lowerJsxInExpression(expr, ctx))]))
  }
  let sites = 0
  const value = lowerJsxInExpression(expr, ctx, (built: any) =>
    t.callExpression(t.memberExpression(t.identifier('__j'), t.identifier('site')), [
      t.numericLiteral(sites++),
      t.arrowFunctionExpression([t.identifier('d')], built.callee.body),
    ]),
  ) as Expression
  const perRead = nested === 'called'
  if (sites === 0 && !perRead) return t.arrowFunctionExpression([], value)
  ctx.importsNeeded.add(PROP_JSX_HELPER)
  if (perRead) ctx.importsNeeded.add('createDisposer')
  const outer = t.arrowFunctionExpression(
    [],
    t.blockStatement([
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__j'),
          t.callExpression(t.identifier(PROP_JSX_HELPER), [
            t.identifier('d'),
            t.numericLiteral(sites),
            t.booleanLiteral(perRead),
          ]),
        ),
      ]),
      t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier('__v'), t.arrowFunctionExpression([t.identifier('d')], value)),
      ]),
      t.returnStatement(
        t.arrowFunctionExpression(
          [],
          t.callExpression(t.memberExpression(t.identifier('__j'), t.identifier('read')), [t.identifier('__v')]),
        ),
      ),
    ]),
  )
  return t.callExpression(outer, [])
}

/**
 * Whether an expression has JSX inside a nested function, and whether each
 * such function runs during the read: `called` when every one is an argument
 * of a call (`xs.map((x) => <Row />)`), `escaping` when one is a value the
 * read hands out (`(x) => <Row x={x} />`).
 */
function nestedFunctionJsx(expr: any): 'none' | 'called' | 'escaping' {
  let found: 'none' | 'called' | 'escaping' = 'none'
  const visit = (node: any, isArgument: boolean): void => {
    if (!node || typeof node !== 'object' || found === 'escaping') return
    if (t.isJSXElement(node) || t.isJSXFragment(node)) return
    if (t.isFunction(node) && containsJsx(node)) found = isArgument ? 'called' : 'escaping'
    const isCall = t.isCallExpression(node) || t.isOptionalCallExpression(node) || t.isNewExpression(node)
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue
      const v = node[k]
      if (Array.isArray(v)) for (const x of v) visit(x, isCall && k === 'arguments')
      else visit(v, false)
    }
  }
  visit(expr, false)
  return found
}

/**
 * Build props for `mount()`: a `Record<string, () => any>` of thunks. Substitutes
 * destructured identifiers via ctx.bindings so thunks close over live sources.
 */
function buildPropsObject(attrs: any[], ctx: EmitContext): Expression {
  const properties: any[] = []
  for (const attr of attrs) {
    if (!t.isJSXAttribute(attr)) continue
    let name: string
    if (t.isJSXIdentifier(attr.name)) name = attr.name.name
    else if (t.isJSXNamespacedName(attr.name)) name = `${attr.name.namespace.name}:${attr.name.name.name}`
    else continue
    if (name === 'key') continue // consumed by keyedList, not a component prop
    let thunk: Expression
    if (!attr.value) thunk = t.arrowFunctionExpression([], t.booleanLiteral(true))
    else if (t.isStringLiteral(attr.value)) thunk = t.arrowFunctionExpression([], t.stringLiteral(attr.value.value))
    else if (t.isJSXExpressionContainer(attr.value)) {
      const sub = substituteBindings(attr.value.expression, ctx.bindings)
      thunk = buildExpressionThunk(sub, ctx, name === 'children')
    } else continue
    // Use a string-literal key for names that aren't valid JS identifiers
    // (e.g. `data-product-id`, `aria-label`, `xml:lang`).
    const isValidIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
    const keyNode = isValidIdent ? t.identifier(name) : t.stringLiteral(name)
    properties.push(t.objectProperty(keyNode, thunk, /* computed */ false))
  }
  return t.objectExpression(properties)
}
