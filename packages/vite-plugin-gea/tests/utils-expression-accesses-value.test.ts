import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import test from 'node:test'
import { expressionAccessesValueProperties } from '../src/codegen/prop-ref-utils'

function parseExpr(src: string): t.Expression {
  const file = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const stmt = file.program.body[0]
  if (!t.isExpressionStatement(stmt)) throw new Error(`expected expression, got ${stmt.type}`)
  return stmt.expression
}

function parseBlockStmts(src: string): t.Statement[] {
  const file = parse(`function _f() {\n${src}\n}`, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const stmt = file.program.body[0]
  if (!t.isFunctionDeclaration(stmt)) throw new Error('expected function')
  return stmt.body.body
}

test('expressionAccessesValueProperties: false for direct value use (comparison, logical, template)', () => {
  assert.equal(expressionAccessesValueProperties(parseExpr('value === "X"'), []), false)
  assert.equal(expressionAccessesValueProperties(parseExpr('value || ""'), []), false)
  assert.equal(expressionAccessesValueProperties(parseExpr('!value'), []), false)
  assert.equal(expressionAccessesValueProperties(parseExpr('`x${value}y`'), []), false)
})

test('expressionAccessesValueProperties: true for member or computed access on value', () => {
  assert.equal(expressionAccessesValueProperties(parseExpr('value.name'), []), true)
  assert.equal(expressionAccessesValueProperties(parseExpr('value[0]'), []), true)
  assert.equal(expressionAccessesValueProperties(parseExpr('(value as any).x'), []), true)
})

test('expressionAccessesValueProperties: reads setup statements', () => {
  const setup = parseBlockStmts('const x = value.foo;')
  assert.equal(expressionAccessesValueProperties(parseExpr('x'), setup), true)
})

test('expressionAccessesValueProperties: false when only optional chain on value', () => {
  assert.equal(expressionAccessesValueProperties(parseExpr('value?.name'), []), false)
})
