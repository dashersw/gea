import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('map items render before conditional slots in DOM order', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-map-before-cond`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class ChatStore extends Store {
      turns = [
        { timestamp: '1', text: 'Hello' },
        { timestamp: '2', text: 'World' },
      ] as Array<{ timestamp: string; text: string }>
      hasActiveTurn = false
      error = ''
    }
    const chatStore = new ChatStore()

    const TurnItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class TurnItem extends Component {
          template({ turn }) {
            return <div class="turn" key={turn.timestamp}>{turn.text}</div>
          }
        }
      `,
      '/virtual/TurnItem.jsx',
      'TurnItem',
      { Component },
    )

    const ActiveTurn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ActiveTurn extends Component {
          template() {
            return <div class="active-turn">thinking...</div>
          }
        }
      `,
      '/virtual/ActiveTurn.jsx',
      'ActiveTurn',
      { Component },
    )

    const ChatPanel = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import chatStore from './chat-store'
        import TurnItem from './TurnItem.jsx'
        import ActiveTurn from './ActiveTurn.jsx'

        export default class ChatPanel extends Component {
          template() {
            return (
              <div class="chat">
                {chatStore.turns.map(turn => (
                  <TurnItem key={turn.timestamp} turn={turn} />
                ))}
                {chatStore.hasActiveTurn && <ActiveTurn />}
                {chatStore.error && <div class="error">{chatStore.error}</div>}
              </div>
            )
          }
        }
      `,
      '/virtual/ChatPanel.jsx',
      'ChatPanel',
      { Component, chatStore, TurnItem, ActiveTurn },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const panel = new ChatPanel()
    panel.render(root)
    await flushMicrotasks()

    const chat = panel.el

    // Initial: 2 turn items, no active turn, no error
    const turns = chat.querySelectorAll('.turn')
    assert.equal(turns.length, 2, 'should render 2 turn items')
    assert.equal(turns[0].textContent, 'Hello')
    assert.equal(turns[1].textContent, 'World')
    assert.equal(chat.querySelector('.active-turn'), null)
    assert.equal(chat.querySelector('.error'), null)

    // Show active turn
    chatStore.hasActiveTurn = true
    await flushMicrotasks()

    const elements = Array.from(chat.children) as HTMLElement[]
    const turnEls = elements.filter((el) => el.classList.contains('turn'))
    const activeTurn = chat.querySelector('.active-turn')

    assert.equal(turnEls.length, 2, 'still 2 turn items')
    assert.ok(activeTurn, 'active turn should appear')

    // Turn items must come before active turn in DOM order
    const turnIndices = turnEls.map((el) => elements.indexOf(el))
    const activeIndex = elements.indexOf(activeTurn as HTMLElement)
    for (const ti of turnIndices) {
      assert.ok(ti < activeIndex, `turn at index ${ti} must be before active turn at index ${activeIndex}`)
    }

    // Also show error
    chatStore.error = 'something went wrong'
    await flushMicrotasks()

    const allEls = Array.from(chat.children) as HTMLElement[]
    const turnEls2 = allEls.filter((el) => el.classList.contains('turn'))
    const activeTurn2 = chat.querySelector('.active-turn') as HTMLElement
    const errorEl = chat.querySelector('.error') as HTMLElement

    assert.equal(turnEls2.length, 2)
    assert.ok(activeTurn2)
    assert.ok(errorEl)
    assert.equal(errorEl.textContent, 'something went wrong')

    const idxTurns = turnEls2.map((el) => allEls.indexOf(el))
    const idxActive = allEls.indexOf(activeTurn2)
    const idxError = allEls.indexOf(errorEl)

    for (const ti of idxTurns) {
      assert.ok(ti < idxActive, `turn at ${ti} must precede active turn at ${idxActive}`)
      assert.ok(ti < idxError, `turn at ${ti} must precede error at ${idxError}`)
    }
    assert.ok(idxActive < idxError, 'active turn must precede error')

    panel.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('map items stay before conditional slots after store push', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-map-push-cond`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class MsgStore extends Store {
      messages = [] as Array<{ id: string; text: string }>
      loading = false

      addMessage(text: string) {
        this.messages.push({ id: String(this.messages.length + 1), text })
      }
    }
    const msgStore = new MsgStore()

    const MsgItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class MsgItem extends Component {
          template({ msg }) {
            return <span class="msg" key={msg.id}>{msg.text}</span>
          }
        }
      `,
      '/virtual/MsgItem.jsx',
      'MsgItem',
      { Component },
    )

    const MsgList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import msgStore from './msg-store'
        import MsgItem from './MsgItem.jsx'

        export default class MsgList extends Component {
          template() {
            return (
              <div class="list">
                {msgStore.messages.map(msg => (
                  <MsgItem key={msg.id} msg={msg} />
                ))}
                {msgStore.loading && <div class="spinner">Loading...</div>}
              </div>
            )
          }
        }
      `,
      '/virtual/MsgList.jsx',
      'MsgList',
      { Component, msgStore, MsgItem },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const list = new MsgList()
    list.render(root)
    await flushMicrotasks()

    // Show spinner
    msgStore.loading = true
    await flushMicrotasks()

    assert.ok(list.el.querySelector('.spinner'), 'spinner visible')

    // Push a message while spinner is showing
    msgStore.addMessage('first')
    await flushMicrotasks()

    const els = Array.from(list.el.children) as HTMLElement[]
    const msgs = els.filter((e) => e.classList.contains('msg'))
    const spinner = list.el.querySelector('.spinner') as HTMLElement

    assert.equal(msgs.length, 1)
    assert.ok(spinner)
    assert.ok(els.indexOf(msgs[0]) < els.indexOf(spinner), 'message must come before spinner')

    // Push another message
    msgStore.addMessage('second')
    await flushMicrotasks()

    const els2 = Array.from(list.el.children) as HTMLElement[]
    const msgs2 = els2.filter((e) => e.classList.contains('msg'))
    const spinner2 = list.el.querySelector('.spinner') as HTMLElement

    assert.equal(msgs2.length, 2)
    assert.ok(spinner2)
    for (const m of msgs2) {
      assert.ok(els2.indexOf(m) < els2.indexOf(spinner2), `msg "${m.textContent}" must precede spinner`)
    }

    list.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('conditional before map, map before conditional: all three preserve JSX source order', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-map-cond`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class AppStore extends Store {
      showHeader = false
      items = [
        { id: '1', label: 'alpha' },
        { id: '2', label: 'beta' },
      ] as Array<{ id: string; label: string }>
      loading = false
    }
    const appStore = new AppStore()

    const ListItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ListItem extends Component {
          template({ item }) {
            return <div class="item" key={item.id}>{item.label}</div>
          }
        }
      `,
      '/virtual/ListItem.jsx',
      'ListItem',
      { Component },
    )

    const Panel = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import appStore from './app-store'
        import ListItem from './ListItem.jsx'

        export default class Panel extends Component {
          template() {
            return (
              <div class="panel">
                {appStore.showHeader && <h1 class="header">Header</h1>}
                {appStore.items.map(item => (
                  <ListItem key={item.id} item={item} />
                ))}
                {appStore.loading && <div class="loader">Loading...</div>}
              </div>
            )
          }
        }
      `,
      '/virtual/Panel.jsx',
      'Panel',
      { Component, appStore, ListItem },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const panel = new Panel()
    panel.render(root)
    await flushMicrotasks()

    // Initial: no header, 2 items, no loader
    assert.equal(panel.el.querySelector('.header'), null)
    assert.equal(panel.el.querySelectorAll('.item').length, 2)
    assert.equal(panel.el.querySelector('.loader'), null)

    // Turn on all three
    appStore.showHeader = true
    appStore.loading = true
    await flushMicrotasks()

    const els = Array.from(panel.el.children) as HTMLElement[]
    const header = panel.el.querySelector('.header') as HTMLElement
    const items = els.filter((e) => e.classList.contains('item'))
    const loader = panel.el.querySelector('.loader') as HTMLElement

    assert.ok(header, 'header should appear')
    assert.equal(items.length, 2, 'still 2 items')
    assert.ok(loader, 'loader should appear')

    const idxHeader = els.indexOf(header)
    const idxItems = items.map((e) => els.indexOf(e))
    const idxLoader = els.indexOf(loader)

    // JSX order: header < items < loader
    for (const ii of idxItems) {
      assert.ok(idxHeader < ii, `header at ${idxHeader} must precede item at ${ii}`)
      assert.ok(ii < idxLoader, `item at ${ii} must precede loader at ${idxLoader}`)
    }

    panel.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
