import { t } from '../utils/babel-interop.ts'
import { appendToBody, id, js, jsMethod } from 'eszter'

import type { ChildComponent, ConditionalSlot } from '../ir/types.ts'
import { childHasNoProps } from './gen-children.ts'

// ═══════════════════════════════════════════════════════════════════════════
// Key-guard helpers
// ═══════════════════════════════════════════════════════════════════════════

function serializeKeyGuard(test: t.Expression): string | null {
  if (
    t.isBinaryExpression(test) &&
    test.operator === '===' &&
    t.isIdentifier(test.left, { name: 'key' }) &&
    t.isStringLiteral(test.right)
  ) {
    return test.right.value
  }
  if (t.isLogicalExpression(test) && test.operator === '||') {
    const parts: string[] = []
    const collect = (node: t.Expression): boolean => {
      if (t.isLogicalExpression(node) && node.operator === '||') {
        return collect(node.left) && collect(node.right)
      }
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

export function mergeKeyGuards(stmts: t.Statement[]): t.Statement[] {
  const groups = new Map<string, { test: t.Expression; body: t.Statement[] }>()
  const order: string[] = []
  const nonGuarded: { idx: number; stmt: t.Statement }[] = []

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]
    if (t.isIfStatement(stmt) && !stmt.alternate) {
      const key = serializeKeyGuard(stmt.test)
      if (key != null) {
        if (!groups.has(key)) {
          groups.set(key, { test: stmt.test, body: [] })
          order.push(key)
        }
        const g = groups.get(key)!
        if (t.isBlockStatement(stmt.consequent)) {
          g.body.push(...stmt.consequent.body)
        } else {
          g.body.push(stmt.consequent)
        }
        continue
      }
    }
    nonGuarded.push({ idx: i, stmt })
  }

  const result: t.Statement[] = []
  let orderIdx = 0
  const emittedGroups = new Set<string>()
  for (let i = 0; i < stmts.length; i++) {
    const ng = nonGuarded.find((n) => n.idx === i)
    if (ng) {
      result.push(ng.stmt)
      continue
    }
    if (orderIdx < order.length) {
      const key = order[orderIdx]
      if (!emittedGroups.has(key)) {
        const g = groups.get(key)!
        emittedGroups.add(key)
        result.push(t.ifStatement(g.test, g.body.length === 1 ? g.body[0] : t.blockStatement(g.body)))
      }
      const stmt = stmts[i]
      if (t.isIfStatement(stmt) && !stmt.alternate) {
        const sk = serializeKeyGuard(stmt.test)
        if (sk === key && emittedGroups.has(key)) {
          continue
        }
        if (sk != null && sk !== key) {
          orderIdx++
          if (!emittedGroups.has(sk)) {
            const g2 = groups.get(sk)!
            emittedGroups.add(sk)
            result.push(t.ifStatement(g2.test, g2.body.length === 1 ? g2.body[0] : t.blockStatement(g2.body)))
          }
          continue
        }
      }
    }
  }

  for (; orderIdx < order.length; orderIdx++) {
    const key = order[orderIdx]
    if (!emittedGroups.has(key)) {
      const g = groups.get(key)!
      emittedGroups.add(key)
      result.push(t.ifStatement(g.test, g.body.length === 1 ? g.body[0] : t.blockStatement(g.body)))
    }
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// __onPropChange generation
// ═══════════════════════════════════════════════════════════════════════════

export function ensureOnPropChangeMethod(
  classBody: t.ClassBody,
  inlinePatchBodies: Map<string, t.Statement[]>,
  compiledChildren: ChildComponent[],
  arrayRefreshDeps: Array<{ methodName: string; propNames: string[] }>,
  conditionalSlots: ConditionalSlot[] = [],
  unresolvedMapPropRefreshDeps: Array<{ mapIdx: number; propNames: string[] }> = [],
): void {
  const existing = classBody.body.find(
    (member) =>
      t.isClassMethod(member) &&
      member.computed &&
      t.isIdentifier(member.key) &&
      member.key.name === 'GEA_ON_PROP_CHANGE',
  ) as t.ClassMethod | undefined
  if (existing) return

  const directForwardCalls: t.Statement[] = []
  const nonDirectChildren: typeof compiledChildren = []
  for (const child of compiledChildren) {
    if (childHasNoProps(child)) continue
    if (child.directMappings && child.directMappings.length > 0) {
      const allSameName = child.directMappings.every((m) => m.parentPropName === m.childPropName)
      const guard = child.directMappings.reduce<t.Expression>((acc, m) => {
        const test = t.binaryExpression('===', id('key'), t.stringLiteral(m.parentPropName))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)

      if (allSameName) {
        directForwardCalls.push(
          t.ifStatement(
            guard,
            js`this.${id(child.instanceVar)}[${id('GEA_UPDATE_PROPS')}]({[key]: value});` as t.ExpressionStatement,
          ),
        )
      } else {
        for (const m of child.directMappings) {
          directForwardCalls.push(
            t.ifStatement(
              t.binaryExpression('===', id('key'), t.stringLiteral(m.parentPropName)),
              js`this.${id(child.instanceVar)}[${id('GEA_UPDATE_PROPS')}]({${id(m.childPropName)}: value});` as t.ExpressionStatement,
            ),
          )
        }
      }
    } else {
      nonDirectChildren.push(child)
    }
  }

  const childRefreshEntries = nonDirectChildren
    .filter((child) => child.dependencies.some((dep) => !dep.storeVar && dep.pathParts[0] === 'props'))
    .map((child) => {
      const depProps = new Set<string>()
      for (const dep of child.dependencies) {
        if (!dep.storeVar && dep.pathParts[0] === 'props' && dep.pathParts.length > 1) {
          depProps.add(dep.pathParts[1])
        }
      }
      return { child, depProps }
    })
  const arrayRefreshMethodNames = arrayRefreshDeps.filter((d) => d.propNames.length > 0).map((d) => d.methodName)

  const refreshPropDeps = new Map<string, Set<string>>()
  for (const { methodName, propNames } of arrayRefreshDeps) {
    if (propNames.length > 0) {
      refreshPropDeps.set(methodName, new Set(propNames))
    }
  }

  const childRefreshCalls: t.Statement[] = childRefreshEntries.map(({ child, depProps }) => {
    const buildPropsName = `__buildProps_${child.instanceVar.replace(/^_/, '')}`
    const call =
      js`this.${id(child.instanceVar)}[${id('GEA_UPDATE_PROPS')}](this.${id(buildPropsName)}());` as t.ExpressionStatement
    if (depProps.size > 0) {
      const guard = Array.from(depProps).reduce<t.Expression>((acc, prop) => {
        const test = t.binaryExpression('===', id('key'), t.stringLiteral(prop))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)
      return t.ifStatement(guard, call)
    }
    return call
  })

  const arrayRefreshCalls: t.Statement[] = arrayRefreshMethodNames.map((name) => {
    const deps = refreshPropDeps.get(name)
    const call = js`this.${id(name)}();` as t.ExpressionStatement
    if (deps && deps.size > 0) {
      const guard = Array.from(deps).reduce<t.Expression>((acc, prop) => {
        const test = t.binaryExpression('===', id('key'), t.stringLiteral(prop))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)
      return t.ifStatement(guard, call)
    }
    return call
  })

  const refreshCalls: t.Statement[] = [...childRefreshCalls, ...arrayRefreshCalls]

  const condPatchCalls: t.Statement[] = []
  if (conditionalSlots.length > 0) {
    for (let i = 0; i < conditionalSlots.length; i++) {
      const slot = conditionalSlots[i]
      const call = js`this[${id('GEA_PATCH_COND')}](${t.numericLiteral(i)});` as t.ExpressionStatement
      if (slot.dependentPropNames.length > 0) {
        const guard = slot.dependentPropNames.reduce<t.Expression>((acc, prop) => {
          const test = t.binaryExpression('===', id('key'), t.stringLiteral(prop))
          return acc ? t.logicalExpression('||', acc, test) : test
        }, undefined!)
        condPatchCalls.push(t.ifStatement(guard, call))
      } else {
        condPatchCalls.push(call)
      }
    }
  }

  const patchCalls = Array.from(inlinePatchBodies.entries()).map(([propName, bodyStmts]) =>
    t.ifStatement(
      t.binaryExpression('===', id('key'), t.stringLiteral(propName)),
      t.blockStatement(bodyStmts.map((s) => t.cloneNode(s, true) as t.Statement)),
    ),
  )

  const unresolvedMapRefreshCalls: t.Statement[] = unresolvedMapPropRefreshDeps.map((dep) => {
    const call = js`this[${id('GEA_SYNC_MAP')}](${t.numericLiteral(dep.mapIdx)});` as t.ExpressionStatement
    if (dep.propNames.length > 0) {
      const guard = dep.propNames.reduce<t.Expression>((acc, prop) => {
        const test = t.binaryExpression('===', id('key'), t.stringLiteral(prop))
        return acc ? t.logicalExpression('||', acc, test) : test
      }, undefined!)
      return t.ifStatement(guard, call)
    }
    return call
  })

  const allKeyGuarded: t.Statement[] = [
    ...directForwardCalls,
    ...refreshCalls,
    ...patchCalls,
    ...condPatchCalls,
    ...unresolvedMapRefreshCalls,
  ]

  if (allKeyGuarded.length === 0) return

  const merged = mergeKeyGuards(allKeyGuarded)

  classBody.body.push(appendToBody(jsMethod`[${id('GEA_ON_PROP_CHANGE')}](key, value) {}`, ...merged))
}
