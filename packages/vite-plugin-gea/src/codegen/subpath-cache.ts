/**
 * Subpath cache guard utilities for the post-processing pass.
 *
 * Handles value-subproperty chunking, null-guard stripping,
 * bound-value alias optimization, and cache field insertion.
 */
import { t } from '../utils/babel-interop.ts'

// ─── Subpath cache guards ───────────────────────────────────────────

function serializeKeyGuardForSubpath(
  test: t.Expression,
): string | null {
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

function isPropKeyGuardTest(test: t.Expression): boolean {
  return serializeKeyGuardForSubpath(test) !== null
}

function isValueNullishGuard(test: t.Expression): boolean {
  if (!t.isUnaryExpression(test) || test.operator !== '!') return false
  const arg = test.argument
  if (!t.isLogicalExpression(arg) || arg.operator !== '||') return false
  const { left, right } = arg
  const isNullCheck =
    t.isBinaryExpression(left) &&
    left.operator === '===' &&
    t.isIdentifier(left.left, { name: 'value' }) &&
    t.isNullLiteral(left.right)
  const isUndefCheck =
    t.isBinaryExpression(right) &&
    right.operator === '===' &&
    t.isIdentifier(right.left, { name: 'value' }) &&
    t.isIdentifier(right.right, { name: 'undefined' })
  return isNullCheck && isUndefCheck
}

export function collectValueSubpaths(node: t.Node): Set<string> {
  const set = new Set<string>()
  const visit = (n: t.Node | null | undefined): void => {
    if (!n || typeof n !== 'object') return
    if (t.isMemberExpression(n) && !n.computed) {
      if (
        t.isIdentifier(n.object, { name: 'value' }) &&
        t.isIdentifier(n.property)
      )
        set.add(n.property.name)
    }
    if (t.isOptionalMemberExpression(n) && !n.computed) {
      if (
        t.isIdentifier(n.object, { name: 'value' }) &&
        t.isIdentifier(n.property)
      )
        set.add(n.property.name)
    }
    const keys = t.VISITOR_KEYS[n.type]
    if (!keys) return
    for (const key of keys) {
      const child = (n as any)[key]
      if (Array.isArray(child))
        child.forEach((c: any) => c?.type && visit(c))
      else if (child?.type) visit(child)
    }
  }
  visit(node)
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
    if (t.isBlockStatement(inner)) return { inner, hadNullGuard: true }
    return { inner: t.blockStatement([inner]), hadNullGuard: true }
  }
  return { inner: block, hadNullGuard: false }
}

function replaceValueSubpropRoots(
  node: t.Node,
  subProp: string,
  local: string,
): t.Node {
  const cloned = t.cloneNode(node, true)
  replaceInPlace(cloned, subProp, local)
  return cloned
}

function replaceInPlace(
  node: t.Node,
  subProp: string,
  local: string,
): void {
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        const c = child[i]
        if (!c || typeof c !== 'object' || !c.type) continue
        if (isValueSubpropMatch(c, subProp)) {
          child[i] = t.identifier(local)
        } else {
          replaceInPlace(c, subProp, local)
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (isValueSubpropMatch(child, subProp)) {
        ;(node as any)[key] = t.identifier(local)
      } else {
        replaceInPlace(child, subProp, local)
      }
    }
  }
}

function isValueSubpropMatch(node: t.Node, subProp: string): boolean {
  if (t.isMemberExpression(node) && !node.computed)
    return (
      t.isIdentifier(node.object, { name: 'value' }) &&
      t.isIdentifier(node.property, { name: subProp })
    )
  if (t.isOptionalMemberExpression(node) && !node.computed)
    return (
      t.isIdentifier(node.object, { name: 'value' }) &&
      t.isIdentifier(node.property, { name: subProp })
    )
  return false
}

function isValueSubprop(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object, { name: 'value' }) &&
    t.isIdentifier(node.property)
  )
}

