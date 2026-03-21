import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { JSDOM } from 'jsdom'

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const raf = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
  const caf = (id: number) => clearTimeout(id)
  dom.window.requestAnimationFrame = raf
  dom.window.cancelAnimationFrame = caf

  const previous: Record<string, any> = {}
  const globals: Record<string, any> = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    PointerEvent: dom.window.Event,
    KeyboardEvent: dom.window.KeyboardEvent ?? dom.window.Event,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    getComputedStyle: dom.window.getComputedStyle,
  }

  for (const key in globals) {
    previous[key] = (globalThis as any)[key]
  }
  Object.assign(globalThis, globals)

  return () => {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
}

async function waitForDrop() {
  await new Promise((r) => setTimeout(r, 300))
  await new Promise((r) => setTimeout(r, 0))
}

function createDroppable(id: string, itemIds: string[]): HTMLElement {
  const droppable = document.createElement('div')
  droppable.className = 'gea-droppable'
  droppable.setAttribute('data-droppable-id', id)

  let top = 0
  for (let i = 0; i < itemIds.length; i++) {
    const item = document.createElement('div')
    item.className = 'gea-draggable'
    item.setAttribute('data-draggable-id', itemIds[i])
    item.setAttribute('data-index', String(i))
    item.textContent = `Item ${itemIds[i]}`

    const h = 40
    const itemTop = top
    item.getBoundingClientRect = () => ({
      x: 0,
      y: itemTop,
      top: itemTop,
      left: 0,
      right: 200,
      bottom: itemTop + h,
      width: 200,
      height: h,
      toJSON() {},
    })
    top += h + 5
    droppable.appendChild(item)
  }

  const totalHeight = top
  droppable.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 200,
    bottom: totalHeight,
    width: 200,
    height: totalHeight,
    toJSON() {},
  })

  return droppable
}

function pointerEvent(type: string, opts: Partial<PointerEvent> = {}): PointerEvent {
  const e = new Event(type, { bubbles: true, cancelable: true }) as any
  e.clientX = opts.clientX ?? 0
  e.clientY = opts.clientY ?? 0
  e.button = opts.button ?? 0
  e.pointerId = opts.pointerId ?? 1
  return e as PointerEvent
}

