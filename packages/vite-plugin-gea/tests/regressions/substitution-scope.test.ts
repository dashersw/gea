import assert from 'node:assert/strict'
import { it } from 'node:test'
import { parseExpression } from '@babel/parser'
import { t, generate } from '../../src/utils/babel-interop.ts'
import { substituteBindings } from '../../src/closure-codegen/emit/emit-substitution.ts'

const bindings = new Map([
  ['app', parseExpression('this.props.app')],
  ['value', parseExpression('this.props.value')],
])

for (const body of [
  'let app = { n: 1 }; app.n = 2; return app.n',
  'app: for (;;) { break app } return app.n',
  'app = { n: 1 }; var app; app.n++; return app.n',
  '{ let app = { n: 1 }; app.n = 2; } return app.n',
  'try { throw { n: 1 } } catch (app) { app.n++; return app.n }',
  'for (let app of [{ n: 1 }]) { app.n++; return app.n }',
  'for (let app = { n: 1 }; app.n < 2; app.n++) {} return app.n',
  'function app() { return 2 } return app()',
  'return (({ nested: [app] }) => ++app.n)({ nested: [{ n: 1 }] })',
  'return (function app() { return app.name.length - 1 })()',
]) {
  it(`preserves lexical bindings: ${body}`, () => {
    const original = parseExpression(`() => { ${body} }`)
    const before = generate(original).code
    const output = substituteBindings(original, bindings)
    assert.equal(generate(original).code, before, 'input AST stays unchanged')
    const props = { app: { n: 2 }, value: 0 }
    const run = new Function(`return (${generate(output).code})()`)
    assert.equal(run.call({ props }), 2)
    assert.equal(props.app.n, 2, 'local writes must not escape to props')
  })
}

it('substitutes free writes, updates and destructuring assignment targets', () => {
  const output = substituteBindings(
    parseExpression(`() => {
    app.n = 1;
    app.n++;
    ({ n: app.n, value } = { n: 3, value: 4 });
    [app.n, value] = [5, 6];
    return { value, n: app.n };
  }`),
    bindings,
  )
  const props = { app: { n: 0 }, value: 0 }
  assert.deepEqual(new Function(`return (${generate(output).code})()`).call({ props }), { value: 6, n: 5 })
  assert.deepEqual(props, { app: { n: 5 }, value: 6 })
})

it('resolves chained aliases without looping through self references', () => {
  const output = substituteBindings(
    t.identifier('first'),
    new Map([
      ['first', parseExpression('app.n')],
      ['app', parseExpression('this.props.app')],
    ]),
  )
  assert.equal(generate(output).code, 'this.props.app.n')
  assert.equal(generate(substituteBindings(t.identifier('app'), new Map([['app', t.identifier('app')]]))).code, 'app')
})
