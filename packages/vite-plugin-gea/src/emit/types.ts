import type * as t from '@babel/types'

export type EmitMode = 'patch' | 'mount'

export interface EmitContext {
  mode: EmitMode
  guard: boolean
  useSanitizer: boolean
}

export const PATCH_CTX: EmitContext = { mode: 'patch', guard: true, useSanitizer: true }
export const MOUNT_CTX: EmitContext = { mode: 'mount', guard: false, useSanitizer: false }

export interface PatchEmitter {
  type: string
  emit(el: t.Expression, value: t.Expression, ctx: EmitContext, opts?: EmitterOpts): t.Statement[]
}

export interface EmitterOpts {
  attributeName?: string
  classToggleName?: string
  textNodeIndex?: number
  propName?: string
  isObjectClass?: boolean
  isBooleanAttr?: boolean
  isUrlAttr?: boolean
  isChildrenProp?: boolean
  canSkipClassCoercion?: boolean
}
