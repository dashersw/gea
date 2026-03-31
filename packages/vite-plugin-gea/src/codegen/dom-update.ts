/**
 * Shared DOM update AST builder functions for the Gea compiler codegen.
 *
 * Provides low-level helpers that construct Babel AST nodes for common
 * DOM mutation patterns (textContent, className, setAttribute, etc.)
 * used across gen-observe-helpers, gen-array-patch, gen-clone, and
 * gen-prop-change.
 */
import { t } from '../utils/babel-interop.ts'

// ─── el.textContent = expr ─────────────────────────────────────────

/** el.textContent = expr */
export function setTextContent(el: t.Expression, expr: t.Expression): t.Statement {
  return t.expressionStatement(
    t.assignmentExpression('=', t.memberExpression(el, t.identifier('textContent')), expr),
  )
}

// ─── el.firstChild.nodeValue = expr ───────────────────────────────

/** el.firstChild.nodeValue = expr (for patching text inside elements with child nodes) */
export function setFirstChildNodeValue(el: t.Expression, expr: t.Expression): t.Statement {
  return t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(t.memberExpression(el, t.identifier('firstChild')), t.identifier('nodeValue')),
      expr,
    ),
  )
}

// ─── el.className = expr ───────────────────────────────────────────

/** el.className = expr */
export function setClassName(el: t.Expression, expr: t.Expression): t.Statement {
  return t.expressionStatement(
    t.assignmentExpression('=', t.memberExpression(el, t.identifier('className')), expr),
  )
}

// ─── el.classList.toggle(cls, expr) ───────────────────────────────

/** el.classList.toggle(cls, expr) */
export function toggleClass(el: t.Expression, cls: string, expr: t.Expression): t.Statement {
  return t.expressionStatement(
    t.callExpression(
      t.memberExpression(t.memberExpression(el, t.identifier('classList')), t.identifier('toggle')),
      [t.stringLiteral(cls), expr],
    ),
  )
}

// ─── el.checked = expr ────────────────────────────────────────────

/** el.checked = expr */
export function setChecked(el: t.Expression, expr: t.Expression): t.Statement {
  return t.expressionStatement(
    t.assignmentExpression('=', t.memberExpression(el, t.identifier('checked')), expr),
  )
}

// ─── el.value = expr ──────────────────────────────────────────────

/** el.value = expr */
export function setValue(el: t.Expression, expr: t.Expression): t.Statement {
  return t.expressionStatement(
    t.assignmentExpression('=', t.memberExpression(el, t.identifier('value')), expr),
  )
}

// ─── el.setAttribute / el.removeAttribute ─────────────────────────

/**
 * Emit an attribute patch block.
 *
 * With `guard: true` (the default, used in array-patch for incremental updates):
 *
 *   var __av = expr;
 *   if (__av == null || __av === false) {
 *     el.removeAttribute(name)
 *   } else {
 *     const __newAttr = String(__av);
 *     if (el.getAttribute(name) !== __newAttr) el.setAttribute(name, __newAttr);
 *   }
 *
 * With `guard: false` (used in clone template for initial mount):
 *
 *   var __av = expr;
 *   if (__av == null || __av === false) el.removeAttribute(name)
 *   else el.setAttribute(name, String(__av))
 *
 * Returns an array of statements; callers should spread into the surrounding body.
 */
