/**
 * Transforms `router.setPath('./pages')` calls into the expanded form:
 *
 *   router.setRoutes(
 *     __geaBuildFileRoutes(
 *       import.meta.glob('./pages/** /page.{tsx,ts,jsx,js}'),
 *       import.meta.glob('./pages/** /layout.{tsx,ts,jsx,js}', { eager: true }),
 *       './pages'
 *     )
 *   )
 *
 * The `buildFileRoutes` helper is imported from `@geajs/core` under the
 * `__geaBuildFileRoutes` alias to avoid collisions with user code.
 */

const SET_PATH_RE = /\.setPath\(\s*(['"])((?:\.{1,2}\/)[^'"]*)\1\s*\)/g
const IMPORT_MARKER = '__geaBuildFileRoutes'
const IMPORT_STMT = `import { buildFileRoutes as ${IMPORT_MARKER} } from '@geajs/core';\n`

export function transformFileRoutes(code: string): { code: string; map: null } | null {
  if (!code.includes('.setPath(')) return null

  SET_PATH_RE.lastIndex = 0
  if (!SET_PATH_RE.test(code)) return null

  SET_PATH_RE.lastIndex = 0
  const transformed = code.replace(SET_PATH_RE, (match, _quote, dirPath, offset) => {
    // Skip if inside a block/JSDoc comment (line starts with optional whitespace then *)
    const lineStart = code.lastIndexOf('\n', offset) + 1
    const linePrefix = code.slice(lineStart, offset)
    if (/^\s*\*/.test(linePrefix)) return match

    const pageGlob = JSON.stringify(`${dirPath}/**/page.{tsx,ts,jsx,js}`)
    const layoutGlob = JSON.stringify(`${dirPath}/**/layout.{tsx,ts,jsx,js}`)
    return (
      `.setRoutes(${IMPORT_MARKER}(` +
      `import.meta.glob(${pageGlob}), ` +
      `import.meta.glob(${layoutGlob}, { eager: true }), ` +
      `${JSON.stringify(dirPath)}` +
      `))`
    )
  })

  if (transformed === code) return null

  // Prepend the import only once (it may already be present from a previous
  // HMR pass or if the user imports buildFileRoutes themselves).
  const final = transformed.includes(IMPORT_MARKER) && code.includes(IMPORT_MARKER)
    ? transformed
    : IMPORT_STMT + transformed

  return { code: final, map: null }
}
