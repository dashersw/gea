export interface DragResult {
  draggableId: string
  source: { droppableId: string; index: number }
  destination: { droppableId: string; index: number } | null
}

const DRAG_THRESHOLD_SQ = 25

class DndManager {
  droppables = new Map<string, HTMLElement>()
  onDragEnd: ((result: DragResult) => void) | null = null

  private _dragging = false
  private _started = false
  private _draggedId = ''
  private _sourceDroppableId = ''
  private _sourceIndex = 0
  private _sourceEl: HTMLElement | null = null
  private _sourceHeight = 0
  private _clone: HTMLElement | null = null
  private _placeholder: HTMLElement | null = null
  private _startX = 0
  private _startY = 0
  private _offsetX = 0
  private _offsetY = 0
  private _currentDroppableId: string | null = null
  private _currentIndex = 0
  private _cleanedUp = false

  private _boundMove = this._onPointerMove.bind(this)
  private _boundUp = this._onPointerUp.bind(this)
  private _boundKeyDown = this._onKeyDown.bind(this)

  get isDragging() {
    return this._started
  }

  registerDroppable(id: string, el: HTMLElement) {
    this.droppables.set(id, el)
  }

  unregisterDroppable(id: string) {
    this.droppables.delete(id)
  }

  startTracking(e: PointerEvent, draggableId: string, el: HTMLElement) {
    if (this._dragging || e.button !== 0) return

    const droppableEl = el.closest('[data-droppable-id]') as HTMLElement
    if (!droppableEl) return

    const droppableId = droppableEl.dataset.droppableId!
    const siblings = Array.from(droppableEl.querySelectorAll(':scope > .gea-draggable'))
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
    this._startX = e.clientX
    this._startY = e.clientY
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
    }

    this._moveClone(e.clientX, e.clientY)
    this._updateTarget(e.clientX, e.clientY)
  }

  private _initDrag() {
    this._started = true
    const el = this._sourceEl!
    const rect = el.getBoundingClientRect()

    const clone = el.cloneNode(true) as HTMLElement
    clone.classList.remove('gea-draggable')
    clone.removeAttribute('data-draggable-id')
    clone.removeAttribute('data-index')
    clone.className = 'gea-dnd-clone'
    Object.assign(clone.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: rect.width + 'px',
      transform: `translate(${rect.left}px, ${rect.top}px) rotate(3deg)`,
      pointerEvents: 'none',
      zIndex: '99999',
      margin: '0',
      willChange: 'transform',
    })

    const child = clone.firstElementChild as HTMLElement
    if (child) {
      child.style.boxShadow = '5px 10px 30px 0px rgba(9, 30, 66, 0.15)'
    }

    document.body.appendChild(clone)
    this._clone = clone

    const placeholder = document.createElement('div')
    placeholder.className = 'gea-dnd-placeholder'
    placeholder.style.height = '0px'
    const childEl = el.firstElementChild as HTMLElement
    if (childEl) {
      placeholder.style.marginBottom = getComputedStyle(childEl).marginBottom
    }
    el.parentElement!.insertBefore(placeholder, el)
    placeholder.offsetHeight
    placeholder.style.height = rect.height + 'px'
    this._placeholder = placeholder

    el.classList.add('gea-dragging')

    this._currentDroppableId = this._sourceDroppableId
    this._currentIndex = this._sourceIndex
  }

  private _moveClone(x: number, y: number) {
    if (!this._clone) return
    this._clone.style.transform = `translate(${x - this._offsetX}px, ${y - this._offsetY}px) rotate(3deg)`
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
      if (this._placeholder?.parentElement) {
        this._placeholder.remove()
      }
      this._currentDroppableId = null
      return
    }

    const items = Array.from(foundEl.querySelectorAll(':scope > .gea-draggable:not(.gea-dragging)'))
    let insertIndex = items.length
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) {
        insertIndex = i
        break
      }
    }

    this._currentDroppableId = foundId
    this._currentIndex = insertIndex

    if (!this._placeholder) return

    const refNode = (items[insertIndex] as HTMLElement) || null
    if (this._placeholder.parentElement !== foundEl || this._placeholder.nextElementSibling !== refNode) {
      if (!this._placeholder.parentElement) {
        this._placeholder.style.height = '0px'
        foundEl.insertBefore(this._placeholder, refNode)
        this._placeholder.offsetHeight
        this._placeholder.style.height = this._sourceHeight + 'px'
      } else {
        foundEl.insertBefore(this._placeholder, refNode)
      }
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

    const result: DragResult = {
      draggableId: this._draggedId,
      source: { droppableId: this._sourceDroppableId, index: this._sourceIndex },
      destination: null,
    }

    this._animateReturn().then(() => {
      this._cleanup()
      this.onDragEnd?.(result)
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

    const result: DragResult = {
      draggableId: this._draggedId,
      source: { droppableId: this._sourceDroppableId, index: this._sourceIndex },
      destination,
    }

    if (destination && this._placeholder && this._clone) {
      this._animateDrop().then(() => {
        this._cleanup()
        this.onDragEnd?.(result)
      })
    } else {
      this._animateReturn().then(() => {
        this._cleanup()
        this.onDragEnd?.(result)
      })
    }
  }

  private _animateDrop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._clone || !this._placeholder) return resolve()
      const phRect = this._placeholder.getBoundingClientRect()
      this._clone.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
      this._clone.style.transform = `translate(${phRect.left}px, ${phRect.top}px) rotate(0deg)`
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      this._clone.addEventListener('transitionend', finish, { once: true })
      setTimeout(finish, 250)
    })
  }

  private _animateReturn(): Promise<void> {
    return new Promise((resolve) => {
      if (!this._clone || !this._sourceEl) return resolve()
      const srcRect = this._sourceEl.getBoundingClientRect()
      let targetX = srcRect.left
      let targetY = srcRect.top
      if (srcRect.width === 0 && srcRect.height === 0) {
        targetX = this._startX - this._offsetX
        targetY = this._startY - this._offsetY
      }
      this._clone.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
      this._clone.style.transform = `translate(${targetX}px, ${targetY}px) rotate(0deg)`
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      this._clone.addEventListener('transitionend', finish, { once: true })
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

    this._clone?.remove()
    this._clone = null

    this._placeholder?.remove()
    this._placeholder = null

    if (this._sourceEl) {
      this._sourceEl.classList.remove('gea-dragging')
      this._sourceEl = null
    }

    this._dragging = false
    this._started = false
    this._draggedId = ''
    this._currentDroppableId = null
  }

  destroy() {
    this._removeGlobalListeners()
    if (this._dragging) {
      this._cleanup()
    }
    this.droppables.clear()
    this.onDragEnd = null
  }
}

export const dndManager = new DndManager()
