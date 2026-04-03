import { GEA_DOM_COMPONENT, GEA_PARENT_COMPONENT, GEA_PROXY_GET_RAW_TARGET, geaListItemsSymbol } from '@geajs/core'

export interface DragResult {
  draggableId: string
  source: { droppableId: string; index: number }
  destination: { droppableId: string; index: number }
}

const DRAG_THRESHOLD_SQ = 25
const DRAGGABLE_SEL = '[data-draggable-id]'
const DROPPABLE_SEL = '[data-droppable-id]'

function _rawComp(comp: any): any {
  return comp?.[GEA_PROXY_GET_RAW_TARGET] ?? comp
}

class DndManager {
  droppables = new Map<string, HTMLElement>()

  private _onDragEnd: ((result: DragResult) => void) | null = null
  get onDragEnd() {
    return this._onDragEnd
  }
  set onDragEnd(fn: ((result: DragResult) => void) | null) {
    this._onDragEnd = fn
    if (fn) this._ensureDocListener()
  }

  private _dragging = false
  private _started = false
  private _draggedId = ''
  private _sourceDroppableId = ''
  private _sourceIndex = 0
  private _sourceEl: HTMLElement | null = null
  private _sourceHeight = 0
  private _sourceRect: DOMRect | null = null
  private _savedCssText = ''
  private _placeholder: HTMLElement | null = null
  private _startX = 0
  private _startY = 0
  private _offsetX = 0
  private _offsetY = 0
  private _currentDroppableId: string | null = null
  private _currentIndex = 0
  private _lastClientY = 0
  private _cleanedUp = false

  private _boundMove = this._onPointerMove.bind(this)
  private _boundUp = this._onPointerUp.bind(this)
  private _boundKeyDown = this._onKeyDown.bind(this)
  private _boundDocDown = this._onDocumentPointerDown.bind(this)
  private _docListenerAttached = false

  get isDragging() {
    return this._started
  }

  private _ensureDocListener() {
    if (this._docListenerAttached || typeof document === 'undefined') return
    document.addEventListener('pointerdown', this._boundDocDown, true)
    this._docListenerAttached = true
  }

  private _onDocumentPointerDown(e: PointerEvent) {
    const el = (e.target as HTMLElement).closest?.(DRAGGABLE_SEL) as HTMLElement
    if (!el) return
    this.startTracking(e, el.dataset.draggableId!, el)
  }

  registerDroppable(id: string, el: HTMLElement) {
    this.droppables.set(id, el)
    this._ensureDocListener()
  }

  unregisterDroppable(id: string) {
    this.droppables.delete(id)
  }

  startTracking(e: PointerEvent, draggableId: string, el: HTMLElement) {
    if (this._dragging || e.button !== 0) return
    this._ensureDocListener()

    const droppableEl = el.closest(DROPPABLE_SEL) as HTMLElement
    if (!droppableEl) return

    const droppableId = droppableEl.dataset.droppableId!
    const siblings = Array.from(droppableEl.querySelectorAll(`:scope > ${DRAGGABLE_SEL}`))
    const sourceIndex = siblings.indexOf(el)
    if (sourceIndex === -1) return

    this._dragging = true
    this._started = false
    this._cleanedUp = false
    this._draggedId = draggableId
    this._sourceDroppableId = droppableId
    this._sourceIndex = sourceIndex
    this._sourceEl = el

    const rect = el.getBoundingClientRect()
    this._sourceHeight = rect.height
    this._sourceRect = rect
    this._startX = e.clientX
    this._startY = e.clientY
    this._lastClientY = e.clientY
    this._offsetX = e.clientX - rect.left
    this._offsetY = e.clientY - rect.top

    document.addEventListener('pointermove', this._boundMove)
    document.addEventListener('pointerup', this._boundUp)
    document.addEventListener('keydown', this._boundKeyDown)
    e.preventDefault()
  }

  private _onPointerMove(e: PointerEvent) {
    if (!this._dragging) return

    if (!this._started) {
      const dx = e.clientX - this._startX
      const dy = e.clientY - this._startY
      if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return
      this._initDrag()
      this._updateTarget(e.clientX, e.clientY)
      return
    }

    this._sourceEl!.style.transform = `translate(${e.clientX - this._offsetX}px, ${e.clientY - this._offsetY}px)`
    this._updateTarget(e.clientX, e.clientY)
    this._lastClientY = e.clientY
  }

