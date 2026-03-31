import { js, jsExpr } from 'eszter'
import { t } from '../utils/babel-interop.ts'
import { setTextContent, setFirstChildNodeValue } from '../codegen/dom-update.ts'
import type { EmitContext, EmitterOpts, PatchEmitter } from './types.ts'

export const textEmitter: PatchEmitter = {
  type: 'text',
  emit(el, value, ctx, opts) {
    if (opts?.textNodeIndex !== undefined) return emitTextNodeIndex(el, value, opts.textNodeIndex)
    if (opts?.isChildrenProp) return emitInnerHTML(el, value, ctx)
    if (!ctx.guard) return [setTextContent(el, value)]
    return [js`if (${t.cloneNode(el, true)}.textContent !== ${value}) ${setTextContent(t.cloneNode(el, true), t.cloneNode(value, true))}`]
  },
}

function emitTextNodeIndex(el: t.Expression, value: t.Expression, idx: number): t.Statement[] {
  return [js`{
    let __tn = ${el}.childNodes[${idx}];
    if (!__tn || __tn.nodeType !== 3) {
      __tn = document.createTextNode(${t.cloneNode(value, true)});
      ${t.cloneNode(el, true)}.insertBefore(__tn, ${t.cloneNode(el, true)}.childNodes[${idx}] || null);
    } else if (__tn.nodeValue !== ${t.cloneNode(value, true)}) {
      __tn.nodeValue = ${t.cloneNode(value, true)};
    }
  }`]
}

function emitInnerHTML(el: t.Expression, value: t.Expression, ctx: EmitContext): t.Statement[] {
  const assign = js`${el}.innerHTML = ${value};`
  if (!ctx.guard) return [assign]
  return [js`if (${t.cloneNode(el, true)}.innerHTML !== ${t.cloneNode(value, true)}) {
    ${t.cloneNode(el, true)}.innerHTML = ${t.cloneNode(value, true)};
    this.instantiateChildComponents_();
    if (this.parentComponent) this.parentComponent.mountCompiledChildComponents_();
  }`]
}
