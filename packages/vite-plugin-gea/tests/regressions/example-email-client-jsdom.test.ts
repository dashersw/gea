import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileJsxModule, loadComponentUnseeded, loadRuntimeModules, readGeaUiSource } from '../helpers/compile'
import { examplePath, readExampleFile } from '../helpers/example-paths'
import { resetDelegation } from '../../../../packages/gea/src/dom/events'
import type { EmailStore as EmailStoreType } from '../../../../examples/email-client/store'

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

async function mountEmailClientApp(seed: string, pageUrl = 'http://localhost/') {
  const restore = installDom(pageUrl)
  const restoreRO = shimResizeObserver()

  const [, { Store }] = await loadRuntimeModules(seed)
  const storeSource = readExampleFile('email-client/store.ts')
  const storeModuleExports = await compileJsxModule(storeSource, examplePath('email-client/store.ts'), ['EmailStore', 'LABEL_COLORS'], { Store })
  const EmailStore = storeModuleExports.EmailStore as any
  const LABEL_COLORS = storeModuleExports.LABEL_COLORS as Record<string, string>
  const Component = await loadComponentUnseeded()
  const { createRouter } = await import(`../../../gea/src/router/index.ts?${seed}`)
  const router = createRouter({})

  const { cn } = await import('../../../gea-ui/src/utils/cn.ts')
  const { default: ZagComponent } = await import('../../../gea-ui/src/primitives/zag-component.ts')
  const { normalizeProps, spreadProps, VanillaMachine } = await import('@zag-js/vanilla')
  const avatar = await import('@zag-js/avatar')
  const toast = await import('@zag-js/toast')

  const ui = (name: string, file: string) =>
    compileJsxModule(readGeaUiSource('components', file), `/virtual/gea-ui/email-${name}.jsx`, [name], {
      Component,
      cn,
    })

  const { Button } = await ui('Button', 'button.tsx')
  const { Badge } = await ui('Badge', 'badge.tsx')
  const { Input } = await ui('Input', 'input.tsx')
  const { Label } = await ui('Label', 'label.tsx')
  const { Separator } = await ui('Separator', 'separator.tsx')
  const { Textarea } = await ui('Textarea', 'textarea.tsx')

  const { Avatar } = await compileJsxModule(
    readGeaUiSource('components', 'avatar.tsx'),
    '/virtual/gea-ui/email-Avatar.jsx',
    ['Avatar'],
    { ZagComponent, avatar, normalizeProps },
  )

  const { Toaster, ToastStore } = await compileJsxModule(
    readGeaUiSource('components', 'toast.tsx'),
    '/virtual/gea-ui/email-Toaster.jsx',
    ['Toaster', 'ToastStore'],
    { Component, toast, normalizeProps, spreadProps, VanillaMachine },
  )

  const store = new EmailStore()

  const emailRowPath = examplePath('email-client/email-row.tsx')
  const EmailRow = await compileJsxComponent(readExampleFile('email-client/email-row.tsx'), emailRowPath, 'EmailRow', {
    Component,
    Avatar,
    store,
    LABEL_COLORS,
  })

  const emailDetailPath = examplePath('email-client/email-detail.tsx')
  const EmailDetail = await compileJsxComponent(
    readExampleFile('email-client/email-detail.tsx'),
    emailDetailPath,
    'EmailDetail',
    { Component, Avatar, Badge, Button, Separator, ToastStore, store, LABEL_COLORS },
  )

  const appPath = examplePath('email-client/app.tsx')
  const App = await compileJsxComponent(readExampleFile('email-client/app.tsx'), appPath, 'App', {
    Component,
    router,
    Badge,
    Button,
    Input,
    Label,
    Separator,
    Textarea,
    Toaster,
    ToastStore,
    store,
    LABEL_COLORS,
    EmailRow,
    EmailDetail,
  })

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new App()
  app.render(root)
  await flushMicrotasks()
  await flushMicrotasks()

  return {
    app,
    root,
    router,
    store,
    restoreDom: () => {
      restoreRO()
      restore()
    },
  }
}

type MountEmail = Awaited<ReturnType<typeof mountEmailClientApp>>

function listRowIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.email-list [data-email-id]')).map(
    (n) => (n as HTMLElement).getAttribute('data-email-id')!,
  )
}

describe('examples/email-client in JSDOM', { concurrency: false }, () => {
  let outerRestore: () => void
  let root: HTMLElement
  let app: { dispose?: () => void }
  let router: { dispose?: () => void }
  let store: EmailStoreType

  beforeEach(async () => {
    resetDelegation()
    const m: MountEmail = await mountEmailClientApp(`ex-mail-${Date.now()}-${Math.random()}`)
    outerRestore = m.restoreDom
    app = m.app
    root = m.root
    router = m.router
    store = m.store
  })

  afterEach(async () => {
    try { app.dispose?.() } catch {}
    try { router.dispose?.() } catch {}
    await flushMicrotasks()
    root.remove()
    outerRestore()
  })

  it('Sent → Travel (empty) → Inbox: no duplicate rows (real App, EmailRow, EmailStore)', async () => {
    const inboxCount = store.emails.filter((e) => e.folder === 'inbox').length
    assert.ok(inboxCount >= 2, 'fixture should have multiple inbox emails')

    const initial = listRowIds(root)
    assert.equal(initial.length, inboxCount, 'initial inbox list')
    assert.equal(new Set(initial).size, initial.length, 'initial rows unique')
    ;(root.querySelector('[data-folder="sent"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    await flushMicrotasks()
    // GEA_REQUEST_RENDER removed in v2
    await flushMicrotasks()
    await flushMicrotasks()

    const sentCount = store.emails.filter((e) => e.folder === 'sent').length
    assert.deepEqual(listRowIds(root).sort(), store.folderEmails.map((e) => e.id).sort())
    assert.equal(listRowIds(root).length, sentCount)
    ;(root.querySelector('[data-label="travel"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(store.folderEmails.length, 0, 'Sent + Travel: no sent mail has travel')
    assert.equal(listRowIds(root).length, 0)
    ;(root.querySelector('[data-folder="inbox"]') as HTMLButtonElement).click()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()
    // Store + observers can be ahead of list DOM after folder nav; force a render pass (see gea list patch).
    // GEA_REQUEST_RENDER removed in v2
    await flushMicrotasks()
    await flushMicrotasks()

    const after = listRowIds(root)
    assert.equal(
      after.length,
      inboxCount,
      `expected ${inboxCount} inbox rows after navigation, got ${after.length}: ${after.join(', ')}`,
    )
    assert.equal(new Set(after).size, after.length, 'duplicate .email-list rows (real EmailRow components)')
  })
})
