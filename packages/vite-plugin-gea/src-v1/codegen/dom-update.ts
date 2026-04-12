/**
 * Shared DOM update AST builder functions for the Gea compiler codegen.
 */
import { js, jsAll, jsExpr } from 'eszter'
import { t } from '../utils/babel-interop.ts'

/** el.textContent = expr */
export function setTextContent(el: t.Expression, expr: t.Expression): t.Statement {
  return js`${el}.textContent = ${expr};`
}

/** el.firstChild.nodeValue = expr */
export function setFirstChildNodeValue(el: t.Expression, expr: t.Expression): t.Statement {
  return js`${el}.firstChild.nodeValue = ${expr};`
}

/** el.className = expr */
export function setClassName(el: t.Expression, expr: t.Expression): t.Statement {
  return js`${el}.className = ${expr};`
}

/** el.classList.toggle(cls, expr) */
export function toggleClass(el: t.Expression, cls: string, expr: t.Expression): t.Statement {
  return js`${el}.classList.toggle(${cls}, ${expr});`
}

/** el.checked = expr */
export function setChecked(el: t.Expression, expr: t.Expression): t.Statement {
  return js`${el}.checked = ${expr};`
}

/** el.value = expr */
export function setValue(el: t.Expression, expr: t.Expression): t.Statement {
  return js`${el}.value = ${expr};`
}

/**
 * Attribute patch block.
 *
 * guard: true (default) — incremental patches with getAttribute equality check
 * guard: false — initial mount, simpler setAttribute(name, String(val))
 */
export function setAttribute(
  el: t.Expression,
  name: string,
  expr: t.Expression,
  { guard = true }: { guard?: boolean } = {},
): t.Statement[] {
  if (guard) {
    return jsAll`
      var __av = ${expr};
      if (__av == null || __av === false) {
        ${el}.removeAttribute(${name});
      } else {
        const __newAttr = String(__av);
        if (${t.cloneNode(el, true)}.getAttribute(${name}) !== __newAttr)
          ${t.cloneNode(el, true)}.setAttribute(${name}, __newAttr);
      }
    `
  }
  return jsAll`
    var __av = ${expr};
    if (__av == null || __av === false) ${el}.removeAttribute(${name});
    else ${t.cloneNode(el, true)}.setAttribute(${name}, String(__av));
  `
}

/**
 * Style attribute patch block with Object-to-cssText conversion.
 */
export function setStyleCssText(el: t.Expression, expr: t.Expression): t.Statement[] {
  const cssTextExpr = jsExpr`
    typeof __av === 'object'
      ? Object.entries(__av).map(([k, v]) => k.replace(/[A-Z]/g, '-$&') + ': ' + v).join('; ')
      : String(__av)
  `
  return jsAll`
    var __av = ${expr};
    if (__av == null || __av === false) {
      ${el}.removeAttribute('style');
    } else {
      ${t.cloneNode(el, true)}.style.cssText = ${cssTextExpr};
    }
  `
}

/** if (el.prop !== newVal) { update } */
export function withEqualityGuard(
  el: t.Expression,
  prop: string,
  newVal: t.Expression,
  update: t.Statement,
): t.Statement {
  return js`if (${jsExpr`${t.cloneNode(el, true)}.${t.identifier(prop)}`} !== ${newVal}) ${update}`
}
