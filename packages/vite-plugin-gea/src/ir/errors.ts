import type * as t from '@babel/types'

/** Format a compiler error with the [gea] prefix and optional source location. */
export function compilerError(message: string, node?: t.Node, fileName?: string): Error {
  const loc = node?.loc?.start
  const location = loc && fileName ? ` (${fileName}:${loc.line}:${loc.column})` : ''
  const err = new Error(`[gea] ${message}${location}`)
  ;(err as any).__geaCompileError = true
  return err
}
