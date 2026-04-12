import * as t from '@babel/types'
import type { RuntimeHelper } from '../utils.js'

/**
 * Transform a class that `extends Store`:
 *
 * 1. Class fields with initializers become signal-backed getter/setter pairs.
 *    `rows: Row[] = []` →
 *      `__rows = signal([])`
 *      `get rows() { return __wrapSignalValue(this.__rows) }`
 *      `set rows(v) { this.__rows.value = v }`
 *
 * 2. `declare` fields are left untouched (type-only).
 *
 * 3. Methods (non-constructor, non-getter, non-setter) get their body wrapped
 *    in `batch(() => { ... })`.
 *
 * 4. Getters/setters are left as-is.
 *
 * Returns true if the class was transformed (so the caller knows to track
 * `signal` and `batch` as used helpers).
 */
export function transformStoreClass(
  classBody: t.ClassBody,
  usedHelpers: Set<RuntimeHelper>,
): { transformed: boolean; signalConstants: Array<{ name: string; fieldName: string }> } {
  const newMembers: t.ClassBody['body'] = []
  let transformed = false
  let signalConstants: Array<{ name: string; fieldName: string }> | null = null

  // Collect field names first (needed for index assignment detection in methods)
  const fieldNames = new Set<string>()
  for (const member of classBody.body) {
    if (t.isClassProperty(member) && member.value != null && !member.declare &&
        t.isIdentifier(member.key)) {
      fieldNames.add(member.key.name)
    }
  }

  for (const member of classBody.body) {
    // ── Class property with initializer (not declare) ──────────────
    if (t.isClassProperty(member) && member.value != null) {
      // Skip `declare` fields
      if (member.declare) {
        newMembers.push(member)
        continue
      }

      const key = member.key
      if (!t.isIdentifier(key)) {
        newMembers.push(member)
        continue
      }

      const fieldName = key.name
      // Emit module-level: const _SIG_<name> = Symbol.for('gea.field.<name>')
      const sigConstName = `_SIG_${fieldName.toUpperCase()}`
      const sigConstId = t.identifier(sigConstName)

      // [_SIG_<NAME>] = signal(initialValue)
      const signalProp = t.classProperty(
        sigConstId,
        t.callExpression(t.identifier('signal'), [member.value]),
      )
      signalProp.computed = true
      newMembers.push(signalProp)

      // get fieldName() { return wrapSignalValue(this[_SIG_<NAME>]) }
      const getterReturn = t.callExpression(
        t.identifier('wrapSignalValue'),
        [t.memberExpression(t.thisExpression(), sigConstId, true)],
      )
      const getter = t.classMethod(
        'get',
        t.identifier(fieldName),
        [],
        t.blockStatement([t.returnStatement(getterReturn)]),
      )
      newMembers.push(getter)

      // set fieldName(v) { this[_SIG_<NAME>].value = v }
      const setter = t.classMethod(
        'set',
        t.identifier(fieldName),
        [t.identifier('v')],
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(
                t.memberExpression(t.thisExpression(), sigConstId, true),
                t.identifier('value'),
              ),
              t.identifier('v'),
            ),
          ),
        ]),
      )
      newMembers.push(setter)

      // Track this constant for injection at module level
      if (!signalConstants) signalConstants = []
      signalConstants.push({ name: sigConstName, fieldName })

      transformed = true
      continue
    }

    // ── Class method: wrap body in batch() ─────────────────────────
    if (t.isClassMethod(member) && member.kind === 'method') {
      const key = member.key
      // Skip constructor, compiler-generated methods, and Symbol-keyed methods
      if (member.computed) {
        newMembers.push(member)
        continue
      }
      if (t.isIdentifier(key) && key.name === 'constructor') {
        newMembers.push(member)
        continue
      }

      // Insert _notify() calls for index assignments on store-derived arrays.
      // E.g., `const d = this.rows; d[1] = x;` → `d[1] = x; this.__rows._notify();`
      const originalBody = member.body.body
      insertIndexAssignmentNotifications(originalBody, fieldNames)

      // Transform item property access to use __itemSignal
      transformItemPropertyAccess(member.body, fieldNames, usedHelpers)

      // Wrap the entire body in return batch(() => { ... })
      // Using return ensures methods that return values (like getEmailById) work correctly
      // For async methods, preserve async and await the batch call
      const isAsync = member.async
      const batchArrow = t.arrowFunctionExpression(
        [],
        t.blockStatement(originalBody),
      )
      if (isAsync) batchArrow.async = true
      const batchCallExpr = t.callExpression(t.identifier('batch'), [batchArrow])
      const batchCall = t.returnStatement(isAsync
        ? t.awaitExpression(batchCallExpr)
        : batchCallExpr,
      )
      member.body = t.blockStatement([batchCall])

      newMembers.push(member)
      transformed = true
      continue
    }

    // ── Getters: transform item property access ───────────────────
    if (t.isClassMethod(member) && member.kind === 'get') {
      transformItemPropertyAccess(member.body, fieldNames, usedHelpers)
      newMembers.push(member)
      continue
    }

    // Everything else (setters, declare fields without init, etc.)
    newMembers.push(member)
  }

  if (transformed) {
    // Signal getters with
    // __wrapSignalValue handle all field types (primitives, arrays, objects)
    // at runtime, making the reactive proxy redundant.
    const compiledProp = t.classProperty(
      t.identifier('GEA_COMPILED'),
      t.booleanLiteral(true),
    )
    compiledProp.static = true
    compiledProp.computed = true
    newMembers.unshift(compiledProp)
    classBody.body = newMembers
    usedHelpers.add('signal')
    usedHelpers.add('GEA_COMPILED')
    usedHelpers.add('batch')
    usedHelpers.add('wrapSignalValue')
  }

  return { transformed, signalConstants: signalConstants ?? [] }
}

