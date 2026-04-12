import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import test from 'node:test'
import { buildSubstitutionMap, scanDestructuringStatements } from '../src/analyze/index.ts'

/**
 * v2 compiler does NOT have `expressionAccessesValueProperties` from
 * `src/codegen/prop-ref-utils`. The v2 equivalent analysis utilities are
 * `buildSubstitutionMap` and `scanDestructuringStatements` from
 * `src/analyze/destructuring.ts`, which handle mapping destructured
 * variables to their reactive source paths (e.g. `{ filter } = store`
 * becomes `store.filter`).
 */

function parsePattern(src: string): { pattern: t.ObjectPattern; source: string } {
  const file = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const stmt = file.program.body[0]
  assert.ok(t.isVariableDeclaration(stmt), 'expected variable declaration')
  const decl = stmt.declarations[0]
  assert.ok(t.isObjectPattern(decl.id), 'expected object pattern')
  assert.ok(t.isIdentifier(decl.init!), 'expected identifier init')
  return { pattern: decl.id, source: decl.init!.name }
}

function parseBody(src: string): t.Statement[] {
  const file = parse(`function _f() {\n${src}\n}`, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  })
  const stmt = file.program.body[0]
  assert.ok(t.isFunctionDeclaration(stmt), 'expected function')
  return stmt.body.body
}

test('buildSubstitutionMap: simple destructuring maps to dotted paths', () => {
  const { pattern, source } = parsePattern('const { filter, todos } = todoStore')
  const map = buildSubstitutionMap(pattern, source)

  assert.equal(map.size, 2)
  assert.equal(map.get('filter'), 'todoStore.filter')
  assert.equal(map.get('todos'), 'todoStore.todos')
})

test('buildSubstitutionMap: renamed destructuring maps key to source path', () => {
  const { pattern, source } = parsePattern('const { name: localName } = store')
  const map = buildSubstitutionMap(pattern, source)

  assert.equal(map.size, 1)
  assert.equal(map.get('localName'), 'store.name')
})

test('scanDestructuringStatements: identifies reactive destructuring and marks for removal', () => {
  const body = parseBody(`
    const { activeCount, completedCount } = store
    const x = 42
  `)
  const reactiveSources = new Set(['store'])

  const { map, indicesToRemove } = scanDestructuringStatements(body, reactiveSources)

  assert.equal(map.size, 2)
  assert.equal(map.get('activeCount'), 'store.activeCount')
  assert.equal(map.get('completedCount'), 'store.completedCount')
  assert.ok(indicesToRemove.has(0), 'should mark destructuring statement for removal')
  assert.ok(!indicesToRemove.has(1), 'should not mark non-reactive statement')
})

test('scanDestructuringStatements: ignores non-reactive destructuring', () => {
  const body = parseBody(`
    const { x, y } = config
    const { filter } = store
  `)
  const reactiveSources = new Set(['store'])

  const { map, indicesToRemove } = scanDestructuringStatements(body, reactiveSources)

  assert.equal(map.size, 1)
  assert.equal(map.get('filter'), 'store.filter')
  assert.ok(!indicesToRemove.has(0), 'should not mark config destructuring')
  assert.ok(indicesToRemove.has(1), 'should mark store destructuring')
})
