import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadRuntimeModules } from '../helpers/compile'

describe('ported mapped-list runtime regressions', { concurrency: false }, () => {
  let restoreDom: () => void

  beforeEach(() => {
    restoreDom = installDom()
  })

  afterEach(() => {
    restoreDom()
  })

  it('add, remove, and swap preserve keyed row identity', async () => {
    const seed = `mapped-list-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      items: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
        { id: 'c', label: 'Gamma' },
      ],
    }) as { items: Array<{ id: string; label: string }> }

    const ListProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class ListProbe extends Component {
          template() {
            return (
              <ol class="items">
                {store.items.map((item, index) => (
                  <li key={item.id} data-id={item.id}>{index}:{item.label}</li>
                ))}
              </ol>
            )
          }
        }
      `,
      '/virtual/ListProbe.tsx',
      'ListProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new ListProbe()
    view.render(root)
    await flushMicrotasks()

    const initial = new Map(Array.from(root.querySelectorAll('li')).map((row) => [row.getAttribute('data-id'), row]))
    store.items.push({ id: 'd', label: 'Delta' })
    await flushMicrotasks()
    assert.equal(root.querySelector('[data-id="a"]'), initial.get('a'))
    assert.equal(root.querySelector('[data-id="b"]'), initial.get('b'))
    assert.equal(root.querySelector('[data-id="c"]'), initial.get('c'))

    store.items.splice(1, 1)
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(root.querySelectorAll('li')).map((row) => row.getAttribute('data-id')),
      ['a', 'c', 'd'],
    )
    assert.equal(root.querySelector('[data-id="a"]'), initial.get('a'))
    assert.equal(root.querySelector('[data-id="c"]'), initial.get('c'))

    const rowA = root.querySelector('[data-id="a"]')
    const rowC = root.querySelector('[data-id="c"]')
    store.items = [
      { id: 'c', label: 'Gamma' },
      { id: 'a', label: 'Alpha' },
      { id: 'd', label: 'Delta' },
    ]
    await flushMicrotasks()

    assert.deepEqual(
      Array.from(root.querySelectorAll('li')).map((row) => row.getAttribute('data-id')),
      ['c', 'a', 'd'],
    )
    assert.equal(root.querySelector('[data-id="a"]'), rowA)
    assert.equal(root.querySelector('[data-id="c"]'), rowC)
    assert.equal(root.querySelectorAll('li').length, 3)

    view.dispose()
    await flushMicrotasks()
  })

  it('two sibling maps with overlapping keys do not cross-adopt rows', async () => {
    const seed = `dual-map-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      left: [
        { id: '1', label: 'Left one' },
        { id: '2', label: 'Left two' },
      ],
      right: [
        { id: '1', label: 'Right one' },
        { id: '2', label: 'Right two' },
      ],
    }) as {
      left: Array<{ id: string; label: string }>
      right: Array<{ id: string; label: string }>
    }

    const DualMapProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class DualMapProbe extends Component {
          template() {
            return (
              <section>
                <ul class="left">{store.left.map(item => <li key={item.id} data-side="left" data-id={item.id}>{item.label}</li>)}</ul>
                <ul class="right">{store.right.map(item => <li key={item.id} data-side="right" data-id={item.id}>{item.label}</li>)}</ul>
              </section>
            )
          }
        }
      `,
      '/virtual/DualMapProbe.tsx',
      'DualMapProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new DualMapProbe()
    view.render(root)
    await flushMicrotasks()

    const leftOne = root.querySelector('.left [data-id="1"]')
    const rightOne = root.querySelector('.right [data-id="1"]')

    store.left = [
      { id: '2', label: 'Left two' },
      { id: '1', label: 'Left one moved' },
    ]
    await flushMicrotasks()

    assert.equal(root.querySelector('.left [data-id="1"]'), leftOne)
    assert.equal(root.querySelector('.right [data-id="1"]'), rightOne)
    assert.equal(root.querySelector('.right [data-id="1"]')?.textContent, 'Right one')
    assert.equal(root.querySelector('.left [data-id="1"]')?.textContent, 'Left one moved')
    assert.equal(root.querySelectorAll('.left [data-side="right"]').length, 0)
    assert.equal(root.querySelectorAll('.right [data-side="left"]').length, 0)

    view.dispose()
    await flushMicrotasks()
  })

  it('derived lists can shrink to one item and grow back to detached keyed rows', async () => {
    const seed = `derived-map-grow-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class AppStore extends Store {
      query = ''
      items = [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
        { id: 'c', label: 'Gamma' },
      ]

      get filtered() {
        if (!this.query) return this.items
        return this.items.filter((item) => item.label.toLowerCase().includes(this.query))
      }
    }
    const store = new AppStore()

    const ListProbe = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export default class ListProbe extends Component {
          template() {
            return (
              <ul class="items">
                {store.filtered.map((item) => (
                  <li key={item.id} data-id={item.id}>{item.label}</li>
                ))}
              </ul>
            )
          }
        }
      `,
      '/virtual/ListProbe.tsx',
      'ListProbe',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new ListProbe()
    view.render(root)
    await flushMicrotasks()

    assert.deepEqual(
      Array.from(root.querySelectorAll('li')).map((row) => row.getAttribute('data-id')),
      ['a', 'b', 'c'],
    )

    store.query = 'alpha'
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(root.querySelectorAll('li')).map((row) => row.getAttribute('data-id')),
      ['a'],
    )

    store.query = ''
    await flushMicrotasks()
    assert.deepEqual(
      Array.from(root.querySelectorAll('li')).map((row) => row.getAttribute('data-id')),
      ['a', 'b', 'c'],
    )

    view.dispose()
    await flushMicrotasks()
  })

  it('filtered sibling component lists preserve a card moved back to an earlier column', async () => {
    const seed = `filtered-column-move-${Date.now()}`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      issues: [
        { id: 'i1', status: 'right', title: 'Move me' },
        { id: 'i2', status: 'left', title: 'Stay put' },
      ],
    }) as { issues: Array<{ id: string; status: string; title: string }> }

    const module = await compileJsxModule(
      `
        import { Component } from '@geajs/core'
        import store from './store'

        export class Column extends Component {
          template() {
            return (
              <section data-column={this.props.status}>
                {store.issues
                  .filter((issue) => issue.status === this.props.status)
                  .map((issue) => (
                    <article key={issue.id} data-id={issue.id}>{issue.title}</article>
                  ))}
              </section>
            )
          }
        }

        export class BoardProbe extends Component {
          template() {
            return (
              <div class="board-probe">
                <Column status="left" />
                <Column status="right" />
              </div>
            )
          }
        }
      `,
      '/virtual/FilteredColumns.tsx',
      ['Column', 'BoardProbe'],
      { Component, store },
    )

    const BoardProbe = module.BoardProbe as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new BoardProbe()
    view.render(root)
    await flushMicrotasks()

    const moved = root.querySelector('[data-column="right"] [data-id="i1"]')
    assert.ok(moved)

    store.issues[0].status = 'left'
    await flushMicrotasks()

    assert.equal(root.querySelector('[data-column="left"] [data-id="i1"]'), moved)
    assert.equal(root.querySelector('[data-column="right"] [data-id="i1"]'), null)

    view.dispose()
    await flushMicrotasks()
  })

  it('nested component maps do not steal shared object entries during first render', async () => {
    const seed = `shared-nested-map-${Date.now()}`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const module = await compileJsxModule(
      `
        import { Component } from '@geajs/core'

        const sharedUser = { id: 'u1', name: 'Ada' }
        const cards = [
          { id: 'a', users: [sharedUser] },
          { id: 'b', users: [sharedUser] },
        ]

        export class AvatarProbe extends Component {
          template() {
            return <span class="avatar" data-user={this.props.user.id}>{this.props.user.name}</span>
          }
        }

        export class CardProbe extends Component {
          template() {
            return (
              <article data-card={this.props.id}>
                {this.props.users.map((user) => (
                  <AvatarProbe key={user.id} user={user} />
                ))}
              </article>
            )
          }
        }

        export class SharedAvatarBoard extends Component {
          template() {
            return (
              <section>
                {cards.map((card) => (
                  <CardProbe key={card.id} id={card.id} users={card.users} />
                ))}
              </section>
            )
          }
        }
      `,
      '/virtual/SharedAvatarBoard.tsx',
      ['AvatarProbe', 'CardProbe', 'SharedAvatarBoard'],
      { Component },
    )

    const SharedAvatarBoard = module.SharedAvatarBoard as { new (): { render: (n: Node) => void; dispose: () => void } }
    const root = document.createElement('div')
    document.body.appendChild(root)
    const view = new SharedAvatarBoard()
    view.render(root)
    await flushMicrotasks()

    assert.equal(root.querySelectorAll('.avatar').length, 2)
    assert.equal(root.querySelector('[data-card="a"] .avatar')?.textContent, 'Ada')
    assert.equal(root.querySelector('[data-card="b"] .avatar')?.textContent, 'Ada')

    view.dispose()
    await flushMicrotasks()
  })
})
