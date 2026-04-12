import type { t } from '../utils/babel-interop.ts'
import type { EmitterOpts, PatchEmitter } from './types.ts'
import { PATCH_CTX, MOUNT_CTX } from './types.ts'
import { textEmitter } from './text.ts'
import { classEmitter } from './class.ts'
import { attributeEmitter } from './attribute.ts'
import { checkedEmitter } from './checked.ts'
import { valueEmitter } from './value.ts'

const emitters = new Map<string, PatchEmitter>()

function register(emitter: PatchEmitter) {
  emitters.set(emitter.type, emitter)
}

register(textEmitter)
register(classEmitter)
register(attributeEmitter)
register(checkedEmitter)
register(valueEmitter)

export function getEmitter(type: string): PatchEmitter | undefined {
  return emitters.get(type)
}

export function emitPatch(type: string, el: t.Expression, value: t.Expression, opts?: EmitterOpts): t.Statement[] {
  const emitter = emitters.get(type)
  if (!emitter) return []
  return emitter.emit(el, value, PATCH_CTX, opts)
}

export function emitMount(type: string, el: t.Expression, value: t.Expression, opts?: EmitterOpts): t.Statement[] {
  const emitter = emitters.get(type)
  if (!emitter) return []
  return emitter.emit(el, value, MOUNT_CTX, opts)
}

export interface PatchEntryLike {
  type: string
  expression: t.Expression
  attributeName?: string
  childPath?: number[]
  classToggleName?: string
}

export function applyEntries(
  entries: PatchEntryLike[],
  resolveEl: (entry: PatchEntryLike) => t.Expression,
  mode: 'patch' | 'mount',
  extraOpts?: (entry: PatchEntryLike) => EmitterOpts,
): t.Statement[] {
  const ctx = mode === 'patch' ? PATCH_CTX : MOUNT_CTX
  return entries.flatMap((entry) => {
    const el = resolveEl(entry)
    const type = entry.type === 'className' ? 'class' : entry.type
    const emitter = emitters.get(type)
    if (!emitter) return []
    const opts: EmitterOpts = {
      attributeName: entry.attributeName,
      classToggleName: entry.classToggleName,
      ...extraOpts?.(entry),
    }
    return emitter.emit(el, entry.expression, ctx, opts)
  })
}

export { PATCH_CTX, MOUNT_CTX }
