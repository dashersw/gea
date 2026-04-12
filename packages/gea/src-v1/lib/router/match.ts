export interface MatchResult {
  pattern: string
  params: Record<string, string>
}

export function matchRoute(pattern: string, path: string): MatchResult | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  const hasWildcard = patternParts.length > 0 && patternParts[patternParts.length - 1] === '*'
  if (hasWildcard) patternParts.pop()

  if (!hasWildcard && patternParts.length !== pathParts.length) return null
  if (hasWildcard && pathParts.length < patternParts.length) return null

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const pathPart = pathParts[i]

    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(pathPart)
    } else if (pp !== pathPart) {
      return null
    }
  }

  if (hasWildcard) {
    params['*'] = pathParts.slice(patternParts.length).map(decodeURIComponent).join('/')
  }

  return { pattern, params }
}
