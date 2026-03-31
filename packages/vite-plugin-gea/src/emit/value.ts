import { js } from 'eszter'
import { t } from '../utils/babel-interop.ts'
import type { EmitContext, EmitterOpts, PatchEmitter } from './types.ts'

export const valueEmitter: PatchEmitter = {
  type: 'value',
  emit(el, value, ctx, opts) {
    const propName = opts?.attributeName ?? 'value'
    return [js`${el}.${t.identifier(propName)} = (${value} == null) ? '' : String(${value});`]
  },
}
