import { t } from '../../utils/babel-interop.ts'

export function createItemBodyReferencesRowDisposer(fn: any): boolean {
  if (!t.isArrowFunctionExpression(fn) || !t.isBlockStatement(fn.body)) return true
  const param3 = fn.params[2]
  const dName = t.isIdentifier(param3) ? param3.name : 'd'
  const safeCallees = new Set(['delegateEvent'])
  let found = false
  const walk = (node: any, inSafeCall: boolean): void => {
    if (found || !node || typeof node !== 'object') return
    if (t.isIdentifier(node, { name: dName })) {
      if (!inSafeCall) found = true
      return
    }
    const isSafeCall =
      t.isCallExpression(node) && t.isIdentifier(node.callee) && safeCallees.has((node.callee as any).name)
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue
      const v = (node as any)[k]
      if (Array.isArray(v)) {
        for (const n of v) walk(n, isSafeCall || inSafeCall)
      } else if (v && typeof v === 'object' && typeof v.type === 'string') {
        walk(v, isSafeCall || inSafeCall)
      }
    }
  }
  walk(fn.body, false)
  return found
}

export function createItemBodyReferencesItemInReactiveGetter(fn: any, itemName: string): boolean {
  if (!t.isArrowFunctionExpression(fn) || !t.isBlockStatement(fn.body)) return false
  const reactiveCallees = new Set([
    'reactiveText',
    'reactiveTextValue',
    'reactiveAttr',
    'reactiveBool',
    'reactiveBoolAttr',
    'reactiveClass',
    'reactiveStyle',
    'reactiveValue',
    'reactiveValueRead',
  ])
  let found = false
  const walkExpr = (e: any): void => {
    if (found || !e || typeof e !== 'object') return
    if (t.isIdentifier(e, { name: itemName })) {
      found = true
      return
    }
    for (const k of Object.keys(e)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue
      const v = (e as any)[k]
      if (Array.isArray(v)) {
        for (const n of v) walkExpr(n)
      } else if (v && typeof v === 'object' && typeof v.type === 'string') walkExpr(v)
    }
  }

  for (const stmt of fn.body.body) {
    if (!t.isExpressionStatement(stmt) || !t.isCallExpression(stmt.expression)) continue
    const call = stmt.expression
    if (!t.isIdentifier(call.callee) || !reactiveCallees.has(call.callee.name)) continue
    const last = call.arguments[call.arguments.length - 1]
    if (t.isArrowFunctionExpression(last) || t.isFunctionExpression(last)) {
      walkExpr((last as any).body)
      if (found) return true
    }
  }
  return false
}