function hoistDuplicateValueSubprops(block: t.BlockStatement): void {
  const counts = new Map<string, number>()
  const collectSubprops = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    if (isValueSubprop(node)) {
      const name = (node as t.MemberExpression).property as t.Identifier
      counts.set(name.name, (counts.get(name.name) || 0) + 1)
      return
    }
    if (
      t.isOptionalMemberExpression(node) &&
      !node.computed &&
      t.isIdentifier(node.object, { name: 'value' }) &&
      t.isIdentifier(node.property)
    ) {
      counts.set(
        node.property.name,
        (counts.get(node.property.name) || 0) + 1,
      )
      return
    }
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child))
        child.forEach((c: any) => c?.type && collectSubprops(c))
      else if (child?.type) collectSubprops(child)
    }
  }
  collectSubprops(block)

  const duplicates = new Map<string, string>()
  for (const [name, count] of counts) {
    if (count > 1) duplicates.set(name, `__${name}`)
  }
  if (duplicates.size === 0) return

  const replaceSubprops = (node: t.Node): void => {
    if (!node || typeof node !== 'object') return
    const keys = t.VISITOR_KEYS[node.type]
    if (!keys) return
    for (const key of keys) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (isValueSubprop(child[i])) {
            const propName = (
              (child[i] as t.MemberExpression).property as t.Identifier
            ).name
            const local = duplicates.get(propName)
            if (local) child[i] = t.identifier(local)
          } else if (
            t.isOptionalMemberExpression(child[i]) &&
            !child[i].computed &&
            t.isIdentifier(child[i].object, { name: 'value' }) &&
            t.isIdentifier(child[i].property)
          ) {
            const propName = (
              (child[i] as t.OptionalMemberExpression)
                .property as t.Identifier
            ).name
            const local = duplicates.get(propName)
            if (local) child[i] = t.identifier(local)
          } else {
            replaceSubprops(child[i])
          }
        }
      } else if (child?.type) {
        if (isValueSubprop(child)) {
          const propName = (
            (child as t.MemberExpression).property as t.Identifier
          ).name
          const local = duplicates.get(propName)
          if (local) (node as any)[key] = t.identifier(local)
        } else if (
          t.isOptionalMemberExpression(child) &&
          !child.computed &&
          t.isIdentifier(child.object, { name: 'value' }) &&
          t.isIdentifier(child.property)
        ) {
          const propName = child.property.name
          const local = duplicates.get(propName)
          if (local) (node as any)[key] = t.identifier(local)
        } else {
          replaceSubprops(child)
        }
      }
    }
  }
  replaceSubprops(block)

  const decls = [...duplicates].map(([subProp, local]) =>
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(local),
        t.optionalMemberExpression(
          t.identifier('value'),
          t.identifier(subProp),
          false,
          true,
        ),
      ),
    ]),
  )
  block.body.unshift(...decls)
}

// ─── Subpath chunk types ────────────────────────────────────────────

type SubpathChunk =
  | { kind: 'single'; subProp: string; stmts: t.Statement[] }
  | { kind: 'always'; stmts: t.Statement[] }

function containsPropRefreshCall(node: t.Node): boolean {
  if (t.isMemberExpression(node) && t.isIdentifier(node.property)) {
    if (
      node.property.name === '__geaUpdateProps' ||
      node.property.name.startsWith('__refresh')
    )
      return true
  }
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return false
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const c of child)
        if (c && typeof c === 'object' && c.type && containsPropRefreshCall(c))
          return true
    } else if (child && typeof child === 'object' && child.type) {
      if (containsPropRefreshCall(child)) return true
    }
  }
  return false
}

function zeroPathShouldMergeIntoPrevSingle(stmt: t.Statement): boolean {
  if (containsPropRefreshCall(stmt)) return false
  return true
}

