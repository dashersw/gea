const _URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'cite', 'background'])

export function geaEscapeHtml(val: unknown): string {
  if (val != null && typeof val === 'object' && typeof (val as any).template === 'function') {
    return String(val)
  }
  const str = String(val)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function geaSanitizeAttr(name: string, value: string): string {
  if (_URL_ATTRS.has(name)) {
    // eslint-disable-next-line no-control-regex -- intentional: strip null bytes and control chars for XSS prevention
    const stripped = value.replace(/[\s\u0000-\u001F]+/g, '').toLowerCase()
    if (/^(javascript|vbscript|data):/.test(stripped) && !stripped.startsWith('data:image/')) {
      return ''
    }
  }
  return value
}
