/**
 * The A2UI security model is *naming, not shipping code*: a FunctionCall names
 * an entry in this map. Nothing here evaluates agent-supplied source.
 */

export type RegisteredFunction = (args: Record<string, unknown>) => unknown

/** Deliberately simple and total: `@` with a dot in the domain, no spaces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const BUILTIN_FUNCTIONS: Record<string, RegisteredFunction> = {
  /** Empty string / null / undefined fail. `0` and `false` are present values. */
  required(args) {
    const v = args.value
    if (v === null || v === undefined) return false
    if (typeof v === 'string') return v.length > 0
    return true
  },

  regex(args) {
    const { value, pattern } = args
    if (typeof value !== 'string' || typeof pattern !== 'string') return false
    return new RegExp(pattern).test(value)
  },

  email(args) {
    const v = args.value
    return typeof v === 'string' && EMAIL_RE.test(v)
  },

  formatString(args) {
    const template = args.template
    if (typeof template !== 'string') return ''
    return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
      const v = args[key]
      return v === undefined || v === null ? '' : String(v)
    })
  },

  /** UTC so output does not depend on the host timezone. */
  formatDate(args) {
    const v = args.value
    if (typeof v !== 'string' && typeof v !== 'number') return ''
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  },
}
