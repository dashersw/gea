/**
 * Issue #111: nested delegated handlers must bubble like the DOM.
 *
 * Handlers run from the target outwards, every handler on the path runs, and
 * `stopPropagation()` stops the ancestors — no matter which delegate slot
 * (`__gc`, `__on_`, `__onct_`) the compiler picked for each handler.
 */
import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxModule, loadRuntimeModules } from '../helpers/compile'

type View = { render: (n: Node) => void; dispose: () => void }

async function mount(
  source: string,
  id: string,
  names: string[],
  log: string[],
): Promise<{ root: Element; app: View }> {
  const [{ default: Component }] = await loadRuntimeModules(`nested-events-${id}-${Date.now()}`)
  const m = await compileJsxModule(source, `/virtual/${id}.tsx`, names, { Component, log })
  const App = m.App as { new (): View }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  return { root, app }
}

function click(root: Element, selector: string): void {
  ;(root.querySelector(selector) as HTMLElement).dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  )
}

describe('nested delegated event handlers (#111)', { concurrency: false }, () => {
  let restoreDom: () => void
  beforeEach(() => (restoreDom = installDom()))
  afterEach(() => restoreDom())

  it('A: two inline arrows run innermost first', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          template() {
            return (
              <div id="outer" onClick={() => log.push('outer')}>
                <span id="inner" onClick={() => log.push('inner')}>Go</span>
              </div>
            )
          }
        }
      `,
      'CaseA',
      ['App'],
      log,
    )
    click(root, '#inner')
    assert.deepEqual(log, ['inner', 'outer'])
    app.dispose()
  })

  it('B: two method references run innermost first, each with its own currentTarget', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          outer(e) { log.push('outer:' + e.currentTarget.id) }
          inner(e) { log.push('inner:' + e.currentTarget.id) }
          template() {
            return (
              <div id="outer" onClick={this.outer}>
                <span id="inner" onClick={this.inner}>Go</span>
              </div>
            )
          }
        }
      `,
      'CaseB',
      ['App'],
      log,
    )
    click(root, '#inner')
    assert.deepEqual(log, ['inner:inner', 'outer:outer'])
    app.dispose()
  })

  it('C: stopPropagation in an inline child handler stops a method-ref ancestor', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class Inner extends Component {
          template() {
            return (
              <span id="inner" onClick={(e) => { e.stopPropagation(); log.push('inner') }}>Go</span>
            )
          }
        }
        export class App extends Component {
          outer() { log.push('outer') }
          template() {
            return (
              <div id="outer" onClick={this.outer}>
                <Inner />
              </div>
            )
          }
        }
      `,
      'CaseC',
      ['Inner', 'App'],
      log,
    )
    click(root, '#inner')
    assert.deepEqual(log, ['inner'])
    app.dispose()
  })

  it('D: a method-ref child runs before an inline ancestor and its stopPropagation holds', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class Other extends Component {
          template() { return <button id="other" onClick={() => log.push('other')}>Other</button> }
        }
        export class Inner extends Component {
          inner(e) {
            e.stopPropagation()
            log.push('inner')
          }
          template() { return <span id="inner" onClick={this.inner}>Go</span> }
        }
        export class App extends Component {
          template() {
            return (
              <div>
                <Other />
                <div id="outer" onClick={() => log.push('outer')}>
                  <Inner />
                </div>
              </div>
            )
          }
        }
      `,
      'CaseD',
      ['Other', 'Inner', 'App'],
      log,
    )
    click(root, '#inner')
    assert.deepEqual(log, ['inner'])
    app.dispose()
  })

  it('D without stopPropagation: both run, innermost first', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class Other extends Component {
          template() { return <button id="other" onClick={() => log.push('other')}>Other</button> }
        }
        export class Inner extends Component {
          inner() { log.push('inner') }
          template() { return <span id="inner" onClick={this.inner}>Go</span> }
        }
        export class App extends Component {
          template() {
            return (
              <div>
                <Other />
                <div id="outer" onClick={() => log.push('outer')}>
                  <Inner />
                </div>
              </div>
            )
          }
        }
      `,
      'CaseD2',
      ['Other', 'Inner', 'App'],
      log,
    )
    click(root, '#inner')
    assert.deepEqual(log, ['inner', 'outer'])
    app.dispose()
  })

  it('keyed-list row handlers bubble to the list owner and honour stopPropagation', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          rows = [{ id: 1 }, { id: 2 }]
          pick(id) { log.push('row:' + id) }
          template() {
            return (
              <ul id="list" onClick={() => log.push('list')}>
                {this.rows.map((row) => (
                  <li key={row.id} class={'row-' + row.id} onClick={() => this.pick(row.id)}>
                    <button class={'del-' + row.id} onClick={(e) => { e.stopPropagation(); log.push('del:' + row.id) }}>x</button>
                  </li>
                ))}
              </ul>
            )
          }
        }
      `,
      'KeyedRows',
      ['App'],
      log,
    )
    click(root, '.row-1')
    assert.deepEqual(log, ['row:1', 'list'])
    log.length = 0
    click(root, '.del-2')
    assert.deepEqual(log, ['del:2'])
    app.dispose()
  })

  it('click and onClick on one element both run, and stopImmediatePropagation skips the second', async () => {
    const log: string[] = []
    const { root, app } = await mount(
      `
        import { Component } from '@geajs/core'
        export class App extends Component {
          stopNow = false
          b(e) { log.push('b:' + e.currentTarget.id) }
          template() {
            return (
              <div id="outer" onClick={() => log.push('outer')}>
                <button
                  id="btn"
                  click={(e) => { log.push('a'); if (this.stopNow) e.stopImmediatePropagation() }}
                  onClick={this.b}
                >Go</button>
              </div>
            )
          }
        }
      `,
      'SameElement',
      ['App'],
      log,
    )
    click(root, '#btn')
    assert.deepEqual(log, ['a', 'b:btn', 'outer'])
    ;(app as unknown as { stopNow: boolean }).stopNow = true
    log.length = 0
    click(root, '#btn')
    assert.deepEqual(log, ['a'])
    app.dispose()
  })
})
