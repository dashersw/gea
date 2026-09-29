import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/144: destructuring
// `this.props` in a class `template()` body only bound plain keys. A rest
// element, a default or a nested pattern was dropped unbound, so rendering
// threw `ReferenceError`. Each class is compiled from its own file so bindings
// left by another class can't hide a failure.
describe('class template() this.props destructuring (#144)', { concurrency: false }, () => {
  async function renderApp(badgeSource: string, appTemplate: string, fields: string) {
    const [{ default: Component }] = await loadRuntimeModules(`class-props-destructuring-${Date.now()}`)
    const Badge = await compileJsxComponent(badgeSource, '/virtual/Badge.tsx', 'Badge', { Component })
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Badge from './Badge'

        export default class App extends Component {
          ${fields}
          template() {
            return <div>${appTemplate}</div>
          }
        }
      `,
      '/virtual/App.tsx',
      'App',
      { Component, Badge },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()
    return { root, view }
  }

  function badge(body: string, jsx: string, params = '') {
    return `
      import { Component } from '@geajs/core'

      export default class Badge extends Component {
        template(${params}) {
          ${body}
          return ${jsx}
        }
      }
    `
  }

  for (const [label, params, body, titleExpr, labelExpr] of [
    ['a rest element', '', 'const { label, ...rest } = this.props', 'rest.title', 'label'],
    ['a renamed key', '', 'const { label: text, title } = this.props', 'title', 'text'],
    ['a rest element of a props parameter', 'props', 'const { label, ...rest } = props', 'rest.title', 'label'],
    ['a props parameter with a default', 'props = {}', 'const { label, ...rest } = props', 'rest.title', 'label'],
    ['a rest element of a cast', '', 'const { label, ...rest } = this.props as any', 'rest.title', 'label'],
  ] as const) {
    it(`renders and updates ${label}`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(
          badge(body, `<i title={${titleExpr}}>{${labelExpr}}</i>`, params),
          `<Badge label="hot" title={this.title} />`,
          `title = 'Badge title'`,
        )
        view = app.view
        const i = app.root.querySelector('i')!
        assert.equal(i.outerHTML, '<i title="Badge title">hot</i>')

        view.title = 'New title'
        await flushMicrotasks()
        assert.equal(i.getAttribute('title'), 'New title')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  it('gives rest every prop except the named ones, read live', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        badge(
          'const { label, ...rest } = this.props',
          `<i data-rest={Object.keys(rest).join(',') + ':' + rest.kind}>{label}</i>`,
        ),
        `<Badge label="hot" title="t" kind={this.kind} />`,
        `kind = 'a'`,
      )
      view = app.view
      const i = app.root.querySelector('i')!
      assert.equal(i.dataset.rest, 'title,kind:a')

      view.kind = 'b'
      await flushMicrotasks()
      assert.equal(i.dataset.rest, 'title,kind:b')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('applies a default only while the prop is undefined', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        badge(`const { label = 'new' } = this.props`, '<i data-label={String(label)}>{label}</i>'),
        `<Badge label={this.label} />`,
        `label: string | null | undefined = undefined`,
      )
      view = app.view
      const i = app.root.querySelector('i')!
      assert.equal(i.outerHTML, '<i data-label="new">new</i>')

      view.label = 'hot'
      await flushMicrotasks()
      assert.equal(i.dataset.label, 'hot')

      view.label = null
      await flushMicrotasks()
      assert.equal(i.dataset.label, 'null', 'null does not trigger a destructuring default')

      view.label = undefined
      await flushMicrotasks()
      assert.equal(i.dataset.label, 'new')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('renders a default for a prop the parent never passes', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(badge(`const { label = 'new' } = this.props`, '<i>{label}</i>'), `<Badge />`, '')
      view = app.view
      assert.equal(app.root.querySelector('i')!.outerHTML, '<i>new</i>')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('renders a nested pattern', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        badge('const { user: { first } } = this.props', '<i>{first}</i>'),
        `<Badge user={{ first: 'Ada' }} />`,
        '',
      )
      view = app.view
      assert.equal(app.root.querySelector('i')!.outerHTML, '<i>Ada</i>')
    } finally {
      view?.dispose()
      restore()
    }
  })
})
