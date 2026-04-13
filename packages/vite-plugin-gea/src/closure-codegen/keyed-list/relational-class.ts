import type { Statement, BlockStatement, Expression } from '@babel/types'
import { t } from '../../utils/babel-interop.ts'
import type { EmitContext } from '../emit/emit-context.ts'
import { substituteBindings } from '../emit/emit-substitution.ts'
import { tryExtractPathAndRoot } from '../utils/path-helpers.ts'

/**
 * Relational-class optimization: the pattern
 *   <tr class={storeExpr === item.key ? 'cls' : ''}> (or `'' : 'cls'`)
 * inside a keyed-list `.map(item => ...)` callback. Instead of installing N
 * per-row `reactiveClass` effects that all re-evaluate on every `storeExpr`
 * change, we install ONE subscribe at the list scope that toggles the class
 * on two specific rows via a shared `key → element` map.
 *
 * See packages/gea/src/runtime/relational-class.ts for the runtime helper.
 */
export interface RelationalClassMatch {
  /** Stable id for the emitted `__rowEls_<id>` + `relationalClass` call. */
  id: string
  /** Path on the store for the `storeExpr` (must be static — e.g. `['selected']`). */
  storePath: string[]
  /** Root expression for the store (`this`, or an imported identifier like `store`). */
  storeRoot: Expression
  /** The AST of `storeExpr` (e.g. `store.selected`), substituted with ctx bindings. */
  storeExpr: Expression
  /** Item property name for the equality's item side (e.g. `'id'` for `item.id`). */
  itemKeyProp: string
  /** CSS class to toggle (non-empty string literal). */
  cls: string
}

/**
 * Walk the root `openingElement` of a JSXElement and detect + STRIP any
 * `class={store.X === item.Y ? 'cls' : ''}` attributes (or the swapped
 * `'' : 'cls'` form). Returns one match per recognized attribute.
 *
 * Only the ROOT element's class attribute is considered — the per-row
 * `relationalClass` setup registers `root` (the cloned DOM root of the
 * createItem body), so nested elements wouldn't match. Also, applying the
 * optimization to nested elements would require extra ref captures; the
 * benchmark-shaped layouts only need the root case.
 */
export function detectAndStripRelationalClass(jsxEl: any, itemName: string, ctx: EmitContext): RelationalClassMatch[] {
  const open = jsxEl.openingElement
  if (!open || !Array.isArray(open.attributes)) return []
  const matches: RelationalClassMatch[] = []
  const keep: any[] = []
  for (const attr of open.attributes) {
    if (!t.isJSXAttribute(attr)) {
      keep.push(attr)
      continue
    }
    if (!t.isJSXIdentifier(attr.name) || (attr.name.name !== 'class' && attr.name.name !== 'className')) {
      keep.push(attr)
      continue
    }
    if (!attr.value || !t.isJSXExpressionContainer(attr.value)) {
      keep.push(attr)
      continue
    }
    const expr = attr.value.expression
    if (!t.isConditionalExpression(expr)) {
      keep.push(attr)
      continue
    }
    // Pattern: A === B ? 'str' : 'str' (with one side empty).
    if (!t.isBinaryExpression(expr.test) || expr.test.operator !== '===') {
      keep.push(attr)
      continue
    }
    const cls = extractToggleClass(expr.consequent, expr.alternate)
    if (!cls) {
      keep.push(attr)
      continue
    }
    const parts = identifyStoreAndItem(expr.test.left, expr.test.right, itemName)
    if (!parts) {
      keep.push(attr)
      continue
    }
    // Substitute bindings into the store expression AT DETECTION TIME — once
    // stripped, the normal slot-emission path won't do it for us.
    const storeExpr = substituteBindings(parts.storeExpr, ctx.bindings)
    const info = tryExtractPathAndRoot(storeExpr)
    // Props-rooted paths and non-static expressions can't use the subscribe
    // fast path — fall through to the normal reactiveClass emission.
    if (!info) {
      keep.push(attr)
      continue
    }
    if (info.path[0] === 'props') {
      keep.push(attr)
      continue
    }
    // `this.X` where X is a class getter — the Store.observe on `this.X`
    // doesn't reliably fire for derived values. Fall through to reactiveClass
    // which goes via withTracking.
    if (t.isThisExpression(info.root) && ctx.classGetters.has(info.path[0])) {
      keep.push(attr)
      continue
    }
    const id = 'r' + ctx.relClassCounter++
    matches.push({
      id,
      storePath: info.path,
      storeRoot: info.root,
      storeExpr,
      itemKeyProp: parts.itemProp,
      cls,
    })
    // Drop this attribute — the optimized path handles it.
  }
  if (matches.length > 0) open.attributes = keep
  return matches
}

