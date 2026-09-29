import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadRuntimeModules } from '../helpers/compile'

// A compiled function component takes `props` as its first parameter. A
// binding of the component's own called `props` collided with it:
// `function Badge({ class: cls, ...props })` (the naming in #93) and
// `(p) { const { label, ...props } = p }` failed with "Identifier 'props' has
// already been declared", and a callback parameter called `props` hid the
// reads the compiler inlines as `props.<key>`.
describe('function component local called props', { concurrency: false }, () => {
  async function renderApp(badgeSource: string, scope = {}) {
    const [{ default: Component }] = await loadRuntimeModules(`fn-props-local-name-${Date.now()}`)
    const Badge = await compileJsxComponent(badgeSource, '/virtual/Badge.tsx', 'Badge', scope)
    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Badge from './Badge'

        export default class App extends Component {
          label = 'hot'
          title = 'Badge title'
          template() {
            return <div><Badge class="big" label={this.label} title={this.title} /></div>
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

  it('renders a rest element called props, read live', async () => {
    const restore = installDom()
    let view: any
    const logged: any[] = []
    try {
      const app = await renderApp(
        `
          export default function Badge({ class: cls, ...props }: any) {
            console.log(props)
            return <i class={cls} title={props.title}>{Object.keys(props).join(',')}</i>
          }
        `,
        { console: { log: (value: any) => logged.push(value) } },
      )
      view = app.view
      const i = app.root.querySelector('i')!
      assert.equal(i.outerHTML, '<i class="big" title="Badge title">label,title</i>')
      assert.equal(logged.length, 1)
      assert.deepEqual({ ...logged[0] }, { label: 'hot', title: 'Badge title' })

      view.title = 'New title'
      await flushMicrotasks()
      assert.equal(i.title, 'New title')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('renders a body rest element called props', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(`
        export default function Badge(p: any) {
          const { label, ...props } = p
          return <i title={props.title}>{label}</i>
        }
      `)
      view = app.view
      assert.equal(app.root.querySelector('i')!.outerHTML, '<i title="Badge title">hot</i>')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('keeps a callback parameter called props apart from the props it inlines', async () => {
    const restore = installDom()
    let view: any
    try {
      const app = await renderApp(`
        export default function Badge({ label }: any) {
          const shout = (props: any) => props.text + label
          return <i>{shout({ text: '!' })}</i>
        }
      `)
      view = app.view
      const i = app.root.querySelector('i')!
      assert.equal(i.textContent, '!hot')

      view.label = 'cold'
      await flushMicrotasks()
      assert.equal(i.textContent, '!cold')
    } finally {
      view?.dispose()
      restore()
    }
  })

  it('renders a rest element called props declared in the same file as its parent', async () => {
    const restore = installDom()
    let view: any
    try {
      const [{ default: Component }] = await loadRuntimeModules(`fn-props-local-name-same-file-${Date.now()}`)
      const { App } = (await compileJsxModule(
        `
          import { Component } from '@geajs/core'

          function Badge({ class: cls, ...props }: any) {
            return <i class={cls} title={props.title}>{props.label}</i>
          }

          export class App extends Component {
            title = 'Badge title'
            template() {
              return <div><Badge class="big" label="hot" title={this.title} /></div>
            }
          }
        `,
        '/virtual/same-file.tsx',
        ['App'],
        { Component },
      )) as Record<string, any>
      const root = document.createElement('div')
      document.body.appendChild(root)
      view = new App()
      view.render(root)
      await flushMicrotasks()
      const i = root.querySelector('i')!
      assert.equal(i.outerHTML, '<i class="big" title="Badge title">hot</i>')

      view.title = 'New title'
      await flushMicrotasks()
      assert.equal(i.title, 'New title')
    } finally {
      view?.dispose()
      restore()
    }
  })
})