/**
 * Scan a method body for index assignments on store-derived arrays and insert
 * _notify() calls after each one.
 *
 * Detects two patterns:
 * 1. Direct: `this.rows[i] = value` → insert `this.__rows._notify()` after
 * 2. Aliased: `const d = this.rows; ... d[i] = value` → insert `this.__rows._notify()` after
 *
 * This allows removing the Proxy `set` trap from __wrapArray — the compiler
 * handles reactivity for index assignments statically.
 */
function insertIndexAssignmentNotifications(
  stmts: t.Statement[],
  fieldNames: Set<string>,
): void {
  // Build alias map: local variable name → store field name
  // e.g., `const d = this.rows` → aliasMap.set('d', 'rows')
  const aliasMap = new Map<string, string>()
  collectAliases(stmts, fieldNames, aliasMap)

  // Now scan for index assignments and insert _notify() after each
  processStatements(stmts, fieldNames, aliasMap)
}

function collectAliases(
  stmts: t.Statement[],
  fieldNames: Set<string>,
  aliasMap: Map<string, string>,
): void {
  for (const stmt of stmts) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id) || !decl.init) continue
        const fieldName = getThisFieldAccess(decl.init, fieldNames)
        if (fieldName) {
          aliasMap.set(decl.id.name, fieldName)
        }
      }
    }
    // Recurse into nested blocks
    if (t.isIfStatement(stmt)) {
      if (t.isBlockStatement(stmt.consequent)) {
        collectAliases(stmt.consequent.body, fieldNames, aliasMap)
      }
      if (stmt.alternate) {
        if (t.isBlockStatement(stmt.alternate)) {
          collectAliases(stmt.alternate.body, fieldNames, aliasMap)
        } else if (t.isIfStatement(stmt.alternate)) {
          collectAliases([stmt.alternate], fieldNames, aliasMap)
        }
      }
    }
    if (t.isForStatement(stmt) || t.isForInStatement(stmt) || t.isForOfStatement(stmt) || t.isWhileStatement(stmt)) {
      if (t.isBlockStatement(stmt.body)) {
        collectAliases(stmt.body.body, fieldNames, aliasMap)
      }
    }
  }
}

function processStatements(
  stmts: t.Statement[],
  fieldNames: Set<string>,
  aliasMap: Map<string, string>,
): void {
  for (let i = stmts.length - 1; i >= 0; i--) {
    const stmt = stmts[i]

    // Recurse into nested blocks
    if (t.isIfStatement(stmt)) {
      if (t.isBlockStatement(stmt.consequent)) {
        processStatements(stmt.consequent.body, fieldNames, aliasMap)
      }
      if (stmt.alternate) {
        if (t.isBlockStatement(stmt.alternate)) {
          processStatements(stmt.alternate.body, fieldNames, aliasMap)
        } else if (t.isIfStatement(stmt.alternate)) {
          processStatements([stmt.alternate], fieldNames, aliasMap)
        }
      }
      continue
    }
    if (t.isForStatement(stmt) || t.isForInStatement(stmt) || t.isForOfStatement(stmt) || t.isWhileStatement(stmt)) {
      if (t.isBlockStatement(stmt.body)) {
        processStatements(stmt.body.body, fieldNames, aliasMap)
      }
      continue
    }

    if (!t.isExpressionStatement(stmt)) continue
    const expr = stmt.expression
    if (!t.isAssignmentExpression(expr)) continue

    const left = expr.left
    if (!t.isMemberExpression(left) || !left.computed) continue

    // Check if the object is this.<field> or an alias of one
    let fieldName: string | null = null
    if (t.isIdentifier(left.object) && aliasMap.has(left.object.name)) {
      fieldName = aliasMap.get(left.object.name)!
    } else {
      fieldName = getThisFieldAccess(left.object, fieldNames)
    }

    if (!fieldName) continue

    // Insert: this[Symbol.for('gea.field.<field>')]._notify()
    // this[_SIG_<FIELD>]._notify()
    const sigConstName = `_SIG_${fieldName.toUpperCase()}`
    const notifyStmt = t.expressionStatement(
      t.callExpression(
        t.memberExpression(
          t.memberExpression(t.thisExpression(), t.identifier(sigConstName), true),
          t.identifier('_notify'),
        ),
        [],
      ),
    )
    stmts.splice(i + 1, 0, notifyStmt)
  }
}

