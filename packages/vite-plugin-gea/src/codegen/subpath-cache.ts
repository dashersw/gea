/**
 * Subpath cache guard utilities for the post-processing pass.
 * Handles value-subproperty chunking, null-guard stripping,
 * bound-value alias optimization, and cache field insertion.
 */
import { id, js, jsExpr } from 'eszter'
import { t } from '../utils/babel-interop.ts'

// ─── Generic AST traversal ─────────────────────────────────────────

function walk(node: t.Node | null | undefined, fn: (n: t.Node) => void): void {
  if (!node || typeof node !== 'object') return
  fn(node)
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child))
      for (const c of child) if (c?.type) walk(c, fn)
    else if (child?.type) walk(child, fn)
  }
}

/** In-place child replacement: if `fn` returns a node, swap it in. */
function replaceChildren(
  node: t.Node,
  fn: (n: t.Node) => t.Node | undefined,
): void {
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        const c = child[i]
        if (!c?.type) continue
        const r = fn(c)
        if (r !== undefined) child[i] = r
        else replaceChildren(c, fn)
      }
    } else if (child?.type) {
      const r = fn(child)
      if (r !== undefined) (node as any)[key] = r
      else replaceChildren(child, fn)
    }
  }
}

/** Matches `value.X` or `value?.X` (non-computed). */
function isValueDot(
  node: t.Node,
  subProp?: string,
): node is t.MemberExpression | t.OptionalMemberExpression {
  if (
    (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
    !node.computed &&
    t.isIdentifier(node.object, { name: 'value' }) &&
    t.isIdentifier(node.property)
  )
    return subProp ? node.property.name === subProp : true
  return false
}

// ─── Subpath cache guards ───────────────────────────────────────────

function serializeKeyGuardForSubpath(test: t.Expression): string | null {
  if (
    t.isBinaryExpression(test) &&
    test.operator === '===' &&
    t.isIdentifier(test.left, { name: 'key' }) &&
    t.isStringLiteral(test.right)
  )
    return test.right.value
  if (t.isLogicalExpression(test) && test.operator === '||') {
    const parts: string[] = []
    const collect = (node: t.Expression): boolean => {
      if (t.isLogicalExpression(node) && node.operator === '||')
        return collect(node.left) && collect(node.right)
      if (
        t.isBinaryExpression(node) &&
        node.operator === '===' &&
        t.isIdentifier(node.left, { name: 'key' }) &&
        t.isStringLiteral(node.right)
      ) {
        parts.push(node.right.value)
        return true
      }
      return false
    }
    if (collect(test) && parts.length > 0) return parts.sort().join('|')
  }
  return null
}

function isValueNullishGuard(test: t.Expression): boolean {
  if (!t.isUnaryExpression(test) || test.operator !== '!') return false
  const arg = test.argument
  if (!t.isLogicalExpression(arg) || arg.operator !== '||') return false
  const { left, right } = arg
  return (
    t.isBinaryExpression(left) &&
    left.operator === '===' &&
    t.isIdentifier(left.left, { name: 'value' }) &&
    t.isNullLiteral(left.right) &&
    t.isBinaryExpression(right) &&
    right.operator === '===' &&
    t.isIdentifier(right.left, { name: 'value' }) &&
    t.isIdentifier(right.right, { name: 'undefined' })
  )
}

export function collectValueSubpaths(node: t.Node): Set<string> {
  const set = new Set<string>()
  walk(node, (n) => {
    if (isValueDot(n)) set.add((n.property as t.Identifier).name)
  })
  return set
}

function unwrapNullGuardBlock(
  block: t.BlockStatement,
): { inner: t.BlockStatement; hadNullGuard: boolean } {
  if (
    block.body.length === 1 &&
    t.isIfStatement(block.body[0]) &&
    isValueNullishGuard(block.body[0].test) &&
    !block.body[0].alternate
  ) {
    const inner = block.body[0].consequent
    return {
      inner: t.isBlockStatement(inner) ? inner : t.blockStatement([inner]),
      hadNullGuard: true,
    }
  }
  return { inner: block, hadNullGuard: false }
}

function hoistDuplicateValueSubprops(block: t.BlockStatement): void {
  const counts = new Map<string, number>()
  walk(block, (n) => {
    if (isValueDot(n)) {
      const name = (n.property as t.Identifier).name
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  })
  const dups = new Map(
    [...counts].filter(([, c]) => c > 1).map(([name]) => [name, `__${name}`]),
  )
  if (dups.size === 0) return
  replaceChildren(block, (n) => {
    if (isValueDot(n)) {
      const local = dups.get((n.property as t.Identifier).name)
      if (local) return id(local)
    }
    return undefined
  })
  block.body.unshift(
    ...[...dups].map(([sub, local]) => js`const ${id(local)} = value?.${id(sub)};`),
  )
}

// ─── Subpath chunk types ────────────────────────────────────────────

type SubpathChunk =
  | { kind: 'single'; subProp: string; stmts: t.Statement[] }
  | { kind: 'always'; stmts: t.Statement[] }

function containsPropRefreshCall(node: t.Node): boolean {
  let found = false
  walk(node, (n) => {
    if (
      t.isMemberExpression(n) &&
      t.isIdentifier(n.property) &&
      (n.property.name === 'GEA_UPDATE_PROPS' ||
        n.property.name.startsWith('__refresh'))
    )
      found = true
  })
  return found
}

function chunkStatementsInOrder(stmts: t.Statement[]): SubpathChunk[] {
  const chunks: SubpathChunk[] = []
  let currentSingle: { subProp: string; stmts: t.Statement[] } | null = null

  const flushSingle = (): void => {
    if (!currentSingle) return
    chunks.push({ kind: 'single', ...currentSingle })
    currentSingle = null
  }

  for (const stmt of stmts) {
    const paths = collectValueSubpaths(stmt)
    if (paths.size === 0) {
      if (currentSingle && !containsPropRefreshCall(stmt)) {
        currentSingle.stmts.push(stmt)
      } else {
        flushSingle()
        chunks.push({ kind: 'always', stmts: [stmt] })
      }
    } else if (paths.size === 1) {
      const k = [...paths][0]!
      if (currentSingle && currentSingle.subProp !== k) flushSingle()
      if (!currentSingle) currentSingle = { subProp: k, stmts: [stmt] }
      else currentSingle.stmts.push(stmt)
    } else {
      flushSingle()
      chunks.push({ kind: 'always', stmts: [stmt] })
    }
  }
  flushSingle()
  return chunks
}

function stripPerStatementNullGuards(
  stmts: t.Statement[],
): { stmts: t.Statement[]; allHadGuards: boolean } {
  let guardCount = 0
  const result = stmts.map((stmt) => {
    const stripped = stripNullGuard(stmt)
    if (stripped) { guardCount++; return stripped }
    return stmt
  })
  return { stmts: result, allHadGuards: stmts.length > 0 && guardCount === stmts.length }
}

function stripNullGuard(stmt: t.Statement): t.Statement | null {
  // Unwrap { if (nullGuard) { ... } } or if (nullGuard) { ... }
  const ifStmt =
    t.isBlockStatement(stmt) && stmt.body.length === 1 && t.isIfStatement(stmt.body[0])
      ? stmt.body[0]
      : t.isIfStatement(stmt)
        ? stmt
        : null
  if (!ifStmt || ifStmt.alternate || !isValueNullishGuard(ifStmt.test)) return null
  const body = t.isBlockStatement(ifStmt.consequent)
    ? ifStmt.consequent.body
    : [ifStmt.consequent]
  return t.blockStatement(body)
}

function countIdentifierRefs(node: t.Node, name: string): number {
  let count = 0
  walk(node, (n) => { if (t.isIdentifier(n) && n.name === name) count++ })
  return count
}

function isPure(e: t.Expression): boolean {
  if (t.isLiteral(e) || t.isIdentifier(e)) return true
  if (t.isMemberExpression(e) || t.isOptionalMemberExpression(e))
    return isPure(e.object as t.Expression) && (!e.computed || isPure(e.property as t.Expression))
  if (t.isConditionalExpression(e))
    return isPure(e.test) && isPure(e.consequent as t.Expression) && isPure(e.alternate as t.Expression)
  if (t.isBinaryExpression(e) || t.isLogicalExpression(e))
    return isPure(e.left) && isPure(e.right)
  if (t.isUnaryExpression(e)) return isPure(e.argument)
  if (t.isArrayExpression(e))
    return e.elements.every((el) => el == null || (t.isExpression(el) && isPure(el)))
  if (t.isObjectExpression(e))
    return e.properties.every((p) =>
      t.isObjectProperty(p) && !p.computed ? t.isExpression(p.value) && isPure(p.value)
      : t.isSpreadElement(p) ? isPure(p.argument) : false)
  if (t.isTemplateLiteral(e) || t.isSequenceExpression(e))
    return e.expressions.every((x) => isPure(x))
  return false
}

function renameIdentifier(node: t.Node, from: string, to: string): void {
  walk(node, (n) => { if (t.isIdentifier(n) && n.name === from) n.name = to })
}

const isBoundValueDecl = (s: t.Statement) =>
  t.isVariableDeclaration(s) &&
  s.declarations.length === 1 &&
  t.isIdentifier(s.declarations[0].id, { name: '__boundValue' })

const inlineBoundValue = (n: t.Node) =>
  t.isIdentifier(n) && n.name === '__boundValue'

/** Optimize `const __boundValue = <expr>` in a statement sequence. */
function optimizeBoundValueAliases(stmts: t.Statement[]): t.Statement[] {
  const out = [...stmts]
  let changed = true
  while (changed) {
    changed = false
    const idx = out.findIndex(isBoundValueDecl)
    if (idx === -1) break
    const init = (out[idx] as t.VariableDeclaration).declarations[0].init
    if (!init) break
    if (t.isIdentifier(init)) {
      out.splice(idx, 1)
      renameIdentifier(t.blockStatement(out), '__boundValue', init.name)
      changed = true
      continue
    }
    if (!t.isExpression(init) || !isPure(init)) break
    if (countIdentifierRefs(t.blockStatement([...out.slice(0, idx), ...out.slice(idx + 1)]), '__boundValue') !== 1) break
    out.splice(idx, 1)
    replaceChildren(t.blockStatement(out), (n) => inlineBoundValue(n) ? t.cloneNode(init, true) : undefined)
    changed = true
  }
  return out
}

function eliminateDeadBoundValueAlias(stmt: t.Statement): t.Statement {
  const stmts = t.isBlockStatement(stmt) ? stmt.body
    : t.isIfStatement(stmt) && t.isBlockStatement(stmt.consequent) ? stmt.consequent.body
    : null
  if (!stmts) return stmt
  const declIdx = stmts.findIndex((s) => isBoundValueDecl(s) && (s as t.VariableDeclaration).declarations[0].init != null)
  if (declIdx === -1) return stmt
  const init = (stmts[declIdx] as t.VariableDeclaration).declarations[0].init as t.Expression
  if (t.isIdentifier(init)) {
    stmts.splice(declIdx, 1)
    renameIdentifier(stmt, '__boundValue', init.name)
    return stmt
  }
  if (!isPure(init)) return stmt
  if (countIdentifierRefs(t.blockStatement([...stmts.slice(0, declIdx), ...stmts.slice(declIdx + 1)]), '__boundValue') !== 1) return stmt
  stmts.splice(declIdx, 1)
  replaceChildren(stmt, (n) => inlineBoundValue(n) ? t.cloneNode(init, true) : undefined)
  return stmt
}

export function wrapSubpathCacheGuards(
  method: t.ClassMethod,
  pcCounter: { value: number },
  classBody?: t.ClassBody,
): void {
  for (const stmt of method.body.body) {
    if (
      !t.isIfStatement(stmt) ||
      serializeKeyGuardForSubpath(stmt.test) === null
    )
      continue
    const block = t.isBlockStatement(stmt.consequent) ? stmt.consequent : null
    if (!block) continue

    const { inner, hadNullGuard } = unwrapNullGuardBlock(block)

    if (hadNullGuard) {
      hoistDuplicateValueSubprops(block)
      continue
    }

    const { stmts: stripped, allHadGuards } = stripPerStatementNullGuards(
      inner.body,
    )
    const chunks = chunkStatementsInOrder(stripped)

    const singles = new Set(chunks.filter((c): c is SubpathChunk & { kind: 'single' } => c.kind === 'single').map((c) => c.subProp))
    const hasAlways = chunks.some((c) => c.kind === 'always')
    if (!(singles.size > 0 && (singles.size >= 2 || hasAlways))) {
      hoistDuplicateValueSubprops(block)
      continue
    }

    const newInnerBody: t.Statement[] = []
    const pendingCacheFields: string[] = []
    for (const ch of chunks) {
      if (ch.kind === 'always') {
        newInnerBody.push(...ch.stmts)
        continue
      }
      const { subProp, stmts } = ch
      const idx = pcCounter.value++
      const cacheId = `__pc${idx}`
      const local = `__${subProp}_${idx}`
      const cacheMember = jsExpr`this.${id(cacheId)}`

      if (classBody) pendingCacheFields.push(cacheId)

      const localInit = allHadGuards
        ? jsExpr`value.${id(subProp)}`
        : jsExpr`value?.${id(subProp)}`
      newInnerBody.push(js`const ${id(local)} = ${localInit};`)

      let patched = stmts.map((s) => {
        const c = t.cloneNode(s, true)
        replaceChildren(c, (n) => isValueDot(n, subProp) ? id(local) : undefined)
        return c as t.Statement
      })
      patched = optimizeBoundValueAliases(patched)
      patched = patched.map(eliminateDeadBoundValueAlias)

      const cacheTest = classBody
        ? jsExpr`${cacheMember} !== ${id(local)}`
        : jsExpr`!Object.hasOwn(this, ${cacheId}) || !Object.is(${cacheMember}, ${id(local)})`

      newInnerBody.push(
        t.ifStatement(
          cacheTest,
          t.blockStatement([js`${cacheMember} = ${id(local)};`, ...patched]),
        ),
      )
    }

    if (allHadGuards) {
      block.body = [
        t.ifStatement(jsExpr`value != null`, t.blockStatement(newInnerBody)),
      ]
    } else {
      inner.body = newInnerBody
    }

    for (const cacheId of pendingCacheFields) {
      classBody!.body.push(t.classProperty(id(cacheId), t.objectExpression([])))
    }
  }
}
