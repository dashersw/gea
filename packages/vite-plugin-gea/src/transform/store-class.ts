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
      // Use string-keyed private property: this.$$gea_<name> = signal(initialValue)
      const privateName = `$$gea_${fieldName}`
      const privateId = t.identifier(privateName)

      // $$gea_<name> = signal(initialValue)
      const signalProp = t.classProperty(
        privateId,
        t.callExpression(t.identifier('signal'), [member.value]),
      )
      newMembers.push(signalProp)

      // get fieldName() { return wrapSignalValue(this.$$gea_<name>) }
      const getterReturn = t.callExpression(
        t.identifier('wrapSignalValue'),
        [t.memberExpression(t.thisExpression(), privateId, false)],
      )
      const getter = t.classMethod(
        'get',
        t.identifier(fieldName),
        [],
        t.blockStatement([t.returnStatement(getterReturn)]),
      )
      newMembers.push(getter)

      // set fieldName(v) { this.$$gea_<name>.value = v }
      const setter = t.classMethod(
        'set',
        t.identifier(fieldName),
        [t.identifier('v')],
        t.blockStatement([
          t.expressionStatement(
            t.assignmentExpression(
              '=',
              t.memberExpression(
                t.memberExpression(t.thisExpression(), privateId, false),
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
      signalConstants.push({ name: privateName, fieldName })

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
      t.identifier('$$gea_compiled'),
      t.booleanLiteral(true),
    )
    compiledProp.static = true
    newMembers.unshift(compiledProp)
    classBody.body = newMembers
    usedHelpers.add('signal')
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
        // const d = this.rows → d → 'rows'
        const fieldName = getThisFieldAccess(decl.init, fieldNames)
        if (fieldName) {
          aliasMap.set(decl.id.name, fieldName)
          continue
        }
        // const x = this.field.find(...) / this.field.at(...)
        if (t.isCallExpression(decl.init) && t.isMemberExpression(decl.init.callee)) {
          const callee = decl.init.callee
          if (t.isIdentifier(callee.property) &&
              (callee.property.name === 'find' || callee.property.name === 'at')) {
            const rootField = getThisFieldChainRoot(callee.object, fieldNames, aliasMap)
            if (rootField) {
              aliasMap.set(decl.id.name, rootField)
              continue
            }
          }
        }
        // const x = this.field[i]
        if (t.isMemberExpression(decl.init) && decl.init.computed) {
          const rootField = getThisFieldChainRoot(decl.init.object, fieldNames, aliasMap)
          if (rootField) {
            aliasMap.set(decl.id.name, rootField)
          }
        }
      }
    }
    // for (const x of this.field) → x → field
    if (t.isForOfStatement(stmt) && t.isVariableDeclaration(stmt.left)) {
      const decl = stmt.left.declarations[0]
      if (t.isIdentifier(decl?.id)) {
        const rootField = getThisFieldChainRoot(stmt.right, fieldNames, aliasMap)
        if (rootField) {
          aliasMap.set(decl.id.name, rootField)
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

function makeNotifyStmt(fieldName: string): t.ExpressionStatement {
  const privateName = `$$gea_${fieldName}`
  return t.expressionStatement(
    t.callExpression(
      t.memberExpression(
        t.memberExpression(t.thisExpression(), t.identifier(privateName), false),
        t.identifier('_notify'),
      ),
      [],
    ),
  )
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

    let fieldName: string | null = null

    // Pattern 1: Index assignment — this.<field>[expr] = value / alias[expr] = value
    if (t.isAssignmentExpression(expr) && t.isMemberExpression(expr.left) && expr.left.computed) {
      const left = expr.left
      fieldName = getThisFieldChainRoot(left.object, fieldNames, aliasMap)
    }

    // Pattern 2: Mutating method call — this.<field>...push/pop/splice/etc(...)
    // e.g., this.todos.push(x), this.messages[id].push(msg), col.taskIds.splice(idx, 1)
    if (!fieldName && t.isCallExpression(expr) && t.isMemberExpression(expr.callee)) {
      const method = expr.callee.property
      if (t.isIdentifier(method) && MUTATING_METHODS.has(method.name)) {
        fieldName = getThisFieldChainRoot(expr.callee.object, fieldNames, aliasMap)
      }
    }

    // Pattern 3: delete this.<field>[expr] / delete alias[expr]
    if (!fieldName && t.isUnaryExpression(expr) && expr.operator === 'delete' && t.isMemberExpression(expr.argument)) {
      fieldName = getThisFieldChainRoot(expr.argument.object, fieldNames, aliasMap)
    }

    // Pattern 4: Object.assign(this.<field>, ...) or Object.assign(alias, ...)
    // Object.assign mutates the target in-place (same reference), so the parent
    // signal's value doesn't change. We must _notify() the parent so that
    // dependents (keyed-lists, computations) re-evaluate.
    // This does NOT cause comment avatar re-renders because keyed-lists compare
    // keys and bail out when the data hasn't structurally changed.
    if (!fieldName && t.isCallExpression(expr) &&
      t.isMemberExpression(expr.callee) &&
      t.isIdentifier(expr.callee.object, { name: 'Object' }) &&
      t.isIdentifier(expr.callee.property, { name: 'assign' }) &&
      expr.arguments.length >= 2) {
      const target = expr.arguments[0]
      if (t.isExpression(target)) {
        const directField = getThisFieldAccess(target, fieldNames)
        if (directField) {
          fieldName = directField
        } else if (t.isIdentifier(target) && aliasMap.has(target.name)) {
          fieldName = aliasMap.get(target.name)!
        }
      }
    }

    // Pattern 5: External function call with a direct store field/alias argument.
    // Only match when the store field ITSELF or an alias is passed directly,
    // NOT when reading a sub-property like this.issue.id (that's a scalar read).
    // e.g., utilityFn(this.issues) → notify issues (the array may be mutated)
    //        externalFn(this.issue.id) → don't notify (just reading .id)
    if (!fieldName && t.isCallExpression(expr)) {
      const isSafeCall = t.isMemberExpression(expr.callee) && (
        t.isIdentifier(expr.callee.object, { name: 'Object' }) ||
        t.isIdentifier(expr.callee.object, { name: 'console' }) ||
        t.isIdentifier(expr.callee.object, { name: 'Math' }) ||
        t.isIdentifier(expr.callee.object, { name: 'JSON' })
      )
      if (!isSafeCall) {
        for (const arg of expr.arguments) {
          if (!t.isExpression(arg)) continue
          // Only match direct store field (this.field)
          const directField = getThisFieldAccess(arg, fieldNames)
          if (directField) {
            fieldName = directField
            break
          }
          // Match alias directly (e.g., `items` where `const items = this.field`)
          if (t.isIdentifier(arg) && aliasMap.has(arg.name)) {
            fieldName = aliasMap.get(arg.name)!
            break
          }
          // Match this.field.subProp passed to a standalone utility function
          // e.g., updateArrayItemById(this.project.issues, ...) → notify project
          // But NOT when calling methods on other objects (they handle their own notifications):
          // e.g., otherStore.method(this.issue.id, ...) → skip (otherStore notifies itself)
          if (t.isMemberExpression(arg) && !arg.computed && t.isIdentifier(expr.callee)) {
            const parentField = getThisFieldAccess(arg.object, fieldNames)
            if (parentField) {
              fieldName = parentField
              break
            }
            if (t.isIdentifier(arg.object) && aliasMap.has(arg.object.name)) {
              fieldName = aliasMap.get(arg.object.name)!
              break
            }
          }
        }
      }
    }

    if (!fieldName) continue

    stmts.splice(i + 1, 0, makeNotifyStmt(fieldName))
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

/**
 * Trace a member expression chain back to a root store field.
 * Handles: this.<field>, this.<field>[expr], this.<field>.subProp.subProp,
 * alias (from find/indexing), alias.subProp, etc.
 * Returns the root field name or null.
 */
function getThisFieldChainRoot(
  node: t.Node,
  fieldNames: Set<string>,
  aliasMap: Map<string, string>,
): string | null {
  // Direct: this.<field>
  const direct = getThisFieldAccess(node, fieldNames)
  if (direct) return direct

  // Alias: identifier that maps to a field
  if (t.isIdentifier(node) && aliasMap.has(node.name)) {
    return aliasMap.get(node.name)!
  }

  // Chain: x.y or x[y] → trace x
  if (t.isMemberExpression(node)) {
    return getThisFieldChainRoot(node.object, fieldNames, aliasMap)
  }

  return null
}

const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'])

// ─── Item property access transformation ─────────────────────────────────────
// Transforms item.prop → __itemSignal(item, 'prop').value in store methods/getters.
// This eliminates the need for makeItemReactive at runtime.

const ARRAY_ITEM_METHODS = new Set(['find', 'filter', 'map', 'forEach', 'some', 'every', 'findIndex', 'flatMap', 'reduce', 'sort'])

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
 * Check if a node traces back to a reactive source (store field or item alias)
 * through any chain of member expressions.
 */
function isReactiveChain(
  node: t.Node,
  fieldNames: Set<string>,
  itemAliases: Set<string>,
): boolean {
  if (getThisFieldAccess(node, fieldNames)) return true
  if (t.isIdentifier(node) && itemAliases.has(node.name)) return true
  if (t.isMemberExpression(node)) return isReactiveChain(node.object, fieldNames, itemAliases)
  return false
}

/**
 * Recursively walk AST and transform item property accesses.
 *
 * IMPORTANT: When a MemberExpression is the callee of a CallExpression,
 * the outermost property is a METHOD name (e.g. .push, .find) — not a data
 * property. We must NOT transform it via isItemPropertyAccess. Instead, we
 * walk only the callee's object so that sub-expressions like `col.taskIds`
 * in `col.taskIds.push(id)` DO get transformed to `itemSignal(col, 'taskIds').value`.
 */
function walkAndTransform(
  node: t.Node,
  fieldNames: Set<string>,
  itemAliases: Set<string>,
  onTransform: () => void,
  callbackItemParams: Set<string> = new Set(),
  looseMode: boolean = false,
): void {
  if (!node || typeof node !== 'object') return

  // ── CallExpression with MemberExpression callee ──────────────────
  // The callee's property is a method name — never transform it as a data access.
  if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
    const callee = node.callee
    const methodName = t.isIdentifier(callee.property) ? callee.property.name : null

    // Detect array method callbacks to find item params
    if (methodName && ARRAY_ITEM_METHODS.has(methodName)) {
      // Extended isOnArray: trace through this.<field>, aliases, AND nested access
      // e.g., this.todos, msgs (alias), this.messages[id], col.taskIds
      // In looseMode (standalone functions), skip the reactive chain check —
      // any .filter()/.map()/etc. callback params get item signal transforms.
      const isOnArray = looseMode || isReactiveChain(callee.object, fieldNames, itemAliases)
      if (isOnArray && node.arguments.length > 0) {
        const callback = node.arguments[0]
        if ((t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
            callback.params.length > 0) {
          // For reduce(), the item is the 2nd param (1st is accumulator)
          // For sort(), both params are items
          // For all other array methods, the item is the 1st param
          const isReduce = methodName === 'reduce'
          const isSort = methodName === 'sort'
          const itemParamIdx = isReduce ? 1 : 0
          const itemParam = callback.params[itemParamIdx]
          if (itemParam && t.isIdentifier(itemParam)) {
            const extendedParams = new Set(callbackItemParams)
            extendedParams.add(itemParam.name)
            // For sort(a, b), both a and b are items
            if (isSort && callback.params.length > 1) {
              const secondParam = callback.params[1]
              if (t.isIdentifier(secondParam)) extendedParams.add(secondParam.name)
            }
            // Walk callback body with extended params
            walkAndTransform(callback.body, fieldNames, itemAliases, onTransform, extendedParams, looseMode)
            // Walk other arguments normally
            for (let i = 1; i < node.arguments.length; i++) {
              walkAndTransform(node.arguments[i], fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
            }
            // Walk callee object (NOT the method property)
            walkAndTransform(callee.object, fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
            return // already handled children
          }
        }
      }
    }

    // For ALL method calls (including unrecognized array methods, push/pop/etc):
    // Walk the callee's object for transformable sub-expressions but NOT the method property.
    walkAndTransform(callee.object, fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
    if (callee.computed) {
      walkAndTransform(callee.property as t.Expression, fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
    }
    // Walk arguments
    for (const arg of node.arguments) {
      if (arg && typeof arg === 'object' && (arg as any).type) {
        walkAndTransform(arg as t.Node, fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
      }
    }
    return // already handled children
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
          walkAndTransform(item, fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkAndTransform(child, fieldNames, itemAliases, onTransform, callbackItemParams, looseMode)
    }
  }
}

/**
 * Transform item property access in standalone functions (not Store/Component methods).
 * Uses looseMode: any .filter()/.map()/.sort()/etc. callback params get item signal transforms,
 * regardless of whether the array is a known reactive source.
 * This handles patterns like:
 *   function filterIssues(issues, status) { return issues.filter(i => i.status === status) }
 */
export function transformStandaloneFunctionItemAccess(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
  usedHelpers: Set<RuntimeHelper>,
): void {
  const body = t.isBlockStatement(node.body) ? node.body : null
  if (!body) return

  let transformed = false
  const emptyFields = new Set<string>()
  const emptyAliases = new Set<string>()
  walkAndTransform(body, emptyFields, emptyAliases, () => { transformed = true }, new Set(), true)

  if (transformed) {
    usedHelpers.add('itemSignal')
  }
}
