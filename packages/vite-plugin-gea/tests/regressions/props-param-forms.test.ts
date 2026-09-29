import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import {
  compileJsxComponent,
  compileJsxModule,
  loadRuntimeModules,
  transformGeaSourceToEvalBody,
} from '../helpers/compile'

// Regression for https://github.com/dashersw/gea/issues/141: a function
// component's props parameter was replaced with `props` without binding what
// it was called, so `function Greeting(p)` threw `p is not defined` and
// `function Tag({ label } = {})` threw `label is not defined`. A class
// `template({ label } = {})` left `label` unbound the same way.
describe('props parameter forms (#141)', { concurrency: false }, () => {
  async function renderApp(childSource: string) {
    const [{ default: Component }] = await loadRuntimeModules(`props-param-forms-${Date.now()}`)
    const Child = await compileJsxComponent(childSource, '/virtual/Child.tsx', 'Child', { Component })
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Child from './Child'

        export default class App extends Component {
          label = 'hot'
          template() {
            return <div><Child label={this.label} /></div>
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

  for (const [label, source] of [
    ['a function parameter not named props', `export default function Child(p) { return <em>{p.label}</em> }`],
    [
      'a function parameter with a default',
      `export default function Child(p: { label?: string } = {}) { return <em>{p.label}</em> }`,
    ],
    [
      'a function pattern with a default',
      `export default function Child({ label }: { label?: string } = {}) { return <em>{label}</em> }`,
    ],
    [
      'a function pattern with defaults inside and out',
      `export default function Child({ label = 'none' } = {}) { return <em>{label}</em> }`,
    ],
    [
      'a class template() pattern with a default',
      `
        import { Component } from '@geajs/core'
        export default class Child extends Component {
          template({ label }: { label?: string } = {}) { return <em>{label}</em> }
        }
      `,
    ],
    [
      'a class template() parameter with a default',
      `
        import { Component } from '@geajs/core'
        export default class Child extends Component {
          template(p = {}) { return <em>{p.label}</em> }
        }
      `,
    ],
  ] as const) {
    it(`renders and updates ${label}`, async () => {
      const restore = installDom()
      let view: any
      try {
        const app = await renderApp(source)
        view = app.view
        const em = app.root.querySelector('em')!
        assert.equal(em.outerHTML, '<em>hot</em>')

        view.label = 'cold'
        await flushMicrotasks()
        assert.equal(em.textContent, 'cold')
      } finally {
        view?.dispose()
        restore()
      }
    })
  }

  it('renders both forms from the issue when declared in the same file as their parents', async () => {
    const restore = installDom()
    const views: any[] = []
    try {
      const [{ default: Component }] = await loadRuntimeModules(`props-param-forms-same-file-${Date.now()}`)
      const { AppGreeting, AppTag } = (await compileJsxModule(
        `
          import { Component } from '@geajs/core'

          export function Greeting(p: { name: string }) {
            return <p class="greeting">Hello, {p.name}</p>
          }

          export function Tag({ label }: { label?: string } = {}) {
            return <em class="tag">{label}</em>
          }

          export class AppGreeting extends Component {
            template() {
              return (
                <div>
                  <Greeting name="Ada" />
                </div>
              )
            }
          }

          export class AppTag extends Component {
            template() {
              return (
                <div>
                  <Tag label="hot" />
                </div>
              )
            }
          }
        `,
        '/virtual/forms.tsx',
        ['AppGreeting', 'AppTag'],
        { Component },
      )) as Record<string, any>
      for (const App of [AppGreeting, AppTag]) {
        const root = document.createElement('div')
        document.body.appendChild(root)
        const view = new App()
        views.push(view)
        view.render(root)
      }
      await flushMicrotasks()
      assert.equal(views[0].el.outerHTML, '<div><p class="greeting">Hello, Ada</p></div>')
      assert.equal(views[1].el.outerHTML, '<div><em class="tag">hot</em></div>')
    } finally {
      for (const view of views) view.dispose()
      restore()
    }
  })

  for (const [label, params] of [
    ['an array pattern', '[label]'],
    ['a rest parameter', '...args'],
  ] as const) {
    it(`fails the build for ${label} as the props parameter`, async () => {
      await assert.rejects(
        transformGeaSourceToEvalBody(
          `export default function Tag(${params}) { return <em>tag</em> }`,
          '/virtual/BadTag.tsx',
        ),
        (error: any) => {
          assert.equal(error.__geaCompileError, true)
          assert.match(error.message, /`Tag` has an unsupported props parameter/)
          assert.equal(typeof error.loc?.line, 'number')
          return true
        },
      )
    })
  }
})
