import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/109: `const { … } = props`
// in a function component body was dropped without binding its names, and a
// `...rest` element was lost in both the body and the parameter list, so
// rendering threw `ReferenceError`. Defaults in the parameter list were
// silently ignored.
describe('function component props destructuring (#109)', { concurrency: false }, () => {
  async function renderApp(buttonSource: string, appTemplate: string, fields = `title = 'Save the file'`) {
    const [{ default: Component }] = await loadRuntimeModules(`fn-props-destructuring-${Date.now()}`)
    const Button = await compileJsxComponent(buttonSource, '/virtual/Button.tsx', 'Button', {})
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Button from './Button'

        export default class App extends Component {
          ${fields}
          template() {
            return <div>${appTemplate}</div>
          }
        }
      `,
      '/virtual/App.tsx',
      'App',
      { Component, Button },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new App()
    view.render(root)
    await flushMicrotasks()
    return { root, view }
  }

  for (const [label, params, body, titleExpr] of [
    ['a parameter pattern', '{ children, title }', '', 'title'],
    ['a parameter rest element', '{ children, ...rest }', '', 'rest.title'],
    ['a body pattern', 'props', 'const { children, title } = props', 'title'],
    ['a body rest element', 'props', 'const { children, ...rest } = props', 'rest.title'],
    ['a renamed key in the parameters', '{ children, title: label }', '', 'label'],
    ['a renamed key in the body', 'props', 'const { children, title: label } = props', 'label'],
  ] as const) {
    it(`renders and updates ${label}`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(
          `
            export default function Button(${params}) {
              ${body}
              return <button title={${titleExpr}}>{children}</button>
            }
          `,
          `<Button title={this.title}>Save</Button>`,
        )
        view = app.view
        const button = app.root.querySelector('button')!
        assert.equal(button.outerHTML, '<button title="Save the file">Save</button>')

        view.title = 'Saved'
        await flushMicrotasks()
        assert.equal(button.getAttribute('title'), 'Saved')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  for (const [label, params, body] of [
    ['the parameters', '{ size = "md" }', ''],
    ['the body', 'props', 'const { size = "md" } = props'],
  ] as const) {
    it(`applies a default in ${label} only while the prop is undefined`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(
          `
            export default function Button(${params}) {
              ${body}
              return <button data-size={String(size)}>x</button>
            }
          `,
          `<Button size={this.size} />`,
          `size: string | null | undefined = undefined`,
        )
        view = app.view
        const button = app.root.querySelector('button')!
        assert.equal(button.dataset.size, 'md')

        view.size = 'lg'
        await flushMicrotasks()
        assert.equal(button.dataset.size, 'lg')

        view.size = null
        await flushMicrotasks()
        assert.equal(button.dataset.size, 'null', 'null does not trigger a destructuring default')

        view.size = undefined
        await flushMicrotasks()
        assert.equal(button.dataset.size, 'md')
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
        `
          export default function Button(props) {
            const { children, title, ...rest } = props
            return <button title={title} data-rest={Object.keys(rest).join(',') + ':' + rest.label}>{children}</button>
          }
        `,
        `<Button title={this.title} label={this.label} kind="primary">Save</Button>`,
        `title = 'Save the file'\n          label = 'a'`,
      )
      view = app.view
      const button = app.root.querySelector('button')!
      assert.equal(button.dataset.rest, 'label,kind:a')

      view.label = 'b'
      await flushMicrotasks()
      assert.equal(button.dataset.rest, 'label,kind:b')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('handles rest and defaults in a component declared in the same file', async () => {
    const restore = installDom()
    let view: any
    try {
      const [{ default: Component }] = await loadRuntimeModules(`fn-props-destructuring-same-file-${Date.now()}`)
      const App = await compileJsxComponent(
        `
          import { Component } from '@geajs/core'

          function Badge({ label = 'none', ...rest }) {
            return <span title={rest.title}>{label}</span>
          }

          function Button(props) {
            const { children, ...rest } = props
            return <button title={rest.title}>{children}</button>
          }

          export default class App extends Component {
            title = 'Save the file'
            template() {
              return (
                <div>
                  <Badge title="badge" />
                  <Button title={this.title}>Save</Button>
                </div>
              )
            }
          }
        `,
        '/virtual/SameFileApp.tsx',
        'App',
        { Component },
      )
      const root = document.createElement('div')
      document.body.appendChild(root)
      view = new App()
      view.render(root)
      await flushMicrotasks()

      assert.equal(root.querySelector('span')!.outerHTML, '<span title="badge">none</span>')
      const button = root.querySelector('button')!
      assert.equal(button.outerHTML, '<button title="Save the file">Save</button>')

      view.title = 'Saved'
      await flushMicrotasks()
      assert.equal(button.getAttribute('title'), 'Saved')
    } finally {
      view?.dispose()
      restore()
    }
  })
})
