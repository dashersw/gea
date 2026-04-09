import { js, jsExpr } from 'eszter'
import { t } from '../utils/babel-interop.ts'
import { setClassName, toggleClass } from '../codegen/dom-update.ts'
import type { PatchEmitter } from './types.ts'

export const classEmitter: PatchEmitter = {
  type: 'class',
  emit(el, value, ctx, opts) {
    if (opts?.classToggleName) return [toggleClass(el, opts.classToggleName, value)]

    const classValue = opts?.isObjectClass
      ? jsExpr`Object.entries(${value}).filter(([__k, __v]) => __v).map(([__k]) => __k).join(' ').trim()`
      : opts?.canSkipClassCoercion
        ? value
        : jsExpr`(String(${value} ?? '')).trim().replace(/\\s+/g, ' ')`

    if (!ctx.guard) return [setClassName(el, classValue)]
    return [
      js`{
      const __newClass = ${classValue};
      if (${t.cloneNode(el, true)}.className !== __newClass) ${t.cloneNode(el, true)}.className = __newClass;
    }`,
    ]
  },
}
