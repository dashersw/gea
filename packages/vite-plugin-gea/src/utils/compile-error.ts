import type { t } from './babel-interop.ts'

/** Source position in Vite's `loc` shape: 1-based line, 0-based column. */
export interface SourceLocation {
  file?: string
  line: number
  column: number
}

export interface GeaCompileError extends Error {
  __geaCompileError: true
  hint?: string
  loc?: SourceLocation
}

export function isGeaCompileError(error: unknown): error is GeaCompileError {
  return !!error && (error as GeaCompileError).__geaCompileError === true
}

/**
 * A deliberate compile error: source the compiler can't compile. `node` must
 * come from an AST parsed from the file's own source so its position is right.
 * The pipeline adds the file name and rethrows it, which fails `vite build`
 * and shows Vite's error overlay in dev.
 */
export function compilerError(message: string, node?: t.Node | null, hint?: string): GeaCompileError {
  const err = new Error(hint ? `${message}\n${hint}` : message) as GeaCompileError
  err.__geaCompileError = true
  if (hint) err.hint = hint
  const start = node?.loc?.start
  if (start) err.loc = { line: start.line, column: start.column }
  return err
}
