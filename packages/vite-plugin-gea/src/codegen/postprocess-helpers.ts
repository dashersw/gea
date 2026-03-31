/**
 * Post-processing utilities for compiled class methods: this.id caching,
 * events getter caching, and logging catch clause.
 */
import { t } from '../utils/babel-interop.ts'

export {
  collectValueSubpaths,
  wrapSubpathCacheGuards,
} from './subpath-cache.ts'

// ─── Post-processing: this.id caching ───────────────────────────────

export function cacheThisIdInMethod(method: t.ClassMethod): boolean {
  let found = false
  const replaceIn = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          const c = child[i]
          if (isThisIdMember(c)) {
            child[i] = t.identifier('__id')
            found = true
          } else {
            replaceIn(c)
          }
        }
      } else if (child && typeof child === 'object' && child.type) {
        if (isThisIdMember(child)) {
          ;(node as any)[key] = t.identifier('__id')
          found = true
        } else {
          replaceIn(child)
        }
      }
    }
  }
  replaceIn(method.body)
  if (found) {
    method.body.body.unshift(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__id'),
          t.memberExpression(t.thisExpression(), t.identifier('id')),
        ),
      ]),
    )
  }
  return found
}

function isThisIdMember(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    t.isThisExpression(node.object) &&
    t.isIdentifier(node.property, { name: 'id' }) &&
    !node.computed
  )
}

// ─── Post-processing: events getter cache ───────────────────────────

export function wrapEventsGetterWithCache(getter: t.ClassMethod): void {
  const body = getter.body.body
  const returnStmt = body.find(
    (s): s is t.ReturnStatement =>
      t.isReturnStatement(s) && s.argument !== null,
  )
  if (!returnStmt?.argument) return

  const cachedProp = t.memberExpression(
    t.thisExpression(),
    t.identifier('__evts'),
  )
  const elementProp = t.memberExpression(
    t.thisExpression(),
    t.identifier('element_'),
  )
  const tmpId = t.identifier('__geaEvtsResult')
  const objectExpr = returnStmt.argument as t.Expression

  const returnIndex = body.indexOf(returnStmt)
  body.splice(
    returnIndex,
    1,
    t.variableDeclaration('const', [t.variableDeclarator(tmpId, objectExpr)]),
    t.ifStatement(
      elementProp,
      t.expressionStatement(
        t.assignmentExpression('=', cachedProp, t.cloneNode(tmpId, true)),
      ),
    ),
    t.returnStatement(t.cloneNode(tmpId, true)),
  )

  body.unshift(
    t.ifStatement(
      t.logicalExpression('&&', cachedProp, elementProp),
      t.returnStatement(t.cloneNode(cachedProp, true)),
    ),
  )
}

// ─── Logging catch clause ───────────────────────────────────────────

export function loggingCatchClause(
  extra: t.Statement[] = [],
): t.CatchClause {
  return t.catchClause(
    t.identifier('__err'),
    t.blockStatement([
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(t.identifier('console'), t.identifier('error')),
          [t.identifier('__err')],
        ),
      ),
      ...extra,
    ]),
  )
}
