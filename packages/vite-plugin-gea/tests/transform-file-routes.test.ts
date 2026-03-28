import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { transformFileRoutes } from '../src/transform-file-routes'

const IMPORT_STMT = `import { buildFileRoutes as __geaBuildFileRoutes } from '@geajs/core';`

describe('transformFileRoutes – no-op cases', () => {
  it('returns null when code has no .setPath(', () => {
    const result = transformFileRoutes(`router.setRoutes({})`)
    assert.equal(result, null)
  })

  it('returns null when .setPath( appears but not as a relative path', () => {
    const result = transformFileRoutes(`router.setPath('pages')`) // no leading ./ or ../
    assert.equal(result, null)
  })

  it('returns null when .setPath( is inside a JSDoc comment line', () => {
    const code = `
/**
 * Call router.setPath('./pages') to enable file routing.
 */
router.setRoutes({})
`
    const result = transformFileRoutes(code)
    assert.equal(result, null)
  })

  it('returns null for block comment line (leading *)', () => {
    const code = ` * router.setPath('./pages')\n`
    const result = transformFileRoutes(code)
    assert.equal(result, null)
  })
})

describe('transformFileRoutes – basic transformation', () => {
  it('transforms router.setPath with double-quoted path', () => {
    const code = `router.setPath("./pages")`
    const result = transformFileRoutes(code)
    assert.ok(result, 'should return a result')
    assert.match(result!.code, /__geaBuildFileRoutes/, 'should use the alias')
    assert.match(result!.code, /\.setRoutes\(/, 'should call .setRoutes(')
  })

  it('transforms router.setPath with single-quoted path', () => {
    const code = `router.setPath('./pages')`
    const result = transformFileRoutes(code)
    assert.ok(result)
    assert.match(result!.code, /\.setRoutes\(/)
  })

  it('emits page glob with the correct pattern', () => {
    const code = `router.setPath('./pages')`
    const result = transformFileRoutes(code)!
    assert.match(result.code, /import\.meta\.glob\("\.\/pages\/\*\*\/page\.\{tsx,ts,jsx,js\}"\)/)
  })

  it('emits layout glob with eager: true', () => {
    const code = `router.setPath('./pages')`
    const result = transformFileRoutes(code)!
    assert.match(result.code, /import\.meta\.glob\("\.\/pages\/\*\*\/layout\.\{tsx,ts,jsx,js\}",\s*\{\s*eager:\s*true\s*\}\)/)
  })

  it('passes basePath as a string literal', () => {
    const code = `router.setPath('./pages')`
    const result = transformFileRoutes(code)!
    assert.match(result.code, /"\.\/pages"\)/)
  })

  it('prepends the import statement once', () => {
    const code = `router.setPath('./pages')`
    const result = transformFileRoutes(code)!
    const count = (result.code.match(/import \{ buildFileRoutes as __geaBuildFileRoutes \}/g) ?? []).length
    assert.equal(count, 1, 'import should appear exactly once')
  })

  it('import appears before the setRoutes call', () => {
    const code = `router.setPath('./pages')`
    const result = transformFileRoutes(code)!
    const importIdx = result.code.indexOf(IMPORT_STMT)
    const setRoutesIdx = result.code.indexOf('.setRoutes(')
    assert.ok(importIdx < setRoutesIdx, 'import should come before .setRoutes(')
  })

  it('map is null', () => {
    const code = `router.setPath('./src/pages')`
    const result = transformFileRoutes(code)!
    assert.equal(result.map, null)
  })
})

describe('transformFileRoutes – path variations', () => {
  it('handles non-default base directory', () => {
    const code = `router.setPath('./src/pages')`
    const result = transformFileRoutes(code)!
    assert.match(result.code, /\.\/src\/pages\/\*\*\/page/)
    assert.match(result.code, /"\.\/src\/pages"/)
  })

  it('handles parent-relative path (../)', () => {
    const code = `router.setPath('../app/pages')`
    const result = transformFileRoutes(code)!
    assert.match(result.code, /\.\.\/app\/pages\/\*\*\/page/)
    assert.match(result.code, /"\.\.\/app\/pages"/)
  })

  it('handles deeply nested path', () => {
    const code = `router.setPath('./a/b/c')`
    const result = transformFileRoutes(code)!
    assert.match(result.code, /\.\/a\/b\/c\/\*\*\/page/)
  })
})

describe('transformFileRoutes – HMR / deduplication', () => {
  it('does not double-prepend import on repeated calls (simulated HMR)', () => {
    const code = `router.setPath('./pages')`
    const first = transformFileRoutes(code)!.code
    // Simulate HMR: the already-transformed code is passed in again
    const second = transformFileRoutes(first)
    // Already has __geaBuildFileRoutes but no .setPath( anymore → null
    assert.equal(second, null, 'second pass with no more .setPath( should be a no-op')
  })

  it('does not duplicate import when user already has it in code', () => {
    const code =
      `import { buildFileRoutes as __geaBuildFileRoutes } from '@geajs/core';\n` +
      `router.setPath('./pages')`
    const result = transformFileRoutes(code)!
    const count = (result.code.match(/import \{ buildFileRoutes as __geaBuildFileRoutes \}/g) ?? []).length
    assert.equal(count, 1, 'import must not be duplicated when already present')
  })
})

describe('transformFileRoutes – multiple setPath calls', () => {
  it('transforms all setPath calls in one pass', () => {
    const code = [
      `router.setPath('./pages')`,
      `adminRouter.setPath('./admin/pages')`,
    ].join('\n')
    const result = transformFileRoutes(code)!
    // Both should be replaced
    assert.doesNotMatch(result.code, /\.setPath\(/, 'no .setPath( should remain')
    const setRoutesCount = (result.code.match(/\.setRoutes\(/g) ?? []).length
    assert.equal(setRoutesCount, 2, 'both calls should become .setRoutes(')
  })

  it('import is still added only once for multiple calls', () => {
    const code = [
      `router.setPath('./pages')`,
      `adminRouter.setPath('./admin/pages')`,
    ].join('\n')
    const result = transformFileRoutes(code)!
    const count = (result.code.match(/import \{ buildFileRoutes as __geaBuildFileRoutes \}/g) ?? []).length
    assert.equal(count, 1)
  })
})