/** Extract the single toggle-class string from the ternary branches.
 * Accepts `'cls' : ''` / `'' : 'cls'` / `'cls' : null`. Returns null otherwise. */
function extractToggleClass(consequent: any, alternate: any): string | null {
  const isEmpty = (n: any): boolean =>
    (t.isStringLiteral(n) && n.value === '') || t.isNullLiteral(n) || t.isIdentifier(n, { name: 'undefined' })
  if (t.isStringLiteral(consequent) && consequent.value !== '' && isEmpty(alternate)) {
    return consequent.value
  }
  if (t.isStringLiteral(alternate) && alternate.value !== '' && isEmpty(consequent)) {
    // `X === Y ? '' : 'cls'` — swap semantics to `X !== Y ? 'cls' : ''`.
    // We don't emit a !== form; instead, the runtime toggles `cls` when
    // `prev === key` and removes it when `val === key`. That's the inverse
    // of the common case, so we skip this variant for now and let the
    // standard reactiveClass path handle it. Returning null falls through.
    return null
  }
  return null
}

/** Identify which side of the equality is `item.X` and which is the store
 * expression. Returns `{ storeExpr, itemProp }` or null if neither side
 * fits the `item.<prop>` shape. */
function identifyStoreAndItem(left: any, right: any, itemName: string): { storeExpr: any; itemProp: string } | null {
  const asItemProp = (n: any): string | null => {
    if (!t.isMemberExpression(n) || n.computed) return null
    if (!t.isIdentifier(n.object, { name: itemName })) return null
    if (!t.isIdentifier(n.property)) return null
    return n.property.name
  }
  const li = asItemProp(left)
  const ri = asItemProp(right)
  if (ri && !li) return { storeExpr: left, itemProp: ri }
  if (li && !ri) return { storeExpr: right, itemProp: li }
  return null
}

/** Inject the per-row registration + initial-class application into the
 * createItem block. The injected statements go right after the first
 * statement (which is `const root = (tplRoot || (tplRoot = createTpl())).cloneNode(true)`)
 * so they reference `root` in the same scope. */
export function injectRelationalClassIntoCreateItem(
  block: BlockStatement,
  matches: RelationalClassMatch[],
  itemParam: any,
): void {
  // Locate insertion point: right after the first statement (the template
  // clone). We insert all per-row wiring in one block and let the disposer
  // `d.add(...)` append at the end of the original body runs via normal flow.
  const insertAt = 1
  const itemId = t.isIdentifier(itemParam) ? itemParam : t.identifier('item')
  const perRow: Statement[] = []
  for (const m of matches) {
    const keyReadForCmp = t.memberExpression(t.cloneNode(itemId), t.identifier(m.itemKeyProp))
    const mapId = t.identifier('__rowEls_' + m.id)
    // __rowEls_N[item.Y] = root  (skipped when useByKey: relational class
    // looks up via keyedList's byKey Map — no per-row stash needed).
    if (!(m as any).useByKey) {
      const keyReadForReg = t.memberExpression(itemId, t.identifier(m.itemKeyProp))
      perRow.push(
        t.expressionStatement(
          t.assignmentExpression('=', t.memberExpression(mapId, keyReadForReg, true), t.identifier('root')),
        ),
      )
    }
    // if (storeExpr === item.Y) root.className = 'cls'
    //
    // Direct `.className =` assignment beats `classList.add()` by ~3-5×
    // because classList.add parses the existing DOMTokenList, checks for
    // duplicates, and re-serializes. Safe here: the relational-class
    // detector already STRIPPED the base `class={...}` attribute from JSX,
    // so the cloned row root has no class attribute at createItem time.
    // For the one row per list that matches the initial store value, a
    // single assignment is all we need.
    perRow.push(
      t.ifStatement(
        t.binaryExpression('===', t.cloneNode(m.storeExpr), keyReadForCmp),
        t.expressionStatement(
          t.assignmentExpression(
            '=',
            t.memberExpression(t.identifier('root'), t.identifier('className')),
            t.stringLiteral(m.cls),
          ),
        ),
      ),
    )
    // NOTE: the `delete __rowEls_N[item.Y]` cleanup is hoisted from per-row
    // `d.add(...)` into the keyed-list's `onRemove` config. Keeping it out
    // of the row's disposer lets the `noRowDisposer` flag kick in on
    // benchmark-style rows with no other cleanup work, eliminating a full
    // Disposer + fns[] + child-bridge-closure allocation per row.
  }
  block.body.splice(insertAt, 0, ...perRow)
}