  private _initDrag() {
    this._started = true
    const el = this._sourceEl!
    const rect = this._sourceRect!

    document.querySelectorAll(DROPPABLE_SEL).forEach((dropEl) => {
      const id = (dropEl as HTMLElement).dataset.droppableId!
      if (!this.droppables.has(id)) {
        this.droppables.set(id, dropEl as HTMLElement)
      }
    })

    const elMargin = getComputedStyle(el).marginBottom
    this._savedCssText = el.style.cssText

    const placeholder = document.createElement('div')
    placeholder.className = 'gea-dnd-placeholder'
    placeholder.style.height = rect.height + 'px'
    placeholder.style.marginBottom = elMargin
    placeholder.style.transition = 'none'
    el.parentElement!.insertBefore(placeholder, el)

    document.body.appendChild(el)
    Object.assign(el.style, {
      position: 'fixed',
      top: '0px',
      left: '0',
      width: rect.width + 'px',
      height: rect.height + 'px',
      transform: `translate(${rect.left}px, ${rect.top}px)`,
      // rotate: '0deg',
      // transition: 'rotate 0.15s ease, box-shadow 0.15s ease',
      pointerEvents: 'none',
      zIndex: '99999',
      margin: '0',
      willChange: 'transform',
      boxShadow: 'none',
    })
    el.offsetHeight
    // el.style.rotate = '3deg'
    el.style.boxShadow = '5px 10px 30px 0px rgba(9, 30, 66, 0.15)'

    this._placeholder = placeholder

    this._currentDroppableId = this._sourceDroppableId
    this._currentIndex = this._sourceIndex
  }

  private _updateTarget(clientX: number, clientY: number) {
    let foundId: string | null = null
    let foundEl: HTMLElement | null = null

    for (const [id, el] of this.droppables) {
      const r = el.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        foundId = id
        foundEl = el
        break
      }
    }

    if (!foundEl || foundId === null) {
      this._currentDroppableId = null
      return
    }

