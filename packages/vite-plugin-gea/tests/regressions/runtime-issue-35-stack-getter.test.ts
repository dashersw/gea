/**
 * https://github.com/dashersw/gea/issues/35
 *
 * Store module must live on disk next to the component so `analyzeStoreGetters` can
 * resolve `get stack()` → `notifications` (see runtime-store-props.test.ts — virtual paths
 * skip getter analysis and fall back to weaker observer wiring).
 *
 * The store file is also the **only** definition of the class: we dynamic-import it after
 * writing so the runtime instance matches the file the compiler analyzed (no duplicate
 * class next to `writeFile`). Files live under this directory so `@geajs/core` resolves;
 * temp dirs under `/tmp` do not.
 *
 * Matches the bug report: JSX `store.stack.map(...)` only — no manual reactivity API.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe(
  'issue #35 – store.stack.map (compiled JSX, on-disk store for getter analysis)',
  {
    concurrency: false,
  },
  () => {
    it('rerenders when backing field is reactive and get stack() reads it', async () => {
      const restoreDom = installDom()
      const dir = await mkdtemp(join(__dirname, 'issue35-good-'))

      try {
        const seed = `issue35-stack-getter-${Date.now()}-${Math.random()}`
        const [{ default: Component }] = await loadRuntimeModules(seed)

        await writeFile(
          join(dir, 'notifications-store.ts'),
          `import { Store } from '@geajs/core'
export default class NotificationsStore extends Store {
  notifications: Array<{ id: string; type: string; text: string }> = [
    { id: 'test1', type: 'success', text: 'Test notification 1' },
    { id: 'test2', type: 'success', text: 'Test notification 2' },
  ]
  get stack() {
    return this.notifications
  }
  get duration() {
    return 5000
  }
  remove(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id)
  }
}
`,
        )

        const [, { Store }] = await loadRuntimeModules(seed)
        resetDelegation()
        const NotificationsStore = await compileStore(`import { Store } from '@geajs/core'
export default class NotificationsStore extends Store {
  notifications = [
    { id: 'test1', type: 'success', text: 'Test notification 1' },
    { id: 'test2', type: 'success', text: 'Test notification 2' },
  ]
  get stack() { return this.notifications }
  get duration() { return 5000 }
  remove(id) { this.notifications = this.notifications.filter(n => n.id !== id) }
}`, join(dir, 'notifications-store.ts'), 'NotificationsStore', { Store })
        const store = new NotificationsStore()

        const NotificationDisplay = await compileJsxComponent(
          `
        import { Component } from '@geajs/core'
        import store from './notifications-store'

        export default class NotificationDisplay extends Component {
          template() {
            return (
              <div class="notification-stack">
                {store.stack.map((notification) => (
                  <div
                    key={notification.id}
                    data-id={notification.id}
                    class={\`notification \${notification.type}\`}
                    data-duration={store.duration}
                  >
                    {notification.text}
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
          join(dir, 'NotificationDisplay.jsx'),
          'NotificationDisplay',
          { Component, store },
        )

        const root = document.createElement('div')
        document.body.appendChild(root)

        const app = new NotificationDisplay()
        app.render(root)
        await flushMicrotasks()

        assert.equal(root.querySelectorAll('.notification').length, 2)

        store.remove('test1')
        await flushMicrotasks()

        assert.equal(root.querySelectorAll('.notification').length, 1)
        assert.equal(root.querySelector('.notification')?.getAttribute('data-id'), 'test2')
        assert.equal(root.querySelector('.notification')?.textContent?.trim(), 'Test notification 2')

        app.dispose()
        await flushMicrotasks()
      } finally {
        await rm(dir, { recursive: true, force: true })
        restoreDom()
      }
    })

    it('reassigning protected __stack backing field is reactive (same key as user __stack in store tests)', async () => {
      const restoreDom = installDom()
      const dir = await mkdtemp(join(__dirname, 'issue35-bad-'))

      try {
        const seed = `issue35-__stack-${Date.now()}-${Math.random()}`
        const [{ default: Component }] = await loadRuntimeModules(seed)

        await writeFile(
          join(dir, 'notifications-store.ts'),
          `import { Store } from '@geajs/core'
export default class NotificationsStore extends Store {
  protected __stack: Array<{ id: string; type: string; text: string }> = [
    { id: 'test1', type: 'success', text: 'Test notification 1' },
    { id: 'test2', type: 'success', text: 'Test notification 2' },
  ]
  get stack() {
    return this.__stack
  }
  remove(id: string) {
    this.__stack = this.__stack.filter((n) => n.id !== id)
  }
}
`,
        )

        const [, { Store }] = await loadRuntimeModules(seed)
        resetDelegation()
        const NotificationsStore = await compileStore(`import { Store } from '@geajs/core'
export default class NotificationsStore extends Store {
  notifications = [
    { id: 'test1', type: 'success', text: 'Test notification 1' },
    { id: 'test2', type: 'success', text: 'Test notification 2' },
  ]
  get stack() { return this.notifications }
  get duration() { return 5000 }
  remove(id) { this.notifications = this.notifications.filter(n => n.id !== id) }
}`, join(dir, 'notifications-store.ts'), 'NotificationsStore', { Store })
        const store = new NotificationsStore()

        const NotificationDisplay = await compileJsxComponent(
          `
        import { Component } from '@geajs/core'
        import store from './notifications-store'

        export default class NotificationDisplay extends Component {
          template() {
            return (
              <div class="notification-stack">
                {store.stack.map((notification) => (
                  <div key={notification.id} data-id={notification.id} class="notification">
                    {notification.text}
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
          join(dir, 'NotificationDisplay.jsx'),
          'NotificationDisplay',
          { Component, store },
        )

        const root = document.createElement('div')
        document.body.appendChild(root)

        const app = new NotificationDisplay()
        app.render(root)
        await flushMicrotasks()

        assert.equal(root.querySelectorAll('.notification').length, 2)

        store.remove('test1')
        await flushMicrotasks()

        assert.equal(
          root.querySelectorAll('.notification').length,
          1,
          '__stack reassign notifies observers; list DOM updates like other top-level store fields',
        )

        app.dispose()
        await flushMicrotasks()
      } finally {
        await rm(dir, { recursive: true, force: true })
        restoreDom()
      }
    })
  },
)