export function setAttribute(
  el: t.Expression,
  name: string,
  expr: t.Expression,
  { guard = true }: { guard?: boolean } = {},
): t.Statement[] {
  const attrVal = t.identifier('__av')
  const nullishTest = t.logicalExpression(
    '||',
    t.binaryExpression('==', t.cloneNode(attrVal), t.nullLiteral()),
    t.binaryExpression('===', t.cloneNode(attrVal), t.booleanLiteral(false)),
  )
  const removeStmt = t.expressionStatement(
    t.callExpression(t.memberExpression(el, t.identifier('removeAttribute')), [t.stringLiteral(name)]),
  )

  let setStmt: t.Statement
  if (guard) {
    setStmt = t.blockStatement([
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier('__newAttr'),
          t.callExpression(t.identifier('String'), [t.cloneNode(attrVal)]),
        ),
      ]),
      t.ifStatement(
        t.binaryExpression(
          '!==',
          t.callExpression(t.memberExpression(t.cloneNode(el, true), t.identifier('getAttribute')), [
            t.stringLiteral(name),
          ]),
          t.identifier('__newAttr'),
        ),
        t.expressionStatement(
          t.callExpression(t.memberExpression(t.cloneNode(el, true), t.identifier('setAttribute')), [
            t.stringLiteral(name),
            t.identifier('__newAttr'),
          ]),
        ),
      ),
    ])
  } else {
    setStmt = t.expressionStatement(
      t.callExpression(t.memberExpression(t.cloneNode(el, true), t.identifier('setAttribute')), [
        t.stringLiteral(name),
        t.callExpression(t.identifier('String'), [t.cloneNode(attrVal)]),
      ]),
    )
  }

  return [
    t.variableDeclaration('var', [t.variableDeclarator(attrVal, expr)]),
    t.ifStatement(nullishTest, removeStmt, setStmt),
  ]
}

// ─── el.style.cssText = expr (or removeAttribute('style')) ────────

/**
 * Emit the style attribute patch block:
 *
 *   var __av = expr;
 *   if (__av == null || __av === false) {
 *     el.removeAttribute('style')
 *   } else {
 *     el.style.cssText = typeof __av === 'object'
 *       ? Object.entries(__av).map(([k, v]) => k.replace(/[A-Z]/g, '-$&') + ': ' + v).join('; ')
 *       : String(__av)
 *   }
 *
 * Returns two statements; callers should spread into the surrounding body.
 */
export function setStyleCssText(el: t.Expression, expr: t.Expression): t.Statement[] {
  const attrVal = t.identifier('__av')
  const cssTextExpr = t.conditionalExpression(
    t.binaryExpression('===', t.unaryExpression('typeof', t.cloneNode(attrVal)), t.stringLiteral('object')),
    t.callExpression(
      t.memberExpression(
        t.callExpression(
          t.memberExpression(
            t.callExpression(t.memberExpression(t.identifier('Object'), t.identifier('entries')), [
              t.cloneNode(attrVal),
            ]),
            t.identifier('map'),
          ),
          [
            t.arrowFunctionExpression(
              [t.arrayPattern([t.identifier('k'), t.identifier('v')])],
              t.binaryExpression(
                '+',
                t.binaryExpression(
                  '+',
                  t.callExpression(t.memberExpression(t.identifier('k'), t.identifier('replace')), [
                    t.regExpLiteral('[A-Z]', 'g'),
                    t.stringLiteral('-$&'),
                  ]),
                  t.stringLiteral(': '),
                ),
                t.identifier('v'),
              ),
            ),
          ],
        ),
        t.identifier('join'),
      ),
      [t.stringLiteral('; ')],
    ),
    t.callExpression(t.identifier('String'), [t.cloneNode(attrVal)]),
  )
  return [
    t.variableDeclaration('var', [t.variableDeclarator(attrVal, expr)]),
    t.ifStatement(
      t.logicalExpression(
        '||',
        t.binaryExpression('==', t.cloneNode(attrVal), t.nullLiteral()),
        t.binaryExpression('===', t.cloneNode(attrVal), t.booleanLiteral(false)),
      ),
      t.expressionStatement(
        t.callExpression(t.memberExpression(el, t.identifier('removeAttribute')), [t.stringLiteral('style')]),
      ),
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(t.memberExpression(t.cloneNode(el, true), t.identifier('style')), t.identifier('cssText')),
          cssTextExpr,
        ),
      ),
    ),
  ]
}

// ─── Equality guard wrapper ────────────────────────────────────────

/**
 * Wrap `update` in an equality guard:
 *
 *   if (el.prop !== newVal) { update }
 */
export function withEqualityGuard(
  el: t.Expression,
  prop: string,
  newVal: t.Expression,
  update: t.Statement,
): t.Statement {
  return t.ifStatement(
    t.binaryExpression('!==', t.memberExpression(t.cloneNode(el, true), t.identifier(prop)), newVal),
    update,
  )
}