function chunkStatementsInOrder(stmts: t.Statement[]): SubpathChunk[] {
  const chunks: SubpathChunk[] = []
  let currentSingle: { subProp: string; stmts: t.Statement[] } | null = null

  const flushSingle = (): void => {
    if (!currentSingle) return
    chunks.push({
      kind: 'single',
      subProp: currentSingle.subProp,
      stmts: currentSingle.stmts,
    })
    currentSingle = null
  }

  for (const stmt of stmts) {
    const paths = collectValueSubpaths(stmt)
    if (paths.size === 0) {
      if (currentSingle && zeroPathShouldMergeIntoPrevSingle(stmt)) {
        currentSingle.stmts.push(stmt)
      } else {
        flushSingle()
        chunks.push({ kind: 'always', stmts: [stmt] })
      }
      continue
    }
    if (paths.size === 1) {
      const k = [...paths][0]!
      if (currentSingle && currentSingle.subProp !== k) flushSingle()
      if (!currentSingle) {
        currentSingle = { subProp: k, stmts: [stmt] }
      } else {
        currentSingle.stmts.push(stmt)
      }
      continue
    }
    flushSingle()
    chunks.push({ kind: 'always', stmts: [stmt] })
  }
  flushSingle()
  return chunks
}

function stripPerStatementNullGuards(
  stmts: t.Statement[],
): { stmts: t.Statement[]; allHadGuards: boolean } {
  const result: t.Statement[] = []
  let guardCount = 0
  for (const stmt of stmts) {
    const stripped = stripNullGuardPreservingBlock(stmt)
    if (stripped) {
      result.push(stripped)
      guardCount++
    } else {
      result.push(stmt)
    }
  }
  return {
    stmts: result,
    allHadGuards: stmts.length > 0 && guardCount === stmts.length,
  }
}

function stripNullGuardPreservingBlock(
  stmt: t.Statement,
): t.Statement | null {
  if (
    t.isBlockStatement(stmt) &&
    stmt.body.length === 1 &&
    t.isIfStatement(stmt.body[0])
  ) {
    const ifStmt = stmt.body[0]
    if (ifStmt.alternate || !isValueNullishGuard(ifStmt.test)) return null
    const body = t.isBlockStatement(ifStmt.consequent)
      ? ifStmt.consequent.body
      : [ifStmt.consequent]
    return t.blockStatement(body)
  }
  if (
    t.isIfStatement(stmt) &&
    !stmt.alternate &&
    isValueNullishGuard(stmt.test)
  ) {
    const body = t.isBlockStatement(stmt.consequent)
      ? stmt.consequent.body
      : [stmt.consequent]
    return t.blockStatement(body)
  }
  return null
}

function countIdentifierRefs(node: t.Node, name: string): number {
  let count = 0
  const visit = (n: t.Node | null | undefined): void => {
    if (!n || typeof n !== 'object') return
    if (t.isIdentifier(n) && n.name === name) count++
    const keys = t.VISITOR_KEYS[n.type]
    if (!keys) return
    for (const key of keys) {
      const child = (n as any)[key]
      if (Array.isArray(child))
        child.forEach((c: any) => c?.type && visit(c))
      else if (child?.type) visit(child)
    }
  }
  visit(node)
  return count
}

function isPureExpression(expr: t.Expression): boolean {
  if (t.isLiteral(expr)) return true
  if (t.isIdentifier(expr)) return true
  if (t.isMemberExpression(expr))
    return (
      isPureExpression(expr.object as t.Expression) &&
      (!expr.computed || isPureExpression(expr.property as t.Expression))
    )
  if (t.isOptionalMemberExpression(expr))
    return (
      isPureExpression(expr.object as t.Expression) &&
      (!expr.computed || isPureExpression(expr.property as t.Expression))
    )
  if (t.isConditionalExpression(expr))
    return (
      isPureExpression(expr.test) &&
      isPureExpression(expr.consequent as t.Expression) &&
      isPureExpression(expr.alternate as t.Expression)
    )
  if (t.isBinaryExpression(expr) || t.isLogicalExpression(expr))
    return isPureExpression(expr.left) && isPureExpression(expr.right)
  if (t.isUnaryExpression(expr)) return isPureExpression(expr.argument)
  if (t.isArrayExpression(expr))
    return expr.elements.every(
      (e) => e == null || (t.isExpression(e) && isPureExpression(e)),
    )
  if (t.isObjectExpression(expr))
    return expr.properties.every((p) => {
      if (t.isObjectProperty(p) && !p.computed)
        return t.isExpression(p.value) && isPureExpression(p.value)
      if (t.isSpreadElement(p)) return isPureExpression(p.argument)
      return false
    })
  if (t.isTemplateLiteral(expr))
    return expr.expressions.every((e) => isPureExpression(e))
  if (t.isSequenceExpression(expr))
    return expr.expressions.every((e) => isPureExpression(e))
  return false
}

