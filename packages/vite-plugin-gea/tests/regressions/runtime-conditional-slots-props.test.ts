import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { GEA_SET_PROPS } from '../../../gea/src/compiler-runtime'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('conditional slot with local-state destructured guard renders without ReferenceError', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-local-destr`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const EditableItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class EditableItem extends Component {
          editing = false
          editText = ''

          startEditing() {
            this.editing = true
            this.editText = this.props.label
          }

          handleInput(e) {
            this.editText = e.target.value
          }

          template({ label }) {
            const { editing, editText } = this
            return (
              <li class={\`item \${editing ? 'editing' : ''}\`}>
                <span class="label">{label}</span>
                {editing && <input class="edit-input" type="text" value={editText} input={this.handleInput} />}
              </li>
            )
          }
        }
      `,
      '/virtual/EditableItemCond.jsx',
      'EditableItem',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)
    const item = new EditableItem()
    item[GEA_SET_PROPS]({ label: () => 'Buy groceries' })
    item.render(root)
    await flushMicrotasks()

    assert.ok(item.el, 'item rendered without constructor ReferenceError')
    assert.ok(!item.el.querySelector('.edit-input'), 'edit input absent when not editing')

    item.startEditing()
    await flushMicrotasks()

    assert.ok(item.el.className.includes('editing'), 'editing class added')
    const editInput = item.el.querySelector('.edit-input') as HTMLInputElement
    assert.ok(editInput, 'edit input appears after startEditing')
    assert.equal(editInput.value, 'Buy groceries', 'edit input value must reflect the label set in startEditing')

    item.editText = 'Buy milk'
    await flushMicrotasks()

    const updatedInput = item.el.querySelector('.edit-input') as HTMLInputElement
    assert.ok(updatedInput, 'edit input still present after editText change')
    assert.equal(
      updatedInput.value,
      'Buy milk',
      'edit input value must update when editText changes while slot is visible',
    )

    item.dispose()
  } finally {
    restoreDom()
  }
})

test('conditional slot index mismatch: local-var conditional must not be toggled by this.xxx conditional', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-index`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    class ItemStore extends Store {
      item = { description: 'A real description' }
    }

    const itemStore = new ItemStore()

    const Panel = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Panel extends Component {
          openDropdown = null

          template() {
            const item = itemStore.item
            const desc = item.description || ''

            return (
              <div class="panel">
                <div class="left">
                  {desc && <div class="desc">{desc}</div>}
                  {!desc && <p class="no-desc">No description</p>}
                </div>
                <div class="right">
                  {this.openDropdown && <div class="overlay">overlay</div>}
                  {this.openDropdown === 'status' && <div class="dropdown">dropdown</div>}
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/Panel.jsx',
      'Panel',
      { Component, itemStore },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const comp = new Panel()
    comp.render(root)
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.desc'), 'description must be visible initially')
    assert.ok(!comp.el.querySelector('.no-desc'), 'placeholder must be hidden initially')
    assert.ok(!comp.el.querySelector('.overlay'), 'overlay must be hidden initially')
    assert.ok(!comp.el.querySelector('.dropdown'), 'dropdown must be hidden initially')

    comp.openDropdown = 'status'
    await flushMicrotasks()

    assert.ok(comp.el.querySelector('.overlay'), 'overlay must appear when dropdown opens')
    assert.ok(comp.el.querySelector('.dropdown'), 'dropdown must appear when dropdown opens')
    assert.ok(
      comp.el.querySelector('.desc'),
      'description must STILL be visible after opening dropdown (slot index mismatch bug)',
    )

    comp.openDropdown = null
    await flushMicrotasks()

    assert.ok(!comp.el.querySelector('.overlay'), 'overlay must disappear when dropdown closes')
    assert.ok(!comp.el.querySelector('.dropdown'), 'dropdown must disappear when dropdown closes')
    assert.ok(comp.el.querySelector('.desc'), 'description must STILL be visible after closing dropdown (toggle bug)')

    comp.dispose()
  } finally {
    restoreDom()
  }
})

test('conditional slot updates attributes from non-condition props', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-cond-slot-attr`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const propsStore = new Store({
      src: 'baby-yoda.jpg',
      name: 'Baby Yoda',
      title: 'Character',
    }) as {
      src: string
      name: string
      title: string
    }

    const ImgCard = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ImgCard extends Component {
          template({ src, name, title }: any) {
            return (
              <div class="card">
                <p class="title">{title}</p>
                {src ? <img src={src} alt={name || ''} class="avatar" /> : ''}
              </div>
            )
          }
        }
      `,
      '/virtual/ImgCard.tsx',
      'ImgCard',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const card = new ImgCard()
    card[GEA_SET_PROPS]({
      src: () => propsStore.src,
      name: () => propsStore.name,
      title: () => propsStore.title,
    })
    card.render(root)
    await flushMicrotasks()

    const imgBefore = card.el.querySelector('img')
    assert.ok(imgBefore, 'img element must exist')
    assert.equal(imgBefore.getAttribute('src'), 'baby-yoda.jpg')
    assert.equal(imgBefore.getAttribute('alt'), 'Baby Yoda')

    propsStore.src = 'gaben.jpg'
    propsStore.name = 'Lord Gaben'
    await flushMicrotasks()

    const imgAfter = card.el.querySelector('img')
    assert.ok(imgAfter, 'img element must still exist after prop update')
    assert.equal(imgAfter.getAttribute('src'), 'gaben.jpg', 'src must update')
    assert.equal(imgAfter.getAttribute('alt'), 'Lord Gaben', 'alt must update when name prop changes')

    card.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
