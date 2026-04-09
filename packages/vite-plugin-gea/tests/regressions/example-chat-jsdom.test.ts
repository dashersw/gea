import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadComponentUnseeded, readGeaUiSource } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'
import type { ChatStore } from '../../../../examples/chat/store'

function shimResizeObserver() {
  const prev = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver
  return () => {
    if (prev) globalThis.ResizeObserver = prev
    else delete (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  }
}

async function mountChatApp(seed: string, pageUrl = 'http://localhost/') {
  const restore = installDom(pageUrl)
  const restoreRO = shimResizeObserver()

  const { ChatStore } = await import('../../../../examples/chat/store.ts')
  const Component = await loadComponentUnseeded()
  const { router, RouterView } = await import(`../../../gea/src/lib/router/index.ts?${seed}`)

  const { cn } = await import('../../../gea-ui/src/utils/cn.ts')
  const { default: ZagComponent } = await import('../../../gea-ui/src/primitives/zag-component.ts')
  const { normalizeProps } = await import('@zag-js/vanilla')
  const avatar = await import('@zag-js/avatar')

  const { Button } = await compileJsxModule(
    readGeaUiSource('components', 'button.tsx'),
    '/virtual/gea-ui/chat-Button.jsx',
    ['Button'],
    { Component, cn },
  )
  const { Badge } = await compileJsxModule(
    readGeaUiSource('components', 'badge.tsx'),
    '/virtual/gea-ui/chat-Badge.jsx',
    ['Badge'],
    { Component, cn },
  )
  const { Separator } = await compileJsxModule(
    readGeaUiSource('components', 'separator.tsx'),
    '/virtual/gea-ui/chat-Separator.jsx',
    ['Separator'],
    { Component, cn },
  )
  const { Avatar } = await compileJsxModule(
    readGeaUiSource('components', 'avatar.tsx'),
    '/virtual/gea-ui/chat-Avatar.jsx',
    ['Avatar'],
    { ZagComponent, avatar, normalizeProps },
  )

  const chatStore = new ChatStore()

  const MessageBubble = await compileJsxComponent(
    readExampleFile('chat/message-bubble.tsx'),
    '/virtual/examples/chat/MessageBubble.jsx',
    'MessageBubble',
    { Component, Avatar, store: chatStore },
  )

  const ConversationItem = await compileJsxComponent(
    readExampleFile('chat/conversation-item.tsx'),
    '/virtual/examples/chat/ConversationItem.jsx',
    'ConversationItem',
    { Component, Avatar, Badge, store: chatStore, router },
  )

  const MessageThread = await compileJsxComponent(
    readExampleFile('chat/message-thread.tsx'),
    '/virtual/examples/chat/MessageThread.jsx',
    'MessageThread',
    { Component, Avatar, Button, Separator, store: chatStore, MessageBubble },
  )

  const routes = {
    '/': MessageThread,
    '/conversations/:id': MessageThread,
  } as const

  const appSource = readExampleFile('chat/app.tsx').replace(/const routes = \{[\s\S]*?\} as const\n\n/, '')

  const ChatApp = await compileJsxComponent(appSource, '/virtual/examples/chat/App.jsx', 'App', {
    Component,
    router,
    RouterView,
    Badge,
    Separator,
    store: chatStore,
    ConversationItem,
    MessageThread,
    routes,
  })

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new ChatApp()
  app.render(root)
  await flushMicrotasks()
  await flushMicrotasks()

  return {
    app,
    root,
    router,
    chatStore,
    restoreDom: () => {
      restoreRO()
      restore()
    },
  }
}

type MountChat = Awaited<ReturnType<typeof mountChatApp>>

describe('examples/chat in JSDOM (ported from chat.spec)', { concurrency: false }, () => {
  let outerRestore: () => void
  let root: HTMLElement
  let app: { dispose: () => void }
  let router: { dispose: () => void }
  let chatStore: ChatStore

  beforeEach(async () => {
    const m: MountChat = await mountChatApp(`ex-chat-${Date.now()}-${Math.random()}`)
    outerRestore = m.restoreDom
    app = m.app
    root = m.root
    router = m.router
    chatStore = m.chatStore
  })

  afterEach(async () => {
    app.dispose()
    router.dispose()
    await flushMicrotasks()
    root.remove()
    outerRestore()
  })

  it('shows four conversations and first active', () => {
    assert.equal(root.querySelectorAll('.conv-item').length, 4)
    assert.ok(root.querySelector('.conv-item')?.classList.contains('active'))
  })

  it('switching conversation updates active item', async () => {
    const items = root.querySelectorAll('.conv-item')
    ;(items[1] as HTMLButtonElement).click()
    await flushMicrotasks()
    assert.ok(items[1].classList.contains('active'))
    assert.ok(!items[0].classList.contains('active'))
  })

  it('thread header matches active conversation', () => {
    const firstName = root.querySelector('.conv-item .conv-name')?.textContent
    assert.equal(root.querySelector('.thread-name')?.textContent, firstName)
  })

  it('shows bubbles and send disabled when draft empty', () => {
    assert.ok(root.querySelectorAll('.bubble').length > 0)
    const send = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Send') as HTMLButtonElement
    assert.ok(send)
    assert.equal(send.disabled, true)
  })

  it('send enables when draft non-empty', async () => {
    const send = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Send') as HTMLButtonElement
    assert.equal(send.disabled, true)
    chatStore.setDraft({ target: { value: 'JSDOM hello' } as any })
    await flushMicrotasks()
    assert.equal(send.disabled, false)
  })

  it('sendMessage updates store (nested messages + compiled shell)', async () => {
    const before = chatStore.activeMessages.length
    chatStore.setDraft({ target: { value: 'JSDOM hello' } as any })
    chatStore.sendMessage()
    assert.equal(chatStore.activeMessages.length, before + 1)
    assert.equal(chatStore.activeMessages[chatStore.activeMessages.length - 1]?.text, 'JSDOM hello')
    assert.equal(chatStore.draft, '')
  })

  it('no data-gea-compiled-child-root leaks', () => {
    assert.equal(root.querySelectorAll('[data-gea-compiled-child-root]').length, 0)
  })
})

describe('examples/chat router deep link in JSDOM', { concurrency: false }, () => {
  it('deep link selects conversation and thread name', async () => {
    const m = await mountChatApp(`ex-chat-deeplink-${Date.now()}`, 'http://localhost/conversations/c2')
    try {
      await flushMicrotasks()
      assert.equal(m.root.querySelector('.thread-name')?.textContent, 'Jackson Lee')
      const items = m.root.querySelectorAll('.conv-item')
      assert.ok(items[1].classList.contains('active'))
    } finally {
      m.app.dispose()
      m.router.dispose()
      await flushMicrotasks()
      m.root.remove()
      m.restoreDom()
    }
  })
})