function replaceIdentifierWithClonedExpr(
  node: t.Node,
  name: string,
  expr: t.Expression,
): void {
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        const c = child[i]
        if (c && t.isIdentifier(c) && c.name === name) {
          child[i] = t.cloneNode(expr, true)
        } else if (c?.type) replaceIdentifierWithClonedExpr(c, name, expr)
      }
    } else if (child && typeof child === 'object' && child.type) {
      if (t.isIdentifier(child) && child.name === name) {
        ;(node as any)[key] = t.cloneNode(expr, true)
      } else {
        replaceIdentifierWithClonedExpr(child, name, expr)
      }
    }
  }
}

function renameIdentifier(node: t.Node, from: string, to: string): void {
  if (t.isIdentifier(node) && node.name === from) {
    node.name = to
    return
  }
  const keys = t.VISITOR_KEYS[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const c of child)
        if (c && typeof c === 'object' && c.type) renameIdentifier(c, from, to)
    } else if (child && typeof child === 'object' && child.type) {
      renameIdentifier(child, from, to)
    }
  }
}

function optimizeBoundValueAliasesInSequence(
  stmts: t.Statement[],
): t.Statement[] {
  const out = [...stmts]
  let changed = true
  while (changed) {
    changed = false
    const idx = out.findIndex(
      (s) =>
        t.isVariableDeclaration(s) &&
        s.declarations.length === 1 &&
        t.isIdentifier(s.declarations[0].id, { name: '__boundValue' }),
    )
    if (idx === -1) break

    const decl = out[idx] as t.VariableDeclaration
    const init = decl.declarations[0].init
    if (!init) break

    if (t.isIdentifier(init)) {
      const aliasedName = init.name
      out.splice(idx, 1)
      const blk = t.blockStatement(out)
      renameIdentifier(blk, '__boundValue', aliasedName)
      out.length = 0
      out.push(...blk.body)
      changed = true
      continue
    }

    if (!t.isExpression(init) || !isPureExpression(init)) break

    const probe = t.blockStatement([
      ...out.slice(0, idx),
      ...out.slice(idx + 1),
    ])
    if (countIdentifierRefs(probe, '__boundValue') !== 1) break

    out.splice(idx, 1)
    const blk = t.blockStatement(out)
    replaceIdentifierWithClonedExpr(blk, '__boundValue', init)
    out.length = 0
    out.push(...blk.body)
    changed = true
  }
  return out
}

