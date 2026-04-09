import { js } from 'eszter'
import { t } from '../utils/babel-interop.ts'
import type { PatchEmitter } from './types.ts'

export const checkedEmitter: PatchEmitter = {
  type: 'checked',
  emit(el, value, ctx, opts) {
    const propName = opts?.attributeName ?? 'checked'
    const coerced =
      propName === 'checked'
        ? js`${el}.${t.identifier(propName)} = !!${value};`
        : js`${el}.${t.identifier(propName)} = !!${value};`
    if (!ctx.guard) return [coerced]
    return [coerced]
  },
}
