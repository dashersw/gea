import type { RedirectConfig } from './types'

export interface RedirectResult {
  target: string
  method: 'push' | 'replace'
  status?: number
}

export function resolveRedirect(
  entry: string | RedirectConfig,
  params: Record<string, string>,
  currentPath: string,
): RedirectResult {
  if (typeof entry === 'string') {
    return { target: entry, method: 'replace' }
  }

  const target = typeof entry.redirect === 'function' ? entry.redirect(params, currentPath) : entry.redirect

  return {
    target,
    method: entry.method ?? 'replace',
    status: entry.status,
  }
}
