/**
 * Parse a URL search string into a key-value record.
 *
 * - Accepts strings with or without a leading `?`
 * - Single values stay as strings; repeated keys become arrays
 * - Missing values (`?key` or `?key=`) produce empty strings
 * - Values are URI-decoded
 */
export function parseQuery(search: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}

  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return result

  const pairs = raw.split('&')
  for (const pair of pairs) {
    if (!pair) continue
    const eqIndex = pair.indexOf('=')
    const key = eqIndex === -1 ? decodeURIComponent(pair) : decodeURIComponent(pair.slice(0, eqIndex))
    const value = eqIndex === -1 ? '' : decodeURIComponent(pair.slice(eqIndex + 1))

    const existing = result[key]
    if (existing === undefined) {
      result[key] = value
    } else if (Array.isArray(existing)) {
      existing.push(value)
    } else {
      result[key] = [existing, value]
    }
  }

  return result
}