/** Emit the list-scope setup: `const __rowEls_N = {}` + `relationalClass(d, root, ['path'], __rowEls_N, 'cls', storeExpr)`. */
export function emitRelationalClassSetup(
  m: RelationalClassMatch,
  stmts: Statement[],
  ctx: EmitContext,
  options: { inlineDirectProp?: boolean } = {},
): void {
  const helperName = m.storePath.length === 1 ? 'relationalClassProp' : 'relationalClass'
  ctx.importsNeeded.add(helperName)
  const pathOrPropArg =
    helperName === 'relationalClassProp'
      ? t.stringLiteral(m.storePath[0])
      : t.arrayExpression(m.storePath.map((p) => t.stringLiteral(p)))

  if ((m as any).useByKey) {
    // byKey-reuse path: declare a `let __byKey_<id>` placeholder. The
    // enclosing keyedList call will set it via `onByKeyCreated`. Pass a
    // lookup function `(k) => __byKey_<id>.get(String(k))?.element` to
    // relationalClass — no per-row `__rowEls[k] = root` write, no
    // onRemove cleanup. Saves per-row create + per-row clear overhead.
    const byKeyId = t.identifier('__byKey_' + m.id)
    stmts.push(t.variableDeclaration('let', [t.variableDeclarator(byKeyId, t.nullLiteral())]))
    if (options.inlineDirectProp && helperName === 'relationalClassProp') {
      ctx.importsNeeded.delete(helperName)
      emitDirectByKeyRelationalClassProp(m, byKeyId, stmts, ctx)
      return
    }
    // (k) => __byKey_<id> && __byKey_<id>.get(k)?.element
    //
    // CRITICAL: do NOT String-wrap the key. byKey stores keys with whatever
    // type keyFn returns (raw — for `key={item.id}` with numeric id, key is
    // a number). Same type-match invariant that caused the earlier
    // `String("4") !== 4` bug in skipRuntimeStamps + keyFn skip. Use the
    // raw key value here; the storeExpr's runtime value (e.g. store.selected)
    // must match keyFn's return type for the relational class to work, which
    // is the compiler-side invariant we're already assuming (the byKey
    // detection gates on `item.<Y>` equaling the key expression).
    const kArg = t.identifier('k')
    const lookupArrow = t.arrowFunctionExpression(
      [kArg],
      t.logicalExpression(
        '&&',
        t.cloneNode(byKeyId),
        t.optionalMemberExpression(
          t.callExpression(t.memberExpression(t.cloneNode(byKeyId), t.identifier('get')), [kArg]),
          t.identifier('element'),
          false,
          true,
        ),
      ),
    )
    stmts.push(
      t.expressionStatement(
        t.callExpression(t.identifier(helperName), [
          t.identifier('d'),
          m.storeRoot,
          pathOrPropArg,
          lookupArrow,
          t.stringLiteral(m.cls),
          t.cloneNode(m.storeExpr),
        ]),
      ),
    )
    return
  }
  const mapId = t.identifier('__rowEls_' + m.id)
  stmts.push(t.variableDeclaration('const', [t.variableDeclarator(mapId, t.objectExpression([]))]))
  stmts.push(
    t.expressionStatement(
      t.callExpression(t.identifier(helperName), [
        t.identifier('d'),
        m.storeRoot,
        pathOrPropArg,
        t.cloneNode(mapId) as any,
        t.stringLiteral(m.cls),
        t.cloneNode(m.storeExpr),
      ]),
    ),
  )
}

