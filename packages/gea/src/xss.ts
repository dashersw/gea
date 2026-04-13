/**
 * XSS safety helpers — escape HTML entities and sanitize URL attributes.
 * Under the closure-compiled runtime, component instances are no longer mixed
 * into template-literal string concatenation, so the `GEA_COMPILED` escape is
 * unnecessary. Arrays of strings are still joined without escaping to preserve
 * the runtime-only HTML string contract.
 */

const _ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function stripControlChars(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code > 0x1f && code !== 0x7f) out += value[i]
  }
  return out
}

export function escapeHtml(val: unknown): string {
  if (Array.isArray(val)) {
    let out = ''
    for (const x of val) out += typeof x === 'string' ? x : escapeHtml(x)
    return out
  }
  return String(val ?? '').replace(/[&<>"']/g, (c) => _ESC[c])
}

export function sanitizeAttr(name: string, val: unknown): string {
  const str = String(val ?? '')
  if (!/^(href|src|action|formaction|data|cite|poster|background)$/i.test(name)) return str
  const stripped = stripControlChars(str).trim().toLowerCase()
  if (/^(javascript|vbscript|data):/.test(stripped) && !stripped.startsWith('data:image/')) return ''
  return str
}
