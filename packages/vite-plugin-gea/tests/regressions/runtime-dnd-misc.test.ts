import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('drop scenario: move task between columns uses incremental DOM updates with zero full rebuilds', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-drop-zero-rerender`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      tasks: {
        t1: { id: 't1', title: 'Task A' },
        t2: { id: 't2', title: 'Task B' },
        t3: { id: 't3', title: 'Task C' },
        t4: { id: 't4', title: 'Task D' },
      } as Record<string, any>,
    })

    const MyColumn = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class MyColumn extends Component {
          template({ column }) {
            const taskIds = column.taskIds
            return (
              <div class="column">
                <div class="header">{column.title}</div>
                <div class="body">
                  {taskIds.map(taskId =>
                    store.tasks[taskId] ? (
                      <div key={taskId} class="card">{store.tasks[taskId].title}</div>
                    ) : null
                  )}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/MyColumn.jsx',
      'MyColumn',
      { Component, store },
    )

    const colA = { id: 'col-a', title: 'Backlog', taskIds: ['t1', 't2', 't3'] }
    const colB = { id: 'col-b', title: 'In Progress', taskIds: ['t4'] }
    const colC = { id: 'col-c', title: 'Done', taskIds: [] as string[] }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const viewA = new MyColumn({ column: colA })
    viewA.render(root)
    const viewB = new MyColumn({ column: colB })
    viewB.render(root)
    const viewC = new MyColumn({ column: colC })
    viewC.render(root)

    await flushMicrotasks()

    const bodyA = viewA.el.querySelector('.body')!
    const bodyB = viewB.el.querySelector('.body')!
    const bodyC = viewC.el.querySelector('.body')!

    assert.equal(bodyA.querySelectorAll('.card').length, 3, 'column A starts with 3 cards')
    assert.equal(bodyB.querySelectorAll('.card').length, 1, 'column B starts with 1 card')
    assert.equal(bodyC.querySelectorAll('.card').length, 0, 'column C starts empty')

    const origCardA0 = bodyA.querySelector('.card')!
    const origCardA2 = bodyA.querySelectorAll('.card')[2]!
    const origCardB0 = bodyB.querySelector('.card')!

    assert.equal(origCardA0.textContent, 'Task A')
    assert.equal(origCardA2.textContent, 'Task C')
    assert.equal(origCardB0.textContent, 'Task D')

    // --- Move t2 from A to B (splice from middle, push to end) ---
    const idx = colA.taskIds.indexOf('t2')
    colA.taskIds.splice(idx, 1)
    colB.taskIds.push('t2')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    viewC.__geaUpdateProps({ column: colC })
    await flushMicrotasks()

    const cardsA = bodyA.querySelectorAll('.card')
    const cardsB = bodyB.querySelectorAll('.card')
    assert.equal(cardsA.length, 2, 'column A has 2 cards after move')
    assert.equal(cardsB.length, 2, 'column B has 2 cards after move')
    assert.equal(cardsA[0].textContent, 'Task A', 'A: first card is t1')
    assert.equal(cardsA[1].textContent, 'Task C', 'A: second card is t3')
    assert.equal(cardsB[0].textContent, 'Task D', 'B: first card is t4')
    assert.equal(cardsB[1].textContent, 'Task B', 'B: second card is t2 (moved)')

    assert.equal(cardsA[0], origCardA0, 'A: t1 card is the SAME DOM node (not recreated)')
    assert.equal(cardsA[1], origCardA2, 'A: t3 card is the SAME DOM node (not recreated)')
    assert.equal(cardsB[0], origCardB0, 'B: t4 card is the SAME DOM node (not recreated)')

    assert.equal(bodyC.querySelectorAll('.card').length, 0, 'C: still empty, unaffected')

    // --- Move t3 from A to C (first move into empty column) ---
    const idx2 = colA.taskIds.indexOf('t3')
    colA.taskIds.splice(idx2, 1)
    colC.taskIds.push('t3')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    viewC.__geaUpdateProps({ column: colC })
    await flushMicrotasks()

    const cardsA2 = bodyA.querySelectorAll('.card')
    const cardsC2 = bodyC.querySelectorAll('.card')
    assert.equal(cardsA2.length, 1, 'column A has 1 card')
    assert.equal(cardsC2.length, 1, 'column C has 1 card')
    assert.equal(cardsA2[0].textContent, 'Task A')
    assert.equal(cardsC2[0].textContent, 'Task C')

    assert.equal(cardsA2[0], origCardA0, 'A: t1 card still the SAME DOM node after second move')

    const cardsB2 = bodyB.querySelectorAll('.card')
    assert.equal(cardsB2[0], origCardB0, 'B: t4 card still the SAME DOM node after second move')

    // --- Move t4 from B to A (moves card back, column B loses its only card) ---
    const idx3 = colB.taskIds.indexOf('t4')
    colB.taskIds.splice(idx3, 1)
    colA.taskIds.push('t4')

    viewA.__geaUpdateProps({ column: colA })
    viewB.__geaUpdateProps({ column: colB })
    viewC.__geaUpdateProps({ column: colC })
    await flushMicrotasks()

    const cardsA3 = bodyA.querySelectorAll('.card')
    const cardsB3 = bodyB.querySelectorAll('.card')
    const cardsC3 = bodyC.querySelectorAll('.card')
    assert.equal(cardsA3.length, 2, 'A has 2 cards after receiving t4')
    assert.equal(cardsB3.length, 1, 'B has 1 card (only t2 remains)')
    assert.equal(cardsC3.length, 1, 'C still has 1 card')

    assert.equal(cardsA3[0].textContent, 'Task A')
    assert.equal(cardsA3[1].textContent, 'Task D')
    assert.equal(cardsB3[0].textContent, 'Task B')

    assert.equal(cardsA3[0], origCardA0, 'A: t1 card STILL the same DOM node through all moves')

    // --- No-op: update props without any array change ---
    const headerA = viewA.el.querySelector('.header')!
    const headerTextBefore = headerA.textContent
    viewA.__geaUpdateProps({ column: colA })
    await flushMicrotasks()

    const cardsA4 = bodyA.querySelectorAll('.card')
    assert.equal(cardsA4.length, 2, 'A still has 2 cards after no-op update')
    assert.equal(cardsA4[0], origCardA0, 'A: t1 card unchanged after no-op')
    assert.equal(headerA.textContent, headerTextBefore, 'header text unchanged')

    viewA.dispose()
    viewB.dispose()
    viewC.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('dndManager discovers draggable elements via data-draggable-id attribute', async () => {
  const restoreDom = installDom()

  try {
    const { dndManager } = await import('../../../gea-ui/src/components/dnd-manager')
    dndManager.destroy()

    const container = document.createElement('div')
    container.dataset.droppableId = 'col-1'
    document.body.appendChild(container)

    const item1 = document.createElement('div')
    item1.dataset.draggableId = 'item-a'
    item1.textContent = 'Item A'
    container.appendChild(item1)

    const item2 = document.createElement('div')
    item2.dataset.draggableId = 'item-b'
    item2.textContent = 'Item B'
    container.appendChild(item2)

    dndManager.registerDroppable('col-1', container)

    dndManager.onDragEnd = () => {}

    const rect = item1.getBoundingClientRect()
    const pointerDownEvent = new (globalThis.window as any).PointerEvent('pointerdown', {
      clientX: rect.left + 5,
      clientY: rect.top + 5,
      button: 0,
      bubbles: true,
    })
    item1.dispatchEvent(pointerDownEvent)

    assert.ok((dndManager as any)._dragging, 'dndManager must start tracking on pointerdown')
    assert.equal((dndManager as any)._draggedId, 'item-a', 'draggedId must match data-draggable-id')
    assert.equal((dndManager as any)._sourceDroppableId, 'col-1', 'source droppableId must be discovered from ancestor')

    const pointerUpEvent = new (globalThis.window as any).PointerEvent('pointerup', {
      clientX: rect.left + 5,
      clientY: rect.top + 5,
      button: 0,
      bubbles: true,
    })
    document.dispatchEvent(pointerUpEvent)

    dndManager.destroy()
    container.remove()
  } finally {
    restoreDom()
  }
})

test('dndManager performs automatic component transfer on drop', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-dnd-transfer`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ChildItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ChildItem extends Component {
          template({ itemId, label }: any) {
            return <div class="child-item" data-draggable-id={itemId}>{label}</div>
          }
        }
      `,
      '/virtual/ChildItem.tsx',
      'ChildItem',
      { Component },
    )

    const ParentList = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import ChildItem from './ChildItem'

        export default class ParentList extends Component {
          template({ listId, items }: any) {
            return (
              <div class="parent-list" data-droppable-id={listId}>
                {items.map((it: any) => (
                  <ChildItem key={it.id} itemId={it.id} label={it.label} />
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentList.tsx',
      'ParentList',
      { Component, ChildItem },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const list1 = new ParentList({
      listId: 'list-1',
      items: [
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ],
    })
    list1.render(root)
    await flushMicrotasks()

    const list2 = new ParentList({
      listId: 'list-2',
      items: [{ id: 'c', label: 'Gamma' }],
    })
    list2.render(root)
    await flushMicrotasks()

    assert.equal(list1._itemsItems.length, 2, 'list1 must have 2 items')
    assert.equal(list2._itemsItems.length, 1, 'list2 must have 1 item')

    const itemA = list1._itemsItems[0]
    const itemAEl = itemA.el

    assert.ok(itemAEl, 'item A must have a DOM element')
    assert.equal(itemAEl.textContent, 'Alpha')

    const { dndManager } = await import('../../../gea-ui/src/components/dnd-manager')
    dndManager.destroy()

    const container1 = list1.el as HTMLElement
    const container2 = list2.el as HTMLElement
    assert.equal(container1.dataset.droppableId, 'list-1', 'list1 root must have data-droppable-id')
    assert.equal(container2.dataset.droppableId, 'list-2', 'list2 root must have data-droppable-id')
    dndManager.registerDroppable('list-1', container1)
    dndManager.registerDroppable('list-2', container2)

    const destination = { droppableId: 'list-2', index: 0 }
    ;(dndManager as any)._sourceEl = itemAEl
    ;(dndManager as any)._performTransfer(destination)

    assert.equal(list1._itemsItems.length, 1, 'list1 must have 1 item after transfer')
    assert.equal(list2._itemsItems.length, 2, 'list2 must have 2 items after transfer')
    assert.equal(list2._itemsItems[0], itemA, 'transferred component must be the same instance')
    assert.equal(itemA.parentComponent, list2, 'parentComponent must point to dest parent')
    assert.equal(itemAEl.parentElement, container2, 'DOM element must be in destination container')
    assert.equal(itemAEl.textContent, 'Alpha', 'content must be preserved')

    dndManager.destroy()
    list1.dispose()
    list2.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('IIFE in JSX renders the correct branch based on state', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-iife-jsx`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const IIFEView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class IIFEView extends Component {
          loading = true

          template() {
            return (
              <div>
                {(() => {
                  if (this.loading) return <span class="loading">Loading...</span>
                  return <span class="done">Done</span>
                })()}
              </div>
            )
          }
        }
      `,
      '/virtual/IIFEView.jsx',
      'IIFEView',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new IIFEView()
    component.render(root)
    await flushMicrotasks()

    assert.ok(
      component.el.textContent?.includes('Loading'),
      `Should render loading state initially, got: "${component.el.textContent}"`,
    )

    component.loading = false
    await flushMicrotasks()

    assert.ok(
      component.el.textContent?.includes('Done'),
      `Should render done state after update, got: "${component.el.textContent}"`,
    )

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('ref attribute assigns the DOM element to the component property', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-ref-attr`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const CanvasComp = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CanvasComp extends Component {
          canvasEl = null

          template() {
            return (
              <div>
                <canvas ref={this.canvasEl} width="800" height="600" />
              </div>
            )
          }
        }
      `,
      '/virtual/CanvasComp.jsx',
      'CanvasComp',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new CanvasComp()
    component.render(root)
    await flushMicrotasks()

    assert.ok(component.canvasEl, 'canvasEl should be assigned after render')
    assert.equal(component.canvasEl.tagName?.toLowerCase(), 'canvas', 'canvasEl should point to the canvas DOM element')
    assert.equal(component.canvasEl.getAttribute('width'), '800', 'Canvas should have width attribute')

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('multiple ref attributes each point to their respective DOM elements', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-multi-ref`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const MultiRef = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class MultiRef extends Component {
          headerEl = null
          footerEl = null

          template() {
            return (
              <div>
                <header ref={this.headerEl}>Header</header>
                <footer ref={this.footerEl}>Footer</footer>
              </div>
            )
          }
        }
      `,
      '/virtual/MultiRef.jsx',
      'MultiRef',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new MultiRef()
    component.render(root)
    await flushMicrotasks()

    assert.ok(component.headerEl, 'headerEl should be assigned')
    assert.ok(component.footerEl, 'footerEl should be assigned')
    assert.equal(component.headerEl.tagName?.toLowerCase(), 'header', 'headerEl should be a header element')
    assert.equal(component.footerEl.tagName?.toLowerCase(), 'footer', 'footerEl should be a footer element')
    assert.equal(component.headerEl.textContent, 'Header')
    assert.equal(component.footerEl.textContent, 'Footer')

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('issue #34: ref={this.myTextarea} is not null after render and trySubmit can access it', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-issue-34`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    // Exact code from issue #34
    const InputSection = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class InputSection extends Component {
          myTextarea = null

          template() {
            return (
              <section>
                <textarea ref={this.myTextarea} />

                <div>
                  <button onclick={this.trySubmit}>
                    Send
                  </button>
                </div>
              </section>
            )
          }

          trySubmit() {
            if (!this.myTextarea) return 'ref-is-null'
            return 'ref-is-set'
          }
        }
      `,
      '/virtual/InputSection.jsx',
      'InputSection',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new InputSection()
    component.render(root)
    await flushMicrotasks()
    await flushMicrotasks()

    assert.ok(component.myTextarea, 'this.myTextarea must not be null after render (issue #34)')
    assert.equal(
      component.myTextarea.tagName?.toLowerCase(),
      'textarea',
      'this.myTextarea must point to the textarea DOM element',
    )
    assert.equal(
      component.trySubmit(),
      'ref-is-set',
      'trySubmit must be able to access the ref — not return early due to null',
    )

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('ref binding does not trigger re-render loop after initial render', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-ref-no-rerender`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ChatInput = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ChatInput extends Component {
          myTextarea = null

          template() {
            return (
              <div>
                <textarea ref={this.myTextarea}></textarea>
                <button onclick={this.trySubmit}>Send</button>
              </div>
            )
          }

          trySubmit() {
            console.log(this.myTextarea)
          }
        }
      `,
      '/virtual/ChatInput.jsx',
      'ChatInput',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ChatInput()
    let renderCount = 0
    const origRender = component.__geaRequestRender?.bind(component)
    if (origRender) {
      component.__geaRequestRender = function () {
        renderCount++
        return origRender()
      }
    }

    component.render(root)
    await flushMicrotasks()
    // Drain any additional microtasks that a re-render loop would queue
    await flushMicrotasks()
    await flushMicrotasks()

    assert.ok(component.myTextarea, 'ref should be assigned after render')
    assert.equal(
      component.myTextarea.tagName?.toLowerCase(),
      'textarea',
      'ref should point to the textarea element',
    )
    assert.equal(renderCount, 0, 'ref assignment must not trigger __geaRequestRender (re-render loop)')

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('ref remains stable after multiple microtask flushes (no infinite loop)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-ref-stable`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Viewer = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Viewer extends Component {
          canvasEl = null
          status = 'ready'

          template() {
            return (
              <div>
                <canvas ref={this.canvasEl} width="640" height="480" />
                <span>{this.status}</span>
              </div>
            )
          }
        }
      `,
      '/virtual/Viewer.jsx',
      'Viewer',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new Viewer()
    component.render(root)
    await flushMicrotasks()

    const firstRef = component.canvasEl
    assert.ok(firstRef, 'canvasEl ref should be assigned')

    // Flush several times — if there's a re-render loop the ref would change
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(
      component.canvasEl,
      firstRef,
      'canvasEl ref must remain the same element — no re-render loop',
    )

    component.dispose()
    root.remove()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('spread attributes in JSX cause a compile-time rejection via plugin', async () => {
  const { geaPlugin } = await import('../../src/index')
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler

  await assert.rejects(
    async () => {
      await transform?.call(
        {} as never,
        `
          import { Component } from '@geajs/core'

          export default class BadSpread extends Component {
            template() {
              return <div {...this.props}>Content</div>
            }
          }
        `,
        '/virtual/BadSpread.jsx',
      )
    },
    (err: Error) => {
      assert.ok(
        err.message.includes('Spread attributes') || err.message.includes('[gea]'),
        `Expected spread error, got: ${err.message}`,
      )
      return true
    },
  )
})

test('function-as-child in JSX causes a compile-time rejection via plugin', async () => {
  const { geaPlugin } = await import('../../src/index')
  const plugin = geaPlugin()
  const transform = typeof plugin.transform === 'function' ? plugin.transform : plugin.transform?.handler

  await assert.rejects(
    async () => {
      await transform?.call(
        {} as never,
        `
          import { Component } from '@geajs/core'

          export default class BadFuncChild extends Component {
            template() {
              return (
                <div>
                  {(user) => <span>{user.name}</span>}
                </div>
              )
            }
          }
        `,
        '/virtual/BadFuncChild.jsx',
      )
    },
    (err: Error) => {
      assert.ok(
        err.message.includes('Function-as-child') || err.message.includes('[gea]'),
        `Expected function-as-child error, got: ${err.message}`,
      )
      return true
    },
  )
})

test('dndManager attaches document listener when onDragEnd is set (attribute-driven init)', async () => {
  const restoreDom = installDom()

  try {
    const { dndManager } = await import('../../../gea-ui/src/components/dnd-manager')
    dndManager.destroy()

    const container = document.createElement('div')
    container.dataset.droppableId = 'col-a'
    document.body.appendChild(container)

    const item = document.createElement('div')
    item.dataset.draggableId = 'item-1'
    item.textContent = 'Item 1'
    container.appendChild(item)

    assert.equal(
      (dndManager as any)._docListenerAttached,
      false,
      'listener must not be attached before onDragEnd is set',
    )

    dndManager.onDragEnd = () => {}

    assert.equal((dndManager as any)._docListenerAttached, true, 'listener must be attached after onDragEnd is set')

    const rect = item.getBoundingClientRect()
    const downEvt = new (globalThis.window as any).PointerEvent('pointerdown', {
      clientX: rect.left + 5,
      clientY: rect.top + 5,
      button: 0,
      bubbles: true,
    })
    item.dispatchEvent(downEvt)

    assert.ok((dndManager as any)._dragging, 'must start tracking after pointerdown on [data-draggable-id]')
    assert.equal((dndManager as any)._draggedId, 'item-1')
    assert.equal((dndManager as any)._sourceDroppableId, 'col-a')

    const upEvt = new (globalThis.window as any).PointerEvent('pointerup', {
      clientX: rect.left + 5,
      clientY: rect.top + 5,
      button: 0,
      bubbles: true,
    })
    document.dispatchEvent(upEvt)

    dndManager.destroy()
    container.remove()
  } finally {
    restoreDom()
  }
})