/**
 * Check if an expression is `this.<fieldName>` where fieldName is a known store field.
 * Returns the field name if matched, null otherwise.
 */
function getThisFieldAccess(node: t.Node, fieldNames: Set<string>): string | null {
  if (!t.isMemberExpression(node) || node.computed) return null
  if (!t.isThisExpression(node.object)) return null
  if (!t.isIdentifier(node.property)) return null
  return fieldNames.has(node.property.name) ? node.property.name : null
}

// ─── Item property access transformation ─────────────────────────────────────
// Transforms item.prop → __itemSignal(item, 'prop').value in store methods/getters.
// This eliminates the need for makeItemReactive at runtime.

const ARRAY_ITEM_METHODS = new Set(['find', 'filter', 'map', 'forEach', 'some', 'every', 'findIndex', 'flatMap', 'reduce'])

/**
 * Transform item property access in a method/getter body to use __itemSignal.
 * Detects items from:
 * 1. this.<arrayField>[expr].prop → __itemSignal(this.<arrayField>[expr], 'prop').value
 * 2. Array method callbacks: this.<arrayField>.filter(item => item.prop)
 * 3. Local aliases: const x = this.<arrayField>.find(...); x.prop
 */
function transformItemPropertyAccess(
  body: t.BlockStatement,
  fieldNames: Set<string>,
  usedHelpers: Set<RuntimeHelper>,
): void {
  // Collect item aliases: local vars assigned from find/indexing on store arrays
  const itemAliases = new Set<string>()
  collectItemAliases(body.body, fieldNames, itemAliases)

  // Walk the entire body and transform member expressions
  let transformed = false
  walkAndTransform(body, fieldNames, itemAliases, () => { transformed = true })

  if (transformed) {
    usedHelpers.add('itemSignal')
  }
}

function collectItemAliases(
  stmts: t.Statement[],
  fieldNames: Set<string>,
  aliases: Set<string>,
): void {
  for (const stmt of stmts) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id) || !decl.init) continue
        // const x = this.field.find(...)
        if (t.isCallExpression(decl.init) && t.isMemberExpression(decl.init.callee)) {
          const callee = decl.init.callee
          if (t.isIdentifier(callee.property) &&
              (callee.property.name === 'find' || callee.property.name === 'at') &&
              getThisFieldAccess(callee.object, fieldNames)) {
            aliases.add(decl.id.name)
          }
        }
        // const x = this.field[i]
        if (t.isMemberExpression(decl.init) && decl.init.computed) {
          if (getThisFieldAccess(decl.init.object, fieldNames)) {
            aliases.add(decl.id.name)
          }
        }
      }
    }
    // Recurse into blocks
    if (t.isIfStatement(stmt)) {
      if (t.isBlockStatement(stmt.consequent)) collectItemAliases(stmt.consequent.body, fieldNames, aliases)
      if (stmt.alternate && t.isBlockStatement(stmt.alternate)) collectItemAliases(stmt.alternate.body, fieldNames, aliases)
    }
    if ((t.isForStatement(stmt) || t.isForInStatement(stmt) || t.isForOfStatement(stmt) || t.isWhileStatement(stmt)) && t.isBlockStatement(stmt.body)) {
      collectItemAliases(stmt.body.body, fieldNames, aliases)
    }
    // for (const x of this.field) → x is an item alias
    if (t.isForOfStatement(stmt) && t.isVariableDeclaration(stmt.left)) {
      const decl = stmt.left.declarations[0]
      if (t.isIdentifier(decl?.id) && getThisFieldAccess(stmt.right, fieldNames)) {
        aliases.add(decl.id.name)
      }
    }
  }
}

