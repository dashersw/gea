import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/142: a nested pattern
// in a function component's props, `{ user: { first } }`, in the parameters or
// the body, left its inner names unbound, so rendering threw `ReferenceError`
// or read a `window` global of the same name.
describe('function component nested props destructuring (#142)', { concurrency: false }, () => {
  async function renderApp(avatarSource: string, appTemplate: string, fields: string, scope = {}) {
    const [{ default: Component }] = await loadRuntimeModules(`nested-props-destructuring-${Date.now()}`)
    const Avatar = await compileJsxComponent(avatarSource, '/virtual/Avatar.tsx', 'Avatar', scope)
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Avatar from './Avatar'

        export default class App extends Component {
          ${fields}
          template() {
            return <div>${appTemplate}</div>
          }
        }
      `,
      '/virtual/App.tsx',
      'App',
      { Component, Avatar },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()
    return { root, view }
  }

  function avatar(params: string, body: string, jsx: string) {
    return `
      export default function Avatar(${params}) {
        ${body}
        return ${jsx}
      }
    `
  }

  for (const [label, params, body, local] of [
    ['a parameter pattern', '{ user: { first } }', '', 'first'],
    ['a body pattern', 'props', 'const { user: { first } } = props', 'first'],
    ['a renamed key in the parameters', '{ user: { first: name } }', '', 'name'],
    ['a renamed key in the body', 'props', 'const { user: { first: name } } = props', 'name'],
    ['a pattern two levels deep', '{ user: { name: { first } } }', '', 'first'],
  ] as const) {
    it(`renders and updates ${label}`, async () => {
      const restore = installDom()
      let view: any
      try {
        const deep = label.includes('two levels')
        const user = (first: string) => (deep ? `{ name: { first: '${first}' } }` : `{ first: '${first}' }`)
        const app = await renderApp(
          avatar(params, body, `<b>{${local}}</b>`),
          `<Avatar user={this.user} />`,
          `user = ${user('Ada')}`,
        )
        view = app.view
        const b = app.root.querySelector('b')!
        assert.equal(b.outerHTML, '<b>Ada</b>')

        view.user = deep ? { name: { first: 'Grace' } } : { first: 'Grace' }
        await flushMicrotasks()
        assert.equal(b.textContent, 'Grace')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  for (const [label, params, body] of [
    ['the parameters', `{ user: { first = 'anon' } = {} }`, ''],
    ['the body', 'props', `const { user: { first = 'anon' } = {} } = props`],
  ] as const) {
    it(`applies nested defaults in ${label} only while each level is undefined`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(
          avatar(params, body, '<b data-first={String(first)}>{first}</b>'),
          `<Avatar user={this.user} />`,
          `user: any = undefined`,
        )
        view = app.view
        const b = app.root.querySelector('b')!
        assert.equal(b.outerHTML, '<b data-first="anon">anon</b>')

        view.user = { first: 'Ada' }
        await flushMicrotasks()
        assert.equal(b.dataset.first, 'Ada')

        view.user = { first: null }
        await flushMicrotasks()
        assert.equal(b.dataset.first, 'null', 'null does not trigger a destructuring default')

        view.user = {}
        await flushMicrotasks()
        assert.equal(b.dataset.first, 'anon')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  it('gives a nested rest every key except the named ones, read live', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        avatar(
          '{ user: { first, ...more } }',
          '',
          `<b data-more={Object.keys(more).join(',') + ':' + more.last}>{first}</b>`,
        ),
        `<Avatar user={this.user} />`,
        `user = { first: 'Ada', last: 'Lovelace', born: 1815 }`,
      )
      view = app.view
      const b = app.root.querySelector('b')!
      assert.equal(b.outerHTML, '<b data-more="last,born:Lovelace">Ada</b>')

      view.user = { first: 'Grace', last: 'Hopper', born: 1906 }
      await flushMicrotasks()
      assert.equal(b.outerHTML, '<b data-more="last,born:Hopper">Grace</b>')
    } finally {
      view?.dispose()
      restore()
    }
  })

  for (const [label, init] of [
    ['constructs something', 'new Guest()'],
    ['calls a function', 'guest()'],
  ] as const) {
    it(`runs a nested default that ${label} once`, async () => {
      const restore = installDom()
      let view: any
      try {
        const created: unknown[] = []
        const app = await renderApp(
          `
            class Guest {
              first = 'Guest'
              last = 'User'
              constructor() {
                created.push(this)
              }
            }
            function guest() {
              return new Guest()
            }

            export default function Avatar({ user: { first, last } = ${init} }) {
              return <b title={last}>{first}</b>
            }
          `,
          `<Avatar />`,
          '',
          { created },
        )
        view = app.view
        assert.equal(app.root.querySelector('b')!.outerHTML, '<b title="User">Guest</b>')
        assert.equal(created.length, 1)
      } finally {
        view?.dispose()
        restore()
      }
    })
  }
})
