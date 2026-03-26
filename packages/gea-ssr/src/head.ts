import type { HeadConfig } from './types'

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"]/g, (ch) => ESCAPE_MAP[ch])
}

function renderAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => ` ${escapeHtml(k)}="${escapeHtml(v)}"`)
    .join('')
}

export function serializeHead(head: HeadConfig): string {
  const parts: string[] = []

  if (head.title) {
    parts.push(`<title>${escapeHtml(head.title)}</title>`)
  }

  if (head.meta) {
    for (const attrs of head.meta) {
      parts.push(`<meta${renderAttrs(attrs)}>`)
    }
  }

  if (head.link) {
    for (const attrs of head.link) {
      parts.push(`<link${renderAttrs(attrs)}>`)
    }
  }

  return parts.join('')
}