/**
 * Check if a member expression represents an item property access that should be transformed.
 * Returns the item expression and property name if it matches, null otherwise.
 */
function isItemPropertyAccess(
  node: t.MemberExpression,
  fieldNames: Set<string>,
  itemAliases: Set<string>,
  callbackItemParams: Set<string>,
): { itemExpr: t.Expression; propName: string } | null {
  // Skip computed access (item[x]) and non-identifier properties
  if (node.computed || !t.isIdentifier(node.property)) return null
  const propName = node.property.name

  // Skip built-in / non-configurable properties (e.g. Array.length)
  const SKIP_PROPS = new Set(['length', 'constructor', 'prototype', '__proto__', 'toString', 'valueOf'])
  if (SKIP_PROPS.has(propName)) return null

  const obj = node.object

  // Pattern 1: this.<arrayField>[expr].prop
  if (t.isMemberExpression(obj) && obj.computed && getThisFieldAccess(obj.object, fieldNames)) {
    return { itemExpr: obj as t.Expression, propName }
  }

  // Pattern 2: alias.prop (from find/indexing)
  if (t.isIdentifier(obj) && itemAliases.has(obj.name)) {
    return { itemExpr: obj, propName }
  }

  // Pattern 3: callback param.prop (from filter/map/etc)
  if (t.isIdentifier(obj) && callbackItemParams.has(obj.name)) {
    return { itemExpr: obj, propName }
  }

  return null
}

/**
 * Create `__itemSignal(itemExpr, 'propName').value` AST node
 */
function makeItemSignalAccess(itemExpr: t.Expression, propName: string): t.MemberExpression {
  return t.memberExpression(
    t.callExpression(t.identifier('itemSignal'), [
      t.cloneNode(itemExpr),
      t.stringLiteral(propName),
    ]),
    t.identifier('value'),
  )
}

/**
 * Recursively walk AST and transform item property accesses.
 */
function walkAndTransform(
  node: t.Node,
  fieldNames: Set<string>,
  itemAliases: Set<string>,
  onTransform: () => void,
  callbackItemParams: Set<string> = new Set(),
): void {
  if (!node || typeof node !== 'object') return

  // Detect array method callbacks to find item params
  if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
    const callee = node.callee
    if (t.isIdentifier(callee.property) && ARRAY_ITEM_METHODS.has(callee.property.name)) {
      // Check if the object is this.<arrayField> or an alias of one
      const isOnArray = getThisFieldAccess(callee.object, fieldNames) ||
        (t.isIdentifier(callee.object) && itemAliases.has(callee.object.name))
      if (isOnArray && node.arguments.length > 0) {
        const callback = node.arguments[0]
        if ((t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
            callback.params.length > 0) {
          // For reduce(), the item is the 2nd param (1st is accumulator)
          // For all other array methods, the item is the 1st param
          const isReduce = callee.property.name === 'reduce'
          const itemParamIdx = isReduce ? 1 : 0
          const itemParam = callback.params[itemParamIdx]
          if (itemParam && t.isIdentifier(itemParam)) {
            const extendedParams = new Set(callbackItemParams)
            extendedParams.add(itemParam.name)
            // Walk callback body with extended params
            walkAndTransform(callback.body, fieldNames, itemAliases, onTransform, extendedParams)
            // Walk other arguments normally
            for (let i = 1; i < node.arguments.length; i++) {
              walkAndTransform(node.arguments[i], fieldNames, itemAliases, onTransform, callbackItemParams)
            }
            // Walk callee object
            walkAndTransform(callee.object, fieldNames, itemAliases, onTransform, callbackItemParams)
            return // already handled children
          }
        }
      }
    }
  }

  // Check and transform member expressions
  if (t.isMemberExpression(node)) {
    const match = isItemPropertyAccess(node, fieldNames, itemAliases, callbackItemParams)
    if (match) {
      // Replace this node's structure in-place with __itemSignal(...).value
      const replacement = makeItemSignalAccess(match.itemExpr, match.propName)
      // Mutate in place: change callee/object/property
      ;(node as any).object = replacement.object
      ;(node as any).property = replacement.property
      ;(node as any).computed = false
      onTransform()
      // Don't recurse into the transformed node (it's already correct)
      return
    }
  }

  // Generic recursion for all other node types
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
    const child = (node as any)[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkAndTransform(item, fieldNames, itemAliases, onTransform, callbackItemParams)
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkAndTransform(child, fieldNames, itemAliases, onTransform, callbackItemParams)
    }
  }
}
