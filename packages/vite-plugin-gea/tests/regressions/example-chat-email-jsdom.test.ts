import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadComponentUnseeded } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'

async function compileUiStubs(Component: unknown) {
  return compileJsxModule(
    `
      import { Component } from '@geajs/core'

      export class Avatar extends Component {
        template(props) { return <span class="avatar-root">{props.name || props.children || ''}</span> }
      }

      export class Badge extends Component {
        template(props) { return <span class={props.class || 'badge'}>{props.children}</span> }
      }

      export class Button extends Component {
        template(props) {
          return <button class={props.class || ''} disabled={props.disabled} click={props.click}>{props.children}</button>
        }
      }

      export class Input extends Component {
        template(props) {
          return <input id={props.inputId} class={props.class || ''} type={props.type || 'text'} placeholder={props.placeholder} value={props.value} input={props.onInput || props.input} />
        }
      }

      export class Label extends Component {
        template(props) { return <label for={props.htmlFor}>{props.children}</label> }
      }

      export class Separator extends Component {
        template(props) { return <hr class={props.class || 'separator'} /> }
      }

      export class Textarea extends Component {
        template(props) { return <textarea class={props.class || ''} placeholder={props.placeholder} rows={props.rows} value={props.value} input={props.onInput || props.input}></textarea> }
      }

      export class Toaster extends Component {
        template() { return <div class="toaster" /> }
      }
    `,
    '/virtual/UiStubs.tsx',
    ['Avatar', 'Badge', 'Button', 'Input', 'Label', 'Separator', 'Textarea', 'Toaster'],
    { Component },
  )
}

describe('ported chat/email example smoke tests', { concurrency: false }, () => {
  it('examples/chat renders conversations and switches active thread', async () => {
    const restoreDom = installDom()
    try {
      const seed = `chat-smoke-${Date.now()}`
      const { ChatStore } = await import('../../../../examples/chat/store.ts')
      const Component = await loadComponentUnseeded()
      const { router, RouterView } = await import(`../../../gea/src/router/index.ts?${seed}`)
      const ui = await compileUiStubs(Component)
      const store = new ChatStore()

      const MessageBubble = await compileJsxComponent(
        readExampleFile('chat/message-bubble.tsx'),
        '/virtual/examples/chat/MessageBubble.tsx',
        'MessageBubble',
        { Component, Avatar: ui.Avatar, store },
      )
      const ConversationItem = await compileJsxComponent(
        readExampleFile('chat/conversation-item.tsx'),
        '/virtual/examples/chat/ConversationItem.tsx',
        'ConversationItem',
        { Component, Avatar: ui.Avatar, Badge: ui.Badge, store, router },
      )
      const MessageThread = await compileJsxComponent(
        readExampleFile('chat/message-thread.tsx'),
        '/virtual/examples/chat/MessageThread.tsx',
        'MessageThread',
        { Component, Avatar: ui.Avatar, Button: ui.Button, Separator: ui.Separator, store, MessageBubble },
      )
      const ChatApp = await compileJsxComponent(
        readExampleFile('chat/app.tsx'),
        '/virtual/examples/chat/App.tsx',
        'App',
        {
          Component,
          router,
          RouterView,
          Badge: ui.Badge,
          Separator: ui.Separator,
          store,
          ConversationItem,
          MessageThread,
        },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const app = new ChatApp()
      app.render(root)
      await flushMicrotasks()
      await flushMicrotasks()

      assert.equal(root.querySelectorAll('.conv-item').length, 4)
      assert.ok(root.querySelector('.conv-item')?.classList.contains('active'))
      const second = root.querySelectorAll('.conv-item')[1] as HTMLButtonElement
      second.click()
      await flushMicrotasks()
      assert.ok(second.classList.contains('active'))
      assert.equal(root.querySelector('.thread-name')?.textContent, 'Jackson Lee')

      app.dispose()
      router.dispose()
      root.remove()
    } finally {
      restoreDom()
    }
  })

  it('examples/email-client renders inbox rows and folder/label filters without duplicates', async () => {
    const restoreDom = installDom()
    try {
      const seed = `email-smoke-${Date.now()}`
      const { EmailStore, LABEL_COLORS } = await import('../../../../examples/email-client/store.ts')
      const Component = await loadComponentUnseeded()
      const { router } = await import(`../../../gea/src/router/index.ts?${seed}`)
      const ui = await compileUiStubs(Component)
      const store = new EmailStore()
      const ToastStore = { success() {} }

      const EmailRow = await compileJsxComponent(
        readExampleFile('email-client/email-row.tsx'),
        '/virtual/examples/email-client/EmailRow.tsx',
        'EmailRow',
        { Component, Avatar: ui.Avatar, store, LABEL_COLORS },
      )
      const EmailDetail = await compileJsxComponent(
        readExampleFile('email-client/email-detail.tsx'),
        '/virtual/examples/email-client/EmailDetail.tsx',
        'EmailDetail',
        {
          Component,
          Avatar: ui.Avatar,
          Badge: ui.Badge,
          Button: ui.Button,
          Separator: ui.Separator,
          ToastStore,
          store,
          LABEL_COLORS,
        },
      )
      const App = await compileJsxComponent(
        readExampleFile('email-client/app.tsx'),
        '/virtual/examples/email-client/App.tsx',
        'App',
        {
          Component,
          router,
          Badge: ui.Badge,
          Button: ui.Button,
          Input: ui.Input,
          Label: ui.Label,
          Separator: ui.Separator,
          Textarea: ui.Textarea,
          Toaster: ui.Toaster,
          ToastStore,
          store,
          LABEL_COLORS,
          EmailRow,
          EmailDetail,
        },
      )

      const root = document.createElement('div')
      document.body.appendChild(root)
      const app = new App()
      app.render(root)
      await flushMicrotasks()
      await flushMicrotasks()

      const inboxCount = store.emails.filter((email) => email.folder === 'inbox').length
      const initialIds = Array.from(root.querySelectorAll('.email-list [data-email-id]')).map((node) =>
        (node as HTMLElement).getAttribute('data-email-id'),
      )
      assert.equal(initialIds.length, inboxCount)
      assert.equal(new Set(initialIds).size, initialIds.length)
      ;(root.querySelector('[data-folder="sent"]') as HTMLButtonElement).click()
      await flushMicrotasks()
      ;(root.querySelector('[data-label="travel"]') as HTMLButtonElement).click()
      await flushMicrotasks()
      assert.equal(root.querySelectorAll('.email-list [data-email-id]').length, 0)
      ;(root.querySelector('[data-folder="inbox"]') as HTMLButtonElement).click()
      await flushMicrotasks()
      await flushMicrotasks()
      const afterIds = Array.from(root.querySelectorAll('.email-list [data-email-id]')).map((node) =>
        (node as HTMLElement).getAttribute('data-email-id'),
      )
      assert.equal(new Set(afterIds).size, afterIds.length)

      app.dispose()
      router.dispose()
      root.remove()
    } finally {
      restoreDom()
    }
  })
})
