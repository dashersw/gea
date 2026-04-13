import assert from 'node:assert/strict'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadRuntimeModules } from '../helpers/compile'

test('mapped list items with inputs sync .value on in-place data update', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-map-value-sync`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      items: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
    })

    const ListForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class ListForm extends Component {
          template() {
            return (
              <div class="list-form">
                {store.items.map((item) => (
                  <div class="item" key={item.id}>
                    <input type="text" class="item-name" value={item.name} />
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ListForm.jsx',
      'ListForm',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ListForm()
    component.render(root)
    await flushMicrotasks()

    const inputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(inputs.length, 2, 'should have 2 inputs')
    assert.equal(inputs[0].value, 'Alice', 'first input should show Alice')
    assert.equal(inputs[1].value, 'Bob', 'second input should show Bob')

    store.items[0].name = 'Charlie'
    store.items[1].name = 'Diana'
    await flushMicrotasks()

    const updatedInputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(updatedInputs[0].value, 'Charlie', 'first input .value must update after in-place data change')
    assert.equal(updatedInputs[1].value, 'Diana', 'second input .value must update after in-place data change')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('mapped list full replacement syncs input .value for new items', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-map-replace-value`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)
    const store = new Store({
      items: [{ id: '1', name: 'Alice' }],
    })

    const ListForm = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'

        export default class ListForm extends Component {
          template() {
            return (
              <div class="list-form">
                {store.items.map((item) => (
                  <div class="item" key={item.id}>
                    <input type="text" class="item-name" value={item.name} />
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ListForm.jsx',
      'ListForm',
      { Component, store },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const component = new ListForm()
    component.render(root)
    await flushMicrotasks()

    const inputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(inputs.length, 1, 'should have 1 input')
    assert.equal(inputs[0].value, 'Alice', 'first input should show Alice')

    store.items = [
      { id: '10', name: 'Xavier' },
      { id: '20', name: 'Yolanda' },
      { id: '30', name: 'Zach' },
    ]
    await flushMicrotasks()

    const newInputs = component.el.querySelectorAll('.item-name') as NodeListOf<HTMLInputElement>
    assert.equal(newInputs.length, 3, 'should now have 3 inputs')
    assert.equal(newInputs[0].value, 'Xavier', 'first input .value must match after full list replace')
    assert.equal(newInputs[1].value, 'Yolanda', 'second input .value must match after full list replace')
    assert.equal(newInputs[2].value, 'Zach', 'third input .value must match after full list replace')

    component.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
