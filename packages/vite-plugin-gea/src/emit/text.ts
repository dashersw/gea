import { id, js } from 'eszter'
import { t } from '../utils/babel-interop.ts'
import { setTextContent } from '../codegen/dom-update.ts'
import type { EmitContext, PatchEmitter } from './types.ts'

export const textEmitter: PatchEmitter = {
  type: 'text',
  emit(el, value, ctx, opts) {
    if (opts?.textNodeIndex !== undefined) return emitTextNodeIndex(el, value, opts.textNodeIndex)
    if (opts?.isChildrenProp) return emitInnerHTML(el, value, ctx)
    if (!ctx.guard) return [setTextContent(el, value)]
    return [
      js`if (${t.cloneNode(el, true)}.textContent !== ${value}) ${setTextContent(t.cloneNode(el, true), t.cloneNode(value, true))}`,
    ]
  },
}

function emitTextNodeIndex(el: t.Expression, value: t.Expression, idx: number): t.Statement[] {
  return [
    js`{
    let __tn = ${el}.childNodes[${idx}];
    if (!__tn || __tn.nodeType !== 3) {
      __tn = document.createTextNode(${t.cloneNode(value, true)});
      ${t.cloneNode(el, true)}.insertBefore(__tn, ${t.cloneNode(el, true)}.childNodes[${idx}] || null);
    } else if (__tn.nodeValue !== ${t.cloneNode(value, true)}) {
      __tn.nodeValue = ${t.cloneNode(value, true)};
    }
  }`,
  ]
}

function emitInnerHTML(el: t.Expression, value: t.Expression, ctx: EmitContext): t.Statement[] {
  const assign = js`${el}.innerHTML = ${value};`
  if (!ctx.guard) return [assign]
  // Use GEA_PATCH_NODE for diff-based children updates so:
  // 1. Existing DOM node references stay valid (no stale refs after update)
  // 2. Runtime-added attributes (e.g. data-state) are preserved
  // Fall back to innerHTML when structure differs (multi-root or mismatched tag).
  return [
    js`{
    const __tw = document.createElement('template');
    __tw.innerHTML = ${t.cloneNode(value, true)};
    const __newEl = __tw.content.firstElementChild;
    const __existEl = ${t.cloneNode(el, true)}.firstElementChild;
    if (__newEl && __existEl && __tw.content.childNodes.length === 1) {
      this.constructor[${id('GEA_PATCH_NODE')}](__existEl, __newEl, true);
    } else if (${t.cloneNode(el, true)}.innerHTML !== ${t.cloneNode(value, true)}) {
      ${t.cloneNode(el, true)}.innerHTML = ${t.cloneNode(value, true)};
      this[${id('GEA_INSTANTIATE_CHILD_COMPONENTS')}]();
      if (this.parentComponent) this.parentComponent[${id('GEA_MOUNT_COMPILED_CHILD_COMPONENTS')}]();
    }
  }`,
  ]
}
