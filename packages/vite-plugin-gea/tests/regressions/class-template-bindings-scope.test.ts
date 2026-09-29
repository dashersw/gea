import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/143: a local declared
// in one class's `template()` stayed bound for every later class in the same
// file, so a later class's same-named identifier compiled to the earlier
// class's initializer (`this.props.heading`) and rendering threw.
describe('class template() bindings are scoped per class (#143)', { concurrency: false }, () => {
  async function renderApp(pageSource: string, bindings: Record<string, unknown> = {}) {
    const [{ default: Component }] = await loadRuntimeModules(`class-template-bindings-scope-${Date.now()}`)
    const { Heading, Footer } = await compileJsxModule(pageSource, '/virtual/Page.tsx', ['Heading', 'Footer'], {
      Component,
      ...bindings,
    })
    const { App } = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        import { Heading, Footer } from './Page'

        export default class App extends Component {
          template() {
            return (
              <div>
                <Heading heading="Hello" />
                <Footer />
              </div>
            )
          }
        }
      `,
      '/virtual/App.tsx',
      ['App'],
      { Component, Heading, Footer },
    )
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new (App as any)()
    view.render(root)
    await flushMicrotasks()
    return { root, view }
  }

  it('reads a module-level constant that an earlier class shadows with a local', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(`
        import { Component } from '@geajs/core'

        const title = 'Module title'

        export class Heading extends Component {
          template() {
            const title = this.props.heading
            return <h1>{title}</h1>
          }
        }

        export class Footer extends Component {
          template() {
            return <p>{title}</p>
          }
        }
      `)
      view = app.view
      assert.equal(app.root.innerHTML, '<div><h1>Hello</h1><p>Module title</p></div>')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('reads an import that an earlier class shadows with a local', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(
        `
          import { Component } from '@geajs/core'
          import { title } from './labels'

          export class Heading extends Component {
            template() {
              const title = this.props.heading
              return <h1>{title}</h1>
            }
          }

          export class Footer extends Component {
            template() {
              return <p>{title}</p>
            }
          }
        `,
        { title: 'Imported title' },
      )
      view = app.view
      assert.equal(app.root.innerHTML, '<div><h1>Hello</h1><p>Imported title</p></div>')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('does not leak a template() parameter binding into a later class', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(`
        import { Component } from '@geajs/core'

        const heading = 'Module heading'

        export class Heading extends Component {
          template({ heading }) {
            return <h1>{heading}</h1>
          }
        }

        export class Footer extends Component {
          template() {
            return <p>{heading}</p>
          }
        }
      `)
      view = app.view
      assert.equal(app.root.innerHTML, '<div><h1>Hello</h1><p>Module heading</p></div>')
    } finally {
      view?.dispose()
      restore()
    }
  })
})