function emitDirectByKeyRelationalClassProp(
  m: RelationalClassMatch,
  byKeyId: Expression,
  stmts: Statement[],
  ctx: EmitContext,
): void {
  ctx.importsNeeded.add('GEA_OBSERVE_DIRECT')
  const currentId = t.identifier('__rel_' + m.id)
  const updateId = t.identifier('__relUpdate_' + m.id)
  const nextId = t.identifier('v')
  const prevEntryId = t.identifier('__prev_' + m.id)
  const nextEntryId = t.identifier('__next_' + m.id)
  stmts.push(
    t.variableDeclaration('let', [t.variableDeclarator(currentId, t.cloneNode(m.storeExpr))]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        updateId,
        t.arrowFunctionExpression(
          [nextId],
          t.blockStatement([
            t.ifStatement(t.binaryExpression('===', t.cloneNode(nextId), t.cloneNode(currentId)), t.returnStatement()),
            t.variableDeclaration('const', [
              t.variableDeclarator(
                prevEntryId,
                t.logicalExpression(
                  '&&',
                  t.cloneNode(byKeyId),
                  t.callExpression(t.memberExpression(t.cloneNode(byKeyId), t.identifier('get')), [
                    t.cloneNode(currentId),
                  ]),
                ),
              ),
            ]),
            t.ifStatement(
              t.cloneNode(prevEntryId),
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.memberExpression(t.cloneNode(prevEntryId), t.identifier('element')),
                    t.identifier('className'),
                  ),
                  t.stringLiteral(''),
                ),
              ),
            ),
            t.variableDeclaration('const', [
              t.variableDeclarator(
                nextEntryId,
                t.logicalExpression(
                  '&&',
                  t.cloneNode(byKeyId),
                  t.callExpression(t.memberExpression(t.cloneNode(byKeyId), t.identifier('get')), [
                    t.cloneNode(nextId),
                  ]),
                ),
              ),
            ]),
            t.ifStatement(
              t.cloneNode(nextEntryId),
              t.expressionStatement(
                t.assignmentExpression(
                  '=',
                  t.memberExpression(
                    t.memberExpression(t.cloneNode(nextEntryId), t.identifier('element')),
                    t.identifier('className'),
                  ),
                  t.stringLiteral(m.cls),
                ),
              ),
            ),
            t.expressionStatement(t.assignmentExpression('=', t.cloneNode(currentId), t.cloneNode(nextId))),
          ]),
        ),
      ),
    ]),
    t.expressionStatement(
      t.callExpression(t.memberExpression(t.cloneNode(m.storeRoot), t.identifier('GEA_OBSERVE_DIRECT'), true), [
        t.stringLiteral(m.storePath[0]),
        t.cloneNode(updateId),
      ]),
    ),
  )
}

/**
 * If the JSX root of a map callback body has a `key={expr}` attribute, return
 * that expression. Otherwise return null.
 */
export function extractKeyFromJsxRoot(body: any): Expression | null {
  if (!body) return null
  const root = t.isJSXElement(body) ? body : null
  if (!root) return null
  for (const attr of root.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue
    if (!t.isJSXIdentifier(attr.name, { name: 'key' })) continue
    if (attr.value && t.isJSXExpressionContainer(attr.value)) return attr.value.expression as Expression
    if (attr.value && t.isStringLiteral(attr.value)) return attr.value
  }
  return null
}
