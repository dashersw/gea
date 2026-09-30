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
  /** The file the error is in, once `withSourceFile` added it. */
  id?: string
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

/**
 * Put the file and location in the message and in Vite's `loc`, so the dev
 * overlay and a failed `vite build` both point at the source. Drops Babel's
 * `pos`: Vite would build a code frame from it without checking which code
 * it belongs to.
 */
export function withSourceFile(err: GeaCompileError, sourceFile: string): GeaCompileError {
  const where = err.loc ? `${sourceFile}:${err.loc.line}:${err.loc.column}` : sourceFile
  const [first, ...rest] = err.message.split('\n')
  const out = new Error([`[gea] ${first} (${where})`, ...rest].join('\n'), { cause: err.cause }) as GeaCompileError
  out.__geaCompileError = true
  out.hint = err.hint
  out.id = sourceFile
  if (err.loc) out.loc = { file: sourceFile, line: err.loc.line, column: err.loc.column }
  return out
}

/**
 * What `reportUnsupportedJsx` collected in the innermost `collectUnsupportedJsx`
 * without `strict`, keyed by position and message: the compiler can walk the
 * same JSX more than once. `null` while nothing collects, so a report throws.
 */
let unsupportedJsx: Map<string, GeaCompileError> | null = null

/**
 * JSX the compiler can't compile, which would render nothing or misbehave.
 * With `strict` (and outside `collectUnsupportedJsx`) this throws, which fails
 * the build. Otherwise it's collected as a warning, and the caller compiles
 * the code the way it did before the check existed.
 */
export function reportUnsupportedJsx(err: GeaCompileError): void {
  if (!unsupportedJsx) throw err
  const key = `${err.loc?.line}:${err.loc?.column}:${err.message}`
  if (!unsupportedJsx.has(key)) unsupportedJsx.set(key, err)
}

/** Run `fn` and return what `reportUnsupportedJsx` reported meanwhile. With `strict`, a report throws instead. */
export function collectUnsupportedJsx<T>(strict: boolean, fn: () => T): { result: T; warnings: GeaCompileError[] } {
  const outer = unsupportedJsx
  const collected = strict ? null : new Map<string, GeaCompileError>()
  unsupportedJsx = collected
  try {
    const result = fn()
    return { result, warnings: collected ? [...collected.values()] : [] }
  } finally {
    unsupportedJsx = outer
  }
}
