/** Compile-time HTML entity escaping for static text content. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * JSX text whitespace normalization.
 * Matches React's algorithm: collapse interior whitespace, trim leading/trailing
 * lines, normalize tabs to spaces, join non-empty lines with a single space.
 */
export function normalizeJSXText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/)
  let lastNonEmptyLine = 0
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) lastNonEmptyLine = i
  }
  let str = ''
  for (let i = 0; i < lines.length; i++) {
    const isFirstLine = i === 0
    const isLastLine = i === lines.length - 1
    const isLastNonEmptyLine = i === lastNonEmptyLine
    let trimmed = lines[i].replace(/\t/g, ' ')
    if (!isFirstLine) trimmed = trimmed.replace(/^[ ]+/, '')
    if (!isLastLine) trimmed = trimmed.replace(/[ ]+$/, '')
    if (trimmed) {
      if (!isLastNonEmptyLine) trimmed += ' '
      str += trimmed
    }
  }
  return str
}

/** Convert a JSX attribute name to its HTML equivalent. */
export function toHtmlAttrName(jsxName: string, isComponent = false): string {
  if (isComponent) return `data-prop-${camelToKebab(jsxName)}`
  if (jsxName === 'className') return 'class'
  if (jsxName === 'htmlFor') return 'for'
  return jsxName
}

export function camelToKebab(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export function pascalToKebab(name: string): string {
  return name
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
}
