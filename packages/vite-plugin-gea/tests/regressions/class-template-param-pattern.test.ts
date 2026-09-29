import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/93 (the rest object)
// and https://github.com/dashersw/gea/issues/176: a class `template()`
// parameter pattern bound only plain and renamed keys to `this.props.<key>`.
// A `...rest` element was dropped, so `console.log(props)` threw; a nested
// pattern left its inner names unbound and threw `ReferenceError`; and a
// default was dropped (#91), or threw when it had a rename.
describe('class template() parameter pattern (#93, #176)', { concurrency: false }, () => {
  async function renderApp(childSource: string, appTemplate: string, fields: string, scope = {}) {
    const [{ default: Component }] = await loadRuntimeModules(`class-template-param-pattern-${Date.now()}`)
    const Child = await compileJsxComponent(childSource, '/virtual/Child.tsx', 'Child', { Component, ...scope })
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Child from './Child'

        export default class App extends Component {
          ${fields}
          template() {
            return <div>${appTemplate}</div>
          }
        }
      `,
      '/virtual/App.tsx',
      'App',
      { Component, Child },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()
    return { root, view }
  }

  function child(params: string, jsx: string, body = '') {
    return `
      import { Component } from '@geajs/core'

      export default class Child extends Component {
        template(${params}) {
          ${body}
          return ${jsx}
        }
      }
    `
  }

  it('gives a rest element every prop except the named ones, read live (#93)', async () => {
    const restore = installDom()
    let view: any
    const logged: any[] = []
    try {
      const app = await renderApp(
        child(
          '{ children, class: cls, ...props }: any',
          '<i class={`badge ${cls ?? ""}`} title={props.title} data-rest={Object.keys(props).join(",")}>{children}</i>',
          'console.log(props)',
        ),
        `<Child class="hot" title={this.title} kind="k">hi</Child>`,
        `title = 'Badge title'`,
        { console: { log: (value: any) => logged.push(value) } },
      )
      view = app.view
      const i = app.root.querySelector('i')!
      assert.equal(i.className, 'badge hot')
      assert.equal(i.title, 'Badge title')
      assert.equal(i.textContent, 'hi')
      assert.equal(i.dataset.rest, 'title,kind')
      assert.equal(logged.length, 1)
      assert.deepEqual({ ...logged[0] }, { title: 'Badge title', kind: 'k' })

      view.title = 'New title'
      await flushMicrotasks()
      assert.equal(i.title, 'New title')
      assert.equal(logged[0].title, 'New title', 'the logged rest object reads through to this.props')
    } finally {
      view?.dispose()
      restore()
    }
  })

  for (const [label, params, local] of [
    ['a nested pattern', '{ user: { first } }: any', 'first'],
    ['a nested renamed key', '{ user: { first: n } }: any', 'n'],
    ['a pattern two levels deep', '{ user: { name: { first } } }: any', 'first'],
  ] as const) {
    it(`renders and updates ${label} (#176)`, async () => {
      const restore = installDom()
      let view: any
      try {
        const deep = label.includes('two levels')
        const user = (first: string) => (deep ? `{ name: { first: '${first}' } }` : `{ first: '${first}' }`)
        const app = await renderApp(
          child(params, `<b>{${local}}</b>`),
          `<Child user={this.user} />`,
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

  it('applies nested defaults only while each level is undefined (#176)', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        child(`{ user: { first = 'anon' } = {} }: any`, '<b data-first={String(first)}>{first}</b>'),
        `<Child user={this.user} />`,
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

  it('gives a nested rest every key except the named ones, read live (#176)', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        child(
          '{ user: { first, ...more } }: any',
          '<b data-more={Object.keys(more).join(",") + ":" + more.last}>{first}</b>',
        ),
        `<Child user={this.user} />`,
        `user = { first: 'Ada', last: 'Lovelace' }`,
      )
      view = app.view
      const b = app.root.querySelector('b')!
      assert.equal(b.outerHTML, '<b data-more="last:Lovelace">Ada</b>')

      view.user = { first: 'Ada', last: 'Byron' }
      await flushMicrotasks()
      assert.equal(b.dataset.more, 'last:Byron')
    } finally {
      view?.dispose()
      restore()
    }
  })

  for (const [label, params, local] of [
    ['a default', `{ label = 'new' }: any`, 'label'],
    ['a renamed key with a default', `{ label: text = 'new' }: any`, 'text'],
  ] as const) {
    it(`applies ${label} only while the prop is undefined (#91)`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(
          child(params, `<em data-label={String(${local})}>{${local}}</em>`),
          `<Child label={this.label} />`,
          `label: string | null | undefined = undefined`,
        )
        view = app.view
        const em = app.root.querySelector('em')!
        assert.equal(em.outerHTML, '<em data-label="new">new</em>')

        view.label = 'hot'
        await flushMicrotasks()
        assert.equal(em.dataset.label, 'hot')

        view.label = null
        await flushMicrotasks()
        assert.equal(em.dataset.label, 'null', 'null does not trigger a destructuring default')

        view.label = undefined
        await flushMicrotasks()
        assert.equal(em.dataset.label, 'new')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  it('renders the class default from #91 next to a rest element', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        child(
          '{ children, class: cls = "", ...props }: any',
          '<button class={`foo-button ${cls}`} title={props.title}>{children}</button>',
        ),
        `<Child title="t">go</Child><Child class="big">go</Child>`,
        '',
      )
      view = app.view
      const [plain, big] = app.root.querySelectorAll('button')
      assert.equal(plain.className, 'foo-button ')
      assert.equal(plain.title, 't')
      assert.equal(big.className, 'foo-button big')
    } finally {
      view?.dispose()
      restore()
    }
  })
})
