import { js } from 'eszter'
import { t } from '../utils/babel-interop.ts'
import { setAttribute } from '../codegen/dom-update.ts'
import type { EmitContext, EmitterOpts, PatchEmitter } from './types.ts'

export const attributeEmitter: PatchEmitter = {
  type: 'attribute',
  emit(el, value, ctx, opts) {
    const attrName = opts?.attributeName ?? ''
    if (attrName === 'style') return emitStyle(el, value, ctx)
    if (attrName === 'dangerouslySetInnerHTML') return emitDangerousInnerHTML(el, value, ctx)
    if (opts?.isBooleanAttr) return emitBooleanAttr(el, value, attrName, ctx)
    if (opts?.isUrlAttr && ctx.useSanitizer) return emitUrlAttr(el, value, attrName, ctx)
    return setAttribute(el, attrName, value, { guard: ctx.guard })
  },
}

function emitStyle(el: t.Expression, value: t.Expression, ctx: EmitContext): t.Statement[] {
  if (!ctx.guard) {
    return [js`{
      var __av = ${value};
      if (__av == null || __av === false) ${t.cloneNode(el, true)}.removeAttribute('style');
      else ${t.cloneNode(el, true)}.style.cssText = typeof __av === 'object'
        ? Object.entries(__av).map(([k, v]) => k.replace(/[A-Z]/g, '-$&') + ': ' + v).join('; ')
        : String(__av);
    }`]
  }
  return [js`{
    var __av = ${value};
    if (__av == null || __av === undefined) {
      ${t.cloneNode(el, true)}.removeAttribute('style');
    } else {
      const __newCss = typeof __av === 'object'
        ? Object.entries(__av).map(([k, v]) => k.replace(/[A-Z]/g, '-$&') + ': ' + v).join('; ')
        : String(__av);
      if (${t.cloneNode(el, true)}.style.cssText !== __newCss)
        ${t.cloneNode(el, true)}.style.cssText = __newCss;
    }
  }`]
}

function emitDangerousInnerHTML(el: t.Expression, value: t.Expression, ctx: EmitContext): t.Statement[] {
  if (!ctx.guard) return [js`${el}.innerHTML = String(${value});`]
  return [js`{
    const __newHtml = String(${value});
    if (${t.cloneNode(el, true)}.innerHTML !== __newHtml) ${t.cloneNode(el, true)}.innerHTML = __newHtml;
  }`]
}

function emitBooleanAttr(el: t.Expression, value: t.Expression, attr: string, ctx: EmitContext): t.Statement[] {
  if (!ctx.guard) {
    return [js`if (!${value}) ${el}.removeAttribute(${attr}); else ${t.cloneNode(el, true)}.setAttribute(${attr}, '');`]
  }
  return [js`if (!${value}) {
    ${el}.removeAttribute(${attr});
  } else {
    const __newAttr = '';
    if (${t.cloneNode(el, true)}.getAttribute(${attr}) !== __newAttr)
      ${t.cloneNode(el, true)}.setAttribute(${attr}, __newAttr);
  }`]
}

function emitUrlAttr(el: t.Expression, value: t.Expression, attr: string, ctx: EmitContext): t.Statement[] {
  if (!ctx.guard) {
    return [js`{
      var __av = ${value};
      if (__av == null || __av === false) ${el}.removeAttribute(${attr});
      else ${t.cloneNode(el, true)}.setAttribute(${attr}, __sanitizeAttr(${attr}, String(__av)));
    }`]
  }
  return [js`{
    var __av = ${value};
    if (__av == null || __av === undefined) {
      ${el}.removeAttribute(${attr});
    } else {
      const __newAttr = __sanitizeAttr(${attr}, String(__av));
      if (${t.cloneNode(el, true)}.getAttribute(${attr}) !== __newAttr)
        ${t.cloneNode(el, true)}.setAttribute(${attr}, __newAttr);
    }
  }`]
}