describe('DndManager', () => {
  let restoreDom: () => void
  let dndManager: any

  beforeEach(async () => {
    restoreDom = installDom()
    const seed = `dnd-${Date.now()}-${Math.random()}`
    const mod = await import(`../src/components/dnd-manager?${seed}`)
    dndManager = mod.dndManager
  })

  afterEach(() => {
    dndManager.destroy()
    restoreDom()
  })

  describe('registration', () => {
    it('registers and unregisters droppables', () => {
      const el = document.createElement('div')
      dndManager.registerDroppable('list-1', el)
      assert.equal(dndManager.droppables.size, 1)
      assert.equal(dndManager.droppables.get('list-1'), el)

      dndManager.unregisterDroppable('list-1')
      assert.equal(dndManager.droppables.size, 0)
    })

    it('supports multiple droppables', () => {
      const el1 = document.createElement('div')
      const el2 = document.createElement('div')
      dndManager.registerDroppable('a', el1)
      dndManager.registerDroppable('b', el2)
      assert.equal(dndManager.droppables.size, 2)
    })
  })

  describe('drag lifecycle', () => {
    it('does not start drag until movement exceeds threshold', async () => {
      const droppable = createDroppable('col-1', ['item-1', 'item-2'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      const item = droppable.querySelector('[data-draggable-id="item-1"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 20, button: 0 }), 'item-1', item)

      assert.equal(dndManager.isDragging, false)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 101, clientY: 21 }))
      assert.equal(dndManager.isDragging, false, 'below threshold')

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 110, clientY: 30 }))
      assert.equal(dndManager.isDragging, true, 'above threshold')

      document.dispatchEvent(pointerEvent('pointerup', { clientX: 110, clientY: 30 }))
      await waitForDrop()
    })

    it('calls onDragEnd with correct source on drop', async () => {
      const droppable = createDroppable('col-1', ['a', 'b', 'c'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      let result: any = null
      dndManager.onDragEnd = (r: any) => {
        result = r
      }

      const item = droppable.querySelector('[data-draggable-id="b"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 65, button: 0 }), 'b', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 80 }))
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 100, clientY: 80 }))
      await waitForDrop()

      assert.ok(result, 'onDragEnd was called')
      assert.equal(result.draggableId, 'b')
      assert.equal(result.source.droppableId, 'col-1')
      assert.equal(result.source.index, 1)
    })

    it('reports destination as null when dropped outside droppables', async () => {
      const droppable = createDroppable('col-1', ['x'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      let result: any = null
      dndManager.onDragEnd = (r: any) => {
        result = r
      }

      const item = droppable.querySelector('[data-draggable-id="x"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'x', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 500 }))
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 500, clientY: 500 }))
      await waitForDrop()

      assert.ok(result, 'onDragEnd was called')
      assert.equal(result.destination, null)
    })
  })

  describe('cross-list move', () => {
    it('reports correct destination when moving between droppables', async () => {
      const col1 = createDroppable('col-1', ['a', 'b'])
      const col2 = createDroppable('col-2', ['c', 'd'])

      col1.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        toJSON() {},
      })
      col2.getBoundingClientRect = () => ({
        x: 250,
        y: 0,
        top: 0,
        left: 250,
        right: 450,
        bottom: 200,
        width: 200,
        height: 200,
        toJSON() {},
      })

      document.body.appendChild(col1)
      document.body.appendChild(col2)
      dndManager.registerDroppable('col-1', col1)
      dndManager.registerDroppable('col-2', col2)

      let result: any = null
      dndManager.onDragEnd = (r: any) => {
        result = r
      }

      const item = col1.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 350, clientY: 10 }))
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 350, clientY: 10 }))
      await waitForDrop()

      assert.ok(result, 'onDragEnd was called')
      assert.equal(result.source.droppableId, 'col-1')
      assert.equal(result.source.index, 0)
      assert.ok(result.destination, 'destination exists')
      assert.equal(result.destination.droppableId, 'col-2')
    })
  })

  describe('same-list reorder', () => {
    it('reports correct destination index when reordering within a list', async () => {
      const droppable = createDroppable('col-1', ['a', 'b', 'c'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      let result: any = null
      dndManager.onDragEnd = (r: any) => {
        result = r
      }

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 120 }))
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 100, clientY: 120 }))
      await waitForDrop()

      assert.ok(result, 'onDragEnd was called')
      assert.equal(result.source.droppableId, 'col-1')
      assert.equal(result.source.index, 0)
      assert.ok(result.destination, 'destination exists')
      assert.equal(result.destination.droppableId, 'col-1')
      assert.ok(result.destination.index > 0, `expected index > 0, got ${result.destination.index}`)
    })
  })

  describe('placeholder', () => {
    it('creates a placeholder element during drag', () => {
      const droppable = createDroppable('col-1', ['a', 'b'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 25 }))

      const placeholder = droppable.querySelector('.gea-dnd-placeholder')
      assert.ok(placeholder, 'placeholder was created')

      dndManager.destroy()
    })

    it('inserts clone into document.body during drag', () => {
      const droppable = createDroppable('col-1', ['a'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 110, clientY: 25 }))

      const clone = document.body.querySelector('.gea-dnd-clone')
      assert.ok(clone, 'clone was appended to body')

      dndManager.destroy()
    })
  })

  describe('cleanup', () => {
    it('removes clone and placeholder after drop', async () => {
      const droppable = createDroppable('col-1', ['a', 'b'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      dndManager.onDragEnd = () => {}

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 80 }))
      document.dispatchEvent(pointerEvent('pointerup', { clientX: 100, clientY: 80 }))
      await waitForDrop()

      assert.equal(document.body.querySelector('.gea-dnd-clone'), null, 'clone removed')
      assert.equal(droppable.querySelector('.gea-dnd-placeholder'), null, 'placeholder removed')
    })

    it('removes gea-dragging class from source element after drop', async () => {
      const droppable = createDroppable('col-1', ['a', 'b'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      dndManager.onDragEnd = () => {}

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 80 }))
      assert.ok(item.classList.contains('gea-dragging'), 'source has gea-dragging class during drag')

      document.dispatchEvent(pointerEvent('pointerup', { clientX: 100, clientY: 80 }))
      await waitForDrop()

      assert.ok(!item.classList.contains('gea-dragging'), 'gea-dragging class removed after drop')
    })

    it('cancels drag on Escape key', async () => {
      const droppable = createDroppable('col-1', ['a'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      let result: any = null
      dndManager.onDragEnd = (r: any) => {
        result = r
      }

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 0 }), 'a', item)

      document.dispatchEvent(pointerEvent('pointermove', { clientX: 110, clientY: 25 }))

      const esc = new Event('keydown', { bubbles: true }) as any
      esc.key = 'Escape'
      document.dispatchEvent(esc)
      await waitForDrop()

      assert.ok(result, 'onDragEnd was called after escape')
      assert.equal(result.destination, null, 'escape reports null destination')
    })

    it('ignores right-click (button !== 0)', () => {
      const droppable = createDroppable('col-1', ['a'])
      document.body.appendChild(droppable)
      dndManager.registerDroppable('col-1', droppable)

      const item = droppable.querySelector('[data-draggable-id="a"]') as HTMLElement
      dndManager.startTracking(pointerEvent('pointerdown', { clientX: 100, clientY: 10, button: 2 }), 'a', item)

      assert.equal(dndManager.isDragging, false)
    })

    it('destroy() clears all state', () => {
      const el = document.createElement('div')
      dndManager.registerDroppable('test', el)
      dndManager.onDragEnd = () => {}

      dndManager.destroy()

      assert.equal(dndManager.droppables.size, 0)
      assert.equal(dndManager.onDragEnd, null)
    })
  })
})