function eliminateDeadBoundValueAlias(stmt: t.Statement): t.Statement {
  if (!t.isBlockStatement(stmt) && !t.isIfStatement(stmt)) return stmt
  const stmts = t.isBlockStatement(stmt)
    ? stmt.body
    : t.isBlockStatement(stmt.consequent)
      ? stmt.consequent.body
      : null
  if (!stmts) return stmt

  const declIdxIdent = stmts.findIndex(
    (s) =>
      t.isVariableDeclaration(s) &&
      s.declarations.length === 1 &&
      t.isIdentifier(s.declarations[0].id, { name: '__boundValue' }) &&
      t.isIdentifier(s.declarations[0].init),
  )
  if (declIdxIdent !== -1) {
    const decl = stmts[declIdxIdent] as t.VariableDeclaration
    const aliasedName = (decl.declarations[0].init as t.Identifier).name
    stmts.splice(declIdxIdent, 1)
    renameIdentifier(stmt, '__boundValue', aliasedName)
    return stmt
  }

  const declIdx = stmts.findIndex(
    (s) =>
      t.isVariableDeclaration(s) &&
      s.declarations.length === 1 &&
      t.isIdentifier(s.declarations[0].id, { name: '__boundValue' }) &&
      s.declarations[0].init != null &&
      t.isExpression(s.declarations[0].init as t.Node),
  )
  if (declIdx === -1) return stmt

  const decl = stmts[declIdx] as t.VariableDeclaration
  const init = decl.declarations[0].init as t.Expression
  if (!isPureExpression(init)) return stmt

  const tmpBody = [...stmts.slice(0, declIdx), ...stmts.slice(declIdx + 1)]
  const probe = t.blockStatement(tmpBody)
  if (countIdentifierRefs(probe, '__boundValue') !== 1) return stmt

  stmts.splice(declIdx, 1)
  replaceIdentifierWithClonedExpr(stmt, '__boundValue', init)

  return stmt
}

export function wrapSubpathCacheGuards(
  method: t.ClassMethod,
  pcCounter: { value: number },
  classBody?: t.ClassBody,
): void {
  for (const stmt of method.body.body) {
    if (!t.isIfStatement(stmt) || !isPropKeyGuardTest(stmt.test)) continue
    const block = t.isBlockStatement(stmt.consequent)
      ? stmt.consequent
      : null
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

    const singleSubProps = new Set(
      chunks
        .filter(
          (c): c is Extract<SubpathChunk, { kind: 'single' }> =>
            c.kind === 'single',
        )
        .map((c) => c.subProp),
    )
    const hasAlwaysChunk = chunks.some((c) => c.kind === 'always')
    const shouldWrap =
      singleSubProps.size > 0 && (singleSubProps.size >= 2 || hasAlwaysChunk)

    if (!shouldWrap) {
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
      const cacheMember = t.memberExpression(
        t.thisExpression(),
        t.identifier(cacheId),
      )

      if (classBody) pendingCacheFields.push(cacheId)

      newInnerBody.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(local),
            allHadGuards
              ? t.memberExpression(
                  t.identifier('value'),
                  t.identifier(subProp),
                )
              : t.optionalMemberExpression(
                  t.identifier('value'),
                  t.identifier(subProp),
                  false,
                  true,
                ),
          ),
        ]),
      )

      let patched = stmts.map(
        (s) => replaceValueSubpropRoots(s, subProp, local) as t.Statement,
      )
      patched = optimizeBoundValueAliasesInSequence(patched)
      patched = patched.map(eliminateDeadBoundValueAlias)

      const cacheTest = classBody
        ? t.binaryExpression('!==', cacheMember, t.identifier(local))
        : t.logicalExpression(
            '||',
            t.unaryExpression(
              '!',
              t.callExpression(
                t.memberExpression(
                  t.identifier('Object'),
                  t.identifier('hasOwn'),
                ),
                [t.thisExpression(), t.stringLiteral(cacheId)],
              ),
            ),
            t.unaryExpression(
              '!',
              t.callExpression(
                t.memberExpression(
                  t.identifier('Object'),
                  t.identifier('is'),
                ),
                [cacheMember, t.identifier(local)],
              ),
            ),
          )

      newInnerBody.push(
        t.ifStatement(
          cacheTest,
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression('=', cacheMember, t.identifier(local)),
            ),
            ...patched,
          ]),
        ),
      )
    }

    if (allHadGuards) {
      block.body = [
        t.ifStatement(
          t.binaryExpression('!=', t.identifier('value'), t.nullLiteral()),
          t.blockStatement(newInnerBody),
        ),
      ]
    } else {
      inner.body = newInnerBody
    }

    for (const cacheId of pendingCacheFields) {
      classBody!.body.push(
        t.classProperty(t.identifier(cacheId), t.objectExpression([])),
      )
    }
  }
}