    const items = Array.from(foundEl.querySelectorAll(`:scope > ${DRAGGABLE_SEL}`))
    const movingDown = clientY >= this._lastClientY
    const threshold = movingDown ? 0 : 1
    let insertIndex = items.length
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (clientY < r.top + r.height * threshold) {
        insertIndex = i
        break
      }
    }

    this._currentDroppableId = foundId
    this._currentIndex = insertIndex

    if (!this._placeholder) return

    const refNode = (items[insertIndex] as HTMLElement) || null
    if (this._placeholder.parentElement !== foundEl || this._placeholder.nextElementSibling !== refNode) {
      if (this._placeholder.parentElement) {
        const ghost = document.createElement('div')
        ghost.style.height = this._sourceHeight + 'px'
        ghost.style.marginBottom = this._placeholder.style.marginBottom
        ghost.style.transition = 'height 0.2s cubic-bezier(0.2, 0, 0, 1)'
        ghost.style.overflow = 'hidden'
        this._placeholder.parentElement.insertBefore(ghost, this._placeholder)
        ghost.offsetHeight
        ghost.style.height = '0px'
        ghost.style.marginBottom = '0px'
        ghost.addEventListener('transitionend', () => ghost.remove(), { once: true })
        setTimeout(() => ghost.remove(), 250)
      }

      this._placeholder.style.transition = 'none'
      this._placeholder.style.height = '0px'
      foundEl.insertBefore(this._placeholder, refNode)
      this._placeholder.offsetHeight
      this._placeholder.style.transition = 'height 0.2s cubic-bezier(0.2, 0, 0, 1)'
      this._placeholder.style.height = this._sourceHeight + 'px'
    }
  }

  private _onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && this._dragging) {
      this._cancelDrag()
    }
  }

  private _cancelDrag() {
    this._removeGlobalListeners()
    if (!this._started) {
      this._dragging = false
      return
    }

    this._animateReturn().then(() => {
      this._returnToSource()
      this._cleanup()
    })
  }

  private _onPointerUp(_e: PointerEvent) {
    this._removeGlobalListeners()

    if (!this._started) {
      this._dragging = false
      return
    }

    const destination =
      this._currentDroppableId !== null ? { droppableId: this._currentDroppableId, index: this._currentIndex } : null

    const samePosition =
      destination && destination.droppableId === this._sourceDroppableId && destination.index === this._sourceIndex

    if (destination && this._placeholder && !samePosition) {
      const result: DragResult = {
        draggableId: this._draggedId,
        source: { droppableId: this._sourceDroppableId, index: this._sourceIndex },
        destination,
      }
      this._animateDrop().then(() => {
        this._restoreElStyles()
        // Stash the component for cross-list transfer so the destination's
        // reconciliation can adopt it (DOM subtree intact) instead of
        // disposing + recreating it from scratch.
        const draggedComp = this._getComponentFromElement(this._sourceEl)
        if (draggedComp) {
          stashComponentForTransfer(draggedComp)
        }
        if (this._placeholder?.parentElement) {
          this._placeholder.remove()
        }
        this._placeholder = null
        if (this._sourceEl?.parentElement === document.body) {
          this._sourceEl.remove()
        }
        this._onDragEnd?.(result)
        this._cleanup()
      })
    } else {
      this._animateReturn().then(() => {
        this._returnToSource()
        this._cleanup()
      })
    }
  }

  private _getComponentFromElement(el: HTMLElement | null): any {
    let current: HTMLElement | null = el
    while (current) {
      const comp = (current as any)[GEA_DOM_COMPONENT]
      if (comp) return comp
      current = current.parentElement
    }
    return null
  }

  private _restoreElStyles() {
    if (!this._sourceEl) return
    this._sourceEl.style.cssText = this._savedCssText
  }

  private _returnToSource() {
    if (!this._sourceEl) return
    this._restoreElStyles()
    if (this._placeholder?.parentElement) {
      this._placeholder.parentElement.insertBefore(this._sourceEl, this._placeholder)
    } else {
      const container = this.droppables.get(this._sourceDroppableId)
      if (container) {
        const items = Array.from(container.querySelectorAll(`:scope > ${DRAGGABLE_SEL}`))
        container.insertBefore(this._sourceEl, items[this._sourceIndex] || null)
      }
    }
  }

  private _performTransfer(destination: { droppableId: string; index: number }) {
    const sourceEl = this._sourceEl
    if (!sourceEl) return

    const destContainer = this.droppables.get(destination.droppableId)
    if (!destContainer) return

    const destItems = Array.from(destContainer.querySelectorAll(`:scope > ${DRAGGABLE_SEL}`))
    const refNode = (destItems[destination.index] as HTMLElement) || null
    destContainer.insertBefore(sourceEl, refNode)

    const draggedComp = this._getComponentFromElement(sourceEl)
    if (!draggedComp) return

    const rawDragged = _rawComp(draggedComp)
    const sourceParent = rawDragged[GEA_PARENT_COMPONENT]
    if (!sourceParent) return

    const srcArr = this._findCompiledArray(sourceParent, draggedComp)
    if (!srcArr) return

    const destParent = this._getComponentFromElement(destContainer)
    if (!destParent) return

    srcArr.arr.splice(srcArr.index, 1)
    const destArr = destParent[srcArr.key]
    if (Array.isArray(destArr)) {
      destArr.splice(destination.index, 0, draggedComp)
    }

    // Update the parent component pointer on the raw instance (symbol-keyed, not string prop).
    rawDragged[GEA_PARENT_COMPONENT] = destParent
  }

  private _findCompiledArray(parent: any, child: any): { key: symbol; arr: any[]; index: number } | null {
    // Component array lists are stored under geaListItemsSymbol(arrayPropName) symbol keys.
    // Walk the symbol keys of the parent to find which list contains the child.
    for (const sym of Object.getOwnPropertySymbols(parent)) {
      const desc = sym.description ?? ''
      if (!desc.startsWith('gea.listItems.')) continue
      const arr = parent[sym]
      if (!Array.isArray(arr)) continue
      const idx = arr.indexOf(child)
      if (idx !== -1) return { key: sym, arr, index: idx }
    }
    return null
  }

  private _animateDrop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._sourceEl || !this._placeholder) return resolve()
      const phRect = this._placeholder.getBoundingClientRect()
      this._sourceEl.style.transition =
        'transform 0.2s cubic-bezier(0.2, 0, 0, 1), rotate 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1)'
      this._sourceEl.style.transform = `translate(${phRect.left}px, ${phRect.top}px)`
      this._sourceEl.style.rotate = '0deg'
      this._sourceEl.style.boxShadow = 'none'
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      this._sourceEl.addEventListener('transitionend', finish, { once: true })
      setTimeout(finish, 250)
    })
  }

  private _animateReturn(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._sourceEl || !this._sourceRect) return resolve()
      let targetX = this._sourceRect.left
      let targetY = this._sourceRect.top
      if (this._placeholder?.parentElement) {
        const phRect = this._placeholder.getBoundingClientRect()
        targetX = phRect.left
        targetY = phRect.top
      }
      this._sourceEl.style.transition =
        'transform 0.2s cubic-bezier(0.2, 0, 0, 1), rotate 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s cubic-bezier(0.2, 0, 0, 1)'
      this._sourceEl.style.transform = `translate(${targetX}px, ${targetY}px)`
      this._sourceEl.style.rotate = '0deg'
      this._sourceEl.style.boxShadow = 'none'
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      this._sourceEl.addEventListener('transitionend', finish, { once: true })
      setTimeout(finish, 250)
    })
  }

  private _removeGlobalListeners() {
    document.removeEventListener('pointermove', this._boundMove)
    document.removeEventListener('pointerup', this._boundUp)
    document.removeEventListener('keydown', this._boundKeyDown)
  }

  private _cleanup() {
    if (this._cleanedUp) return
    this._cleanedUp = true

    this._placeholder?.remove()
    this._placeholder = null
    this._sourceEl = null
    this._sourceRect = null

    this._dragging = false
    this._started = false
    this._draggedId = ''
    this._currentDroppableId = null
  }

  destroy() {
    this._removeGlobalListeners()
    if (this._dragging) {
      if (this._sourceEl) this._returnToSource()
      this._cleanup()
    }
    if (this._docListenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this._boundDocDown, true)
      this._docListenerAttached = false
    }
    this.droppables.clear()
    this.onDragEnd = null
  }
}

export const dndManager = new DndManager()
