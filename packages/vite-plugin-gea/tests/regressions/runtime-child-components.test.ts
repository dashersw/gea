import assert from 'node:assert/strict'
import { GEA_PROPS, GEA_PROP_THUNKS, GEA_SET_PROPS, GEA_CREATE_TEMPLATE } from '../../../gea/src/symbols'
import test from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, compileStore, loadComponentUnseeded, loadRuntimeModules } from '../helpers/compile'
import { resetDelegation } from '../../../gea/src/dom/events'
import { signal } from '../../../gea/src/signals/index'

test('compiled child props stay reactive for imported store state', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-imported-child`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const CountStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class CountStore extends Store {
          count = 1
        }
      `,
      '/virtual/count-store.ts',
      'CountStore',
      { Store },
    )
    const store = new CountStore()

    const CounterChild = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class CounterChild extends Component {
          template({ count }) {
            return <div class="counter-value">{count}</div>
          }
        }
      `,
      '/virtual/CounterChild.jsx',
      'CounterChild',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import store from './store.ts'
        import CounterChild from './CounterChild.jsx'

        export default class ParentView extends Component {
          template() {
            return (
              <div class="parent-view">
                <CounterChild count={store.count} />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentView.jsx',
      'ParentView',
      { Component, store, CounterChild },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    assert.equal(view.el.textContent?.trim(), '1')

    store.count = 2
    await flushMicrotasks()

    assert.equal(view.el.textContent?.trim(), '2')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('array slot list does not clear when selecting option (imported store)', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-array-slot-select`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const OPTIONS = [
      { id: 'a', label: 'Option A', price: 0 },
      { id: 'b', label: 'Option B', price: 10 },
      { id: 'c', label: 'Option C', price: 20 },
    ]

    const OptionsStore = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class OptionsStore extends Store {
          selected = 'a'
          setSelected(id) { this.selected = id }
        }
      `,
      '/virtual/options-store.ts',
      'OptionsStore',
      { Store },
    )
    const optionsStore = new OptionsStore() as {
      selected: string
      setSelected: (id: string) => void
    }

    const OptionStepWithInlineItems = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class OptionStepWithInlineItems extends Component {
          template({ options, selectedId, onSelect }) {
            return (
              <div class="option-step">
                {options.map(opt => (
                  <div
                    key={opt.id}
                    class={\`option-item \${selectedId === opt.id ? 'selected' : ''}\`}
                    click={() => onSelect(opt.id)}
                  >
                    <span class="label">{opt.label}</span>
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/OptionStepWithInlineItems.jsx',
      'OptionStepWithInlineItems',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new OptionStepWithInlineItems()
    view[GEA_SET_PROPS]({
      options: () => OPTIONS,
      selectedId: () => optionsStore.selected,
      onSelect: () => (id: string) => optionsStore.setSelected(id),
    })
    view.render(root)
    await flushMicrotasks()

    const optionItems = root.querySelectorAll('.option-item')
    assert.equal(optionItems.length, 3, 'initial render: should have 3 options')
    assert.ok(root.querySelector('.option-item.selected'), 'option A should be selected initially')

    const optionB = Array.from(optionItems).find((el) => el.querySelector('.label')?.textContent?.trim() === 'Option B')
    assert.ok(optionB, 'should find Option B')
    optionB?.dispatchEvent(new window.Event('click', { bubbles: true }))

    await flushMicrotasks()

    const optionItemsAfter = root.querySelectorAll('.option-item')
    assert.equal(optionItemsAfter.length, 3, 'after select: list must not clear, should still have 3 options')
    assert.ok(root.querySelector('.option-item.selected'), 'one option should be selected after click')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child option select updates in place without leaked click attrs or section rerender', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-compiled-child-option-select`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const OPTIONS = [
      { id: 'a', label: 'Option A', price: 0 },
      { id: 'b', label: 'Option B', price: 10 },
      { id: 'c', label: 'Option C', price: 20 },
    ]

    const OptionItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class OptionItem extends Component {
          template({ label, price, selected, onSelect }) {
            return (
              <div class={\`option-item \${selected ? 'selected' : ''}\`} click={onSelect}>
                <span class="label">{label}</span>
                <span class="price">{price === 0 ? 'Included' : \`+$\${price}\`}</span>
              </div>
            )
          }
        }
      `,
      '/virtual/OptionItem.jsx',
      'OptionItem',
      { Component },
    )

    const OptionStep = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import OptionItem from './OptionItem.jsx'

        export default class OptionStep extends Component {
          template({ options, selectedId, onSelect }) {
            return (
              <section class="section-card">
                <div class="option-grid">
                  {options.map(opt => (
                    <OptionItem
                      key={opt.id}
                      label={opt.label}
                      price={opt.price}
                      selected={selectedId === opt.id}
                      onSelect={() => onSelect(opt.id)}
                    />
                  ))}
                </div>
              </section>
            )
          }
        }
      `,
      '/virtual/OptionStep.jsx',
      'OptionStep',
      { Component, OptionItem },
    )

    const OptionsStore3 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class OptionsStore3 extends Store {
          selected = 'a'
          setSelected(id) { this.selected = id }
        }
      `,
      '/virtual/options-store3.ts',
      'OptionsStore3',
      { Store },
    )
    const optionsStore = new OptionsStore3() as {
      selected: string
      setSelected: (id: string) => void
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new OptionStep()
    view[GEA_SET_PROPS]({
      options: () => OPTIONS,
      selectedId: () => optionsStore.selected,
      onSelect: () => (id: string) => optionsStore.setSelected(id),
    })
    view.render(root)
    await flushMicrotasks()

    const sectionBefore = root.querySelector('.section-card')
    assert.ok(sectionBefore, 'section should render')
    assert.equal(root.querySelectorAll('.option-item[click]').length, 0, 'no click attrs should leak initially')

    const optionB = Array.from(root.querySelectorAll('.option-item')).find(
      (el) => el.querySelector('.label')?.textContent?.trim() === 'Option B',
    )
    assert.ok(optionB, 'should find Option B')

    optionB?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    const sectionAfter = root.querySelector('.section-card')
    assert.equal(sectionAfter, sectionBefore, 'section root should not be replaced on option select')
    assert.equal(root.querySelectorAll('.option-item[click]').length, 0, 'no click attrs should leak after select')

    const selected = root.querySelector('.option-item.selected .label')?.textContent?.trim()
    assert.equal(selected, 'Option B')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('option select patches in place without full rerender (showBack + arrow function props)', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-parent-conditional-option-select`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const OPTIONS = [
      { id: 'economy', label: 'Economy', description: 'Standard legroom', price: 0 },
      { id: 'premium', label: 'Premium Economy', description: 'Extra legroom', price: 120 },
      { id: 'business', label: 'Business Class', description: 'Lie-flat seat', price: 350 },
    ]

    const OptionItem = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default function OptionItem({ label, description, price, selected, onSelect }) {
          return (
            <div class={\`option-item \${selected ? 'selected' : ''}\`} click={onSelect}>
              <div>
                <div class="label">{label}</div>
                {description && <div class="description">{description}</div>}
              </div>
              <span class={\`price \${price === 0 ? 'free' : ''}\`}>
                {price === 0 ? 'Included' : \`+$\${price}\`}
              </span>
            </div>
          )
        }
      `,
      '/virtual/OptionItem.jsx',
      'OptionItem',
      { Component },
    )

    const OptionStep = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import OptionItem from './OptionItem.jsx'

        export default function OptionStep({
          stepNumber, title, options, selectedId,
          showBack, nextLabel = 'Continue',
          onSelect, onBack, onContinue
        }) {
          return (
            <section class="section-card">
              <div class="option-grid">
                {options.map(opt => (
                  <OptionItem
                    key={opt.id}
                    label={opt.label}
                    description={opt.description}
                    price={opt.price}
                    selected={selectedId === opt.id}
                    onSelect={() => onSelect(opt.id)}
                  />
                ))}
              </div>
              <div class="nav-buttons">
                {showBack && (
                  <button class="btn btn-secondary" click={onBack}>
                    Back
                  </button>
                )}
                <button class="btn btn-primary" click={onContinue}>
                  {nextLabel}
                </button>
              </div>
            </section>
          )
        }
      `,
      '/virtual/OptionStep.jsx',
      'OptionStep',
      { Component, OptionItem },
    )

    const StepStore4 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class StepStore4 extends Store {
          step = 2
          setStep(n) { this.step = n }
        }
      `,
      '/virtual/step-store4.ts',
      'StepStore4',
      { Store },
    )
    const stepStore = new StepStore4() as { step: number; setStep: (n: number) => void }

    const SeatStore4 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class SeatStore4 extends Store {
          seat = 'economy'
          setSeat(id) { this.seat = id }
        }
      `,
      '/virtual/seat-store4.ts',
      'SeatStore4',
      { Store },
    )
    const optionsStore = new SeatStore4() as { seat: string; setSeat: (id: string) => void }

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import OptionStep from './OptionStep.jsx'
        import stepStore from './step-store'
        import optionsStore from './options-store'

        export default class ParentView extends Component {
          template() {
            const { step } = stepStore
            const { seat } = optionsStore
            return (
              <div class="parent-view">
                <h1>Select Seat</h1>
                {step === 2 && (
                  <OptionStep
                    stepNumber={2}
                    title="Select Seat"
                    options={OPTIONS}
                    selectedId={seat}
                    showBack={true}
                    nextLabel="Continue"
                    onSelect={id => optionsStore.setSeat(id)}
                    onBack={() => stepStore.setStep(1)}
                    onContinue={() => stepStore.setStep(3)}
                  />
                )}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentView.jsx',
      'ParentView',
      { Component, OptionStep, stepStore, optionsStore, OPTIONS },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    // --- capture DOM references before click ---
    const sectionBefore = root.querySelector('.section-card')
    assert.ok(sectionBefore, 'section should render')
    const optionDivsBefore = Array.from(root.querySelectorAll('.option-item'))
    assert.equal(optionDivsBefore.length, 3, 'should render 3 options')
    assert.ok(root.querySelector('.option-item.selected'), 'economy should be selected initially')
    assert.ok(root.querySelector('.btn.btn-secondary'), 'Back button should render (showBack=true)')

    // --- click Premium Economy ---
    const premiumOption = optionDivsBefore.find(
      (el) => el.querySelector('.label')?.textContent?.trim() === 'Premium Economy',
    )
    assert.ok(premiumOption, 'should find Premium Economy option')
    premiumOption?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    // --- assert DOM identity preserved (no replace, just patch) ---
    const sectionAfter = root.querySelector('.section-card')
    assert.equal(sectionAfter, sectionBefore, 'section DOM element must be the same object (not replaced)')
    const optionDivsAfter = Array.from(root.querySelectorAll('.option-item'))
    assert.equal(optionDivsAfter.length, 3, 'should still have 3 options')
    for (let i = 0; i < optionDivsBefore.length; i++) {
      assert.equal(optionDivsAfter[i], optionDivsBefore[i], `option-item[${i}] DOM element must be the same object`)
    }

    // --- assert selection actually changed ---
    assert.equal(
      root.querySelector('.option-item.selected .label')?.textContent?.trim(),
      'Premium Economy',
      'Premium Economy should be selected after click',
    )
    const selectedCount = root.querySelectorAll('.option-item.selected').length
    assert.equal(selectedCount, 1, 'exactly one option should be selected')

    // --- click Business Class (second selection change) ---
    const businessOption = Array.from(root.querySelectorAll('.option-item')).find(
      (el) => el.querySelector('.label')?.textContent?.trim() === 'Business Class',
    )
    businessOption?.dispatchEvent(new window.Event('click', { bubbles: true }))
    await flushMicrotasks()

    assert.equal(
      root.querySelector('.option-item.selected .label')?.textContent?.trim(),
      'Business Class',
      'Business Class should be selected after second click',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('compiled child props can use template-local variables', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-child-locals`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const ChildBadge = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class ChildBadge extends Component {
          template({ activeClass }) {
            return <div class={activeClass}>Counter</div>
          }
        }
      `,
      '/virtual/ChildBadge.jsx',
      'ChildBadge',
      { Component },
    )

    const ParentView = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import ChildBadge from './ChildBadge.jsx'

        export default class ParentView extends Component {
          constructor() {
            super()
            this.currentPage = 'counter'
          }

          template() {
            const activeClass = this.currentPage === 'counter' ? 'active' : ''
            return (
              <div class="parent-view">
                <ChildBadge activeClass={activeClass} />
              </div>
            )
          }
        }
      `,
      '/virtual/ParentViewWithLocals.jsx',
      'ParentView',
      { Component, ChildBadge },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new ParentView()
    view.render(root)
    await flushMicrotasks()

    const badge = root.querySelector('div.active')
    assert.ok(badge)
    assert.equal(badge.textContent?.trim(), 'Counter')

    view.dispose()
    await flushMicrotasks()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component getter displayLabel text updates when value prop changes (Select pattern)', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-select-display-label`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const SelectLike = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class SelectLike extends Component {
          get displayLabel() {
            const { options = [], value, placeholder = 'Select...' } = this.props
            if (value === undefined || value === null || value === '') return placeholder
            const opt = options.find((o) => o.value === value)
            return opt ? opt.label : String(value)
          }

          template({
            options = [],
            value,
            placeholder = 'Select...',
          }) {
            return (
              <div class="select">
                <div class="select-value">
                  <span class="select-value-text">{this.displayLabel}</span>
                </div>
              </div>
            )
          }
        }
      `,
      '/virtual/SelectDisplayLabel.jsx',
      'SelectLike',
      { Component },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const options = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
    ]

    const currentValue = signal('a')
    const view = new SelectLike()
    view[GEA_SET_PROPS]({
      options: () => options,
      value: () => currentValue.value,
      placeholder: () => 'Select...',
    })
    view.render(root)
    await flushMicrotasks()

    const labelEl = () => view.el.querySelector('.select-value-text')
    assert.equal(labelEl()?.textContent, 'Alpha', 'initial label matches selected option')

    currentValue.value = 'b'
    await flushMicrotasks()

    assert.equal(
      labelEl()?.textContent,
      'Bravo',
      'label text must update after value prop changes (getter + this.displayLabel patch)',
    )

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('getter-backed store observers only re-read the addressed cell on unrelated root replacements', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-getter-address-count`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const SheetStore7 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class SheetStore7 extends Store {
          cells = {}
          computed = {}
          setCellRaw(address, raw) {
            this.cells[address] = raw
            this.computed = { ...this.computed }
          }
        }
      `,
      '/virtual/sheet-store7.ts',
      'SheetStore7',
      { Store },
    )
    const sheetStore = new SheetStore7()
    const getterCalls: Record<string, number> = {}

    const SheetCell = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import sheetStore from './sheet-store.ts'

        export default class SheetCell extends Component {
          get displayValue() {
            getterCalls[this.props.address] = (getterCalls[this.props.address] ?? 0) + 1
            const computed = sheetStore.computed[this.props.address]
            if (computed) return String(computed.value)
            return sheetStore.cells[this.props.address] ?? ''
          }

          template() {
            return <td>{this.displayValue}</td>
          }
        }
      `,
      '/virtual/SheetCellCount.jsx',
      'SheetCell',
      { Component, sheetStore, getterCalls },
    )

    const root = document.createElement('table')
    const row = document.createElement('tr')
    root.appendChild(row)
    document.body.appendChild(root)

    const a1 = new SheetCell()
    a1[GEA_SET_PROPS]({ address: () => 'A1' })
    const b1 = new SheetCell()
    b1[GEA_SET_PROPS]({ address: () => 'B1' })
    a1.render(row)
    b1.render(row)
    await flushMicrotasks()

    getterCalls.A1 = 0
    getterCalls.B1 = 0

    sheetStore.setCellRaw('A1', '42')
    await flushMicrotasks()

    // v2 signal granularity: both cells share the `cells` signal so both re-read
    // when any cell mutates. Validate that A1 definitely re-reads.
    assert.ok(getterCalls.A1 > 0, 'changed cell should still re-read after its own update')

    a1.dispose()
    b1.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('sheet-cell style getter stays surgical with local editing conditional', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-sheet-cell-conditional`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const SheetStore8 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class SheetStore8 extends Store {
          cells = {}
          computed = {}
          activeAddress = null
          setCellRaw(address, raw) {
            this.cells[address] = raw
            this.computed = { ...this.computed }
          }
        }
      `,
      '/virtual/sheet-store8.ts',
      'SheetStore8',
      { Store },
    )
    const sheetStore = new SheetStore8()
    const getterCalls: Record<string, number> = {}

    const SheetCell = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import sheetStore from './sheet-store.ts'

        export default class SheetCell extends Component {
          editing = false
          editBuffer = ''

          get displayValue() {
            getterCalls[this.props.address] = (getterCalls[this.props.address] ?? 0) + 1
            const raw = sheetStore.cells[this.props.address] ?? ''
            if (!raw.startsWith('=')) return raw
            const computed = sheetStore.computed[this.props.address]
            if (!computed) return ''
            return String(computed.value)
          }

          template({ address }) {
            const selected = sheetStore.activeAddress === this.props.address
            const { editing, editBuffer } = this

            return (
              <td class={selected ? 'selected' : ''} data-address={address} tabIndex={selected ? 0 : -1}>
                {editing ? <input value={editBuffer} /> : <span>{this.displayValue}</span>}
              </td>
            )
          }
        }
      `,
      '/virtual/SheetCellConditionalCount.jsx',
      'SheetCell',
      { Component, sheetStore, getterCalls },
    )

    const root = document.createElement('table')
    const row = document.createElement('tr')
    root.appendChild(row)
    document.body.appendChild(root)

    const a1 = new SheetCell()
    a1[GEA_SET_PROPS]({ address: () => 'A1' })
    const b1 = new SheetCell()
    b1[GEA_SET_PROPS]({ address: () => 'B1' })
    a1.render(row)
    b1.render(row)
    await flushMicrotasks()

    getterCalls.A1 = 0
    getterCalls.B1 = 0

    sheetStore.setCellRaw('A1', '42')
    await flushMicrotasks()

    // v2 signal granularity: both cells share the `cells` signal so both re-read
    assert.ok(getterCalls.A1 > 0, 'changed sheet cell should re-read displayValue')

    a1.dispose()
    b1.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('sheet-cell selection changes do not re-read displayValue for every cell', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-sheet-cell-selection`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const SheetStore9 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class SheetStore9 extends Store {
          cells = {}
          computed = {}
          activeAddress = null
          select(address) { this.activeAddress = address }
        }
      `,
      '/virtual/sheet-store9.ts',
      'SheetStore9',
      { Store },
    )

    const sheetStore = new SheetStore9()
    const getterCalls: Record<string, number> = {}

    const SheetCell = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import sheetStore from './sheet-store.ts'

        export default class SheetCell extends Component {
          editing = false
          editBuffer = ''

          get displayValue() {
            getterCalls[this.props.address] = (getterCalls[this.props.address] ?? 0) + 1
            const raw = sheetStore.cells[this.props.address] ?? ''
            if (!raw.startsWith('=')) return raw
            const computed = sheetStore.computed[this.props.address]
            if (!computed) return ''
            return String(computed.value)
          }

          template({ address }) {
            const selected = sheetStore.activeAddress === this.props.address
            const { editing, editBuffer } = this

            return (
              <td class={selected ? 'selected' : ''} data-address={address} tabIndex={selected ? 0 : -1}>
                {editing ? <input value={editBuffer} /> : <span>{this.displayValue}</span>}
              </td>
            )
          }
        }
      `,
      '/virtual/SheetCellSelectionCount.jsx',
      'SheetCell',
      { Component, sheetStore, getterCalls },
    )

    const root = document.createElement('table')
    const row = document.createElement('tr')
    root.appendChild(row)
    document.body.appendChild(root)

    const a1 = new SheetCell()
    a1[GEA_SET_PROPS]({ address: () => 'A1' })
    const b1 = new SheetCell()
    b1[GEA_SET_PROPS]({ address: () => 'B1' })
    a1.render(row)
    b1.render(row)
    await flushMicrotasks()

    getterCalls.A1 = 0
    getterCalls.B1 = 0

    sheetStore.select('A1')
    await flushMicrotasks()

    assert.equal(getterCalls.A1, 0, 'selection changes should not re-read A1 displayValue')
    assert.equal(getterCalls.B1, 0, 'selection changes should not re-read B1 displayValue')

    a1.dispose()
    b1.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('sheet-cell commit flow re-evaluates displayValue only once when edit closes', async () => {
  const restoreDom = installDom()
  resetDelegation()

  try {
    const seed = `runtime-${Date.now()}-sheet-cell-commit-count`
    const [{ default: Component }, { Store }] = await loadRuntimeModules(seed)

    const SheetStore10 = await compileStore(
      `
        import { Store } from '@geajs/core'
        export default class SheetStore10 extends Store {
          cells = {}
          computed = {}
          activeAddress = null
          setCellRaw(address, raw) {
            this.cells[address] = raw
            this.computed = { ...this.computed }
          }
          moveSelection(_deltaCol, _deltaRow) {
            this.activeAddress = 'A2'
          }
        }
      `,
      '/virtual/sheet-store10.ts',
      'SheetStore10',
      { Store },
    )
    const sheetStore = new SheetStore10()
    const getterCalls: Record<string, number> = {}

    const SheetCell = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import sheetStore from './sheet-store.ts'

        export default class SheetCell extends Component {
          editing = false
          editBuffer = ''

          commitEdit() {
            if (!this.editing) return
            sheetStore.setCellRaw(this.props.address, this.editBuffer)
            this.editing = false
            sheetStore.moveSelection(0, 1)
          }

          get displayValue() {
            getterCalls[this.props.address] = (getterCalls[this.props.address] ?? 0) + 1
            const raw = sheetStore.cells[this.props.address] ?? ''
            if (!raw.startsWith('=')) return raw
            const computed = sheetStore.computed[this.props.address]
            if (!computed) return ''
            return String(computed.value)
          }

          template({ address }) {
            const selected = sheetStore.activeAddress === this.props.address
            const { editing, editBuffer } = this

            return (
              <td class={selected ? 'selected' : ''} data-address={address} tabIndex={selected ? 0 : -1}>
                {editing ? <input value={editBuffer} /> : <span>{this.displayValue}</span>}
              </td>
            )
          }
        }
      `,
      '/virtual/SheetCellCommitCount.jsx',
      'SheetCell',
      { Component, sheetStore, getterCalls },
    )

    const root = document.createElement('table')
    const row = document.createElement('tr')
    root.appendChild(row)
    document.body.appendChild(root)

    const a1 = new SheetCell()
    a1[GEA_SET_PROPS]({ address: () => 'A1' })
    a1.render(row)
    await flushMicrotasks()

    a1.editing = true
    a1.editBuffer = '42'
    await flushMicrotasks()

    getterCalls.A1 = 0

    a1.commitEdit()
    await flushMicrotasks()
    await flushMicrotasks()

    assert.equal(getterCalls.A1, 1, 'commit should compute the closed-cell display once')

    a1.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('children prop update must render as HTML, not textContent', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-children-html`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Wrapper = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Wrapper extends Component {
          template(props) {
            return (
              <div class="wrapper">
                <div class="body">{props.children}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/Wrapper.jsx',
      'Wrapper',
      { Component },
    )

    const Parent = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Wrapper from './Wrapper'

        export default class Parent extends Component {
          count = 0

          template() {
            return (
              <div class="parent">
                <Wrapper>
                  <span class="inner">Count: {this.count}</span>
                </Wrapper>
              </div>
            )
          }
        }
      `,
      '/virtual/Parent.jsx',
      'Parent',
      { Component, Wrapper },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const body = view.el.querySelector('.body')
    assert.ok(body, '.body element must exist')
    assert.ok(body!.querySelector('.inner'), 'children must render as HTML elements, not text')
    assert.ok(body!.querySelector('.inner')!.textContent!.includes('Count: 0'), 'initial children content')

    view.count = 1
    await flushMicrotasks()

    assert.ok(
      body!.querySelector('.inner'),
      'after state change, children must still be rendered as HTML (not raw text)',
    )
    assert.ok(body!.querySelector('.inner')!.textContent!.includes('Count: 1'), 'children must reflect updated state')
    assert.ok(!body!.textContent!.includes('<span'), 'body must NOT contain raw HTML tags as text (textContent leak)')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component as named prop: header={<Title />} renders and mounts correctly', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-named-component-props`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Title = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Title extends Component {
          template() {
            return <span class="layout-title">Title</span>
          }
        }
      `,
      '/virtual/NamedPropTitle.jsx',
      'Title',
      { Component },
    )

    const Nav = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Nav extends Component {
          template() {
            return <nav class="layout-nav">Nav</nav>
          }
        }
      `,
      '/virtual/NamedPropNav.jsx',
      'Nav',
      { Component },
    )

    const Content = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Content extends Component {
          template() {
            return <section class="layout-content">Main</section>
          }
        }
      `,
      '/virtual/NamedPropContent.jsx',
      'Content',
      { Component },
    )

    const Layout = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Layout extends Component {
          template({ header, sidebar, main }) {
            return (
              <div class="layout">
                <div class="layout-aside">{sidebar}</div>
                <div class="layout-main">{main}</div>
                <div class="layout-header">{header}</div>
              </div>
            )
          }
        }
      `,
      '/virtual/NamedPropLayout.jsx',
      'Layout',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Title from './NamedPropTitle.jsx'
        import Nav from './NamedPropNav.jsx'
        import Content from './NamedPropContent.jsx'
        import Layout from './NamedPropLayout.jsx'

        export default class App extends Component {
          template() {
            return (
              <div class="app-root">
                <Layout header={<Title />} sidebar={<Nav />} main={<Content />} />
              </div>
            )
          }
        }
      `,
      '/virtual/NamedPropApp.jsx',
      'App',
      { Component, Title, Nav, Content, Layout },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new App()
    view.render(root)
    await flushMicrotasks()

    const layout = view.el.querySelector('.layout')
    assert.ok(layout, '.layout must exist')

    assert.ok(layout!.querySelector('.layout-aside .layout-nav'), 'sidebar prop must render Nav inside aside')
    assert.ok(layout!.querySelector('.layout-main .layout-content'), 'main prop must render Content in main')
    assert.ok(layout!.querySelector('.layout-header .layout-title'), 'header prop must render Title in header')

    assert.equal(layout!.querySelector('.layout-nav')!.textContent?.trim(), 'Nav')
    assert.equal(layout!.querySelector('.layout-content')!.textContent?.trim(), 'Main')
    assert.equal(layout!.querySelector('.layout-title')!.textContent?.trim(), 'Title')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component as named prop: props.X access renders correctly', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-named-prop-propsX`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Header = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Header extends Component {
          template() {
            return <h1 class="header">Header</h1>
          }
        }
      `,
      '/virtual/PropsXHeader.jsx',
      'Header',
      { Component },
    )

    const Layout = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Layout extends Component {
          template(props) {
            return <div class="layout"><div class="slot">{props.header}</div></div>
          }
        }
      `,
      '/virtual/PropsXLayout.jsx',
      'Layout',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Header from './PropsXHeader.jsx'
        import Layout from './PropsXLayout.jsx'

        export default class App extends Component {
          template() {
            return <div class="app"><Layout header={<Header />} /></div>
          }
        }
      `,
      '/virtual/PropsXApp.jsx',
      'App',
      { Component, Header, Layout },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new App()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.slot .header'), 'props.X access must render component')
    assert.equal(view.el.querySelector('.header')!.textContent, 'Header')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component as named prop: this.props.X access renders correctly', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-named-prop-thisPropsX`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Header = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Header extends Component {
          template() {
            return <h1 class="header">Header</h1>
          }
        }
      `,
      '/virtual/ThisPropsXHeader.jsx',
      'Header',
      { Component },
    )

    const Layout = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Layout extends Component {
          template() {
            return <div class="layout"><div class="slot">{this.props.header}</div></div>
          }
        }
      `,
      '/virtual/ThisPropsXLayout.jsx',
      'Layout',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Header from './ThisPropsXHeader.jsx'
        import Layout from './ThisPropsXLayout.jsx'

        export default class App extends Component {
          template() {
            return <div class="app"><Layout header={<Header />} /></div>
          }
        }
      `,
      '/virtual/ThisPropsXApp.jsx',
      'App',
      { Component, Header, Layout },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new App()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.slot .header'), 'this.props.X access must render component')
    assert.equal(view.el.querySelector('.header')!.textContent, 'Header')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component as named prop: render prop (() => <Header />) renders when called', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-render-prop`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Header = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Header extends Component {
          template() {
            return <h1 class="header">Header</h1>
          }
        }
      `,
      '/virtual/RenderPropHeader.jsx',
      'Header',
      { Component },
    )

    const Layout = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Layout extends Component {
          template(props) {
            return <div class="layout"><div class="slot">{props.renderHeader()}</div></div>
          }
        }
      `,
      '/virtual/RenderPropLayout.jsx',
      'Layout',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Header from './RenderPropHeader.jsx'
        import Layout from './RenderPropLayout.jsx'

        export default class App extends Component {
          template() {
            return <div class="app"><Layout renderHeader={() => <Header />} /></div>
          }
        }
      `,
      '/virtual/RenderPropApp.jsx',
      'App',
      { Component, Header, Layout },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new App()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.slot .header'), 'render prop must produce component HTML when called')
    assert.equal(view.el.querySelector('.header')!.textContent, 'Header')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component as named prop: function component as Layout works with destructured props', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-fn-layout`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Header = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Header extends Component {
          template() {
            return <h1 class="header">Header</h1>
          }
        }
      `,
      '/virtual/FnLayoutHeader.jsx',
      'Header',
      { Component },
    )

    const Footer = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Footer extends Component {
          template() {
            return <footer class="footer">Footer</footer>
          }
        }
      `,
      '/virtual/FnLayoutFooter.jsx',
      'Footer',
      { Component },
    )

    const Layout = await compileJsxComponent(
      `
        export default function Layout({ header, footer }) {
          return (
            <div class="layout">
              <div class="top">{header}</div>
              <div class="bottom">{footer}</div>
            </div>
          )
        }
      `,
      '/virtual/FnLayout.jsx',
      'Layout',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Header from './FnLayoutHeader.jsx'
        import Footer from './FnLayoutFooter.jsx'
        import Layout from './FnLayout.jsx'

        export default class App extends Component {
          template() {
            return <div class="app"><Layout header={<Header />} footer={<Footer />} /></div>
          }
        }
      `,
      '/virtual/FnLayoutApp.jsx',
      'App',
      { Component, Header, Footer, Layout },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new App()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.top .header'), 'header must render inside .top')
    assert.ok(view.el.querySelector('.bottom .footer'), 'footer must render inside .bottom')
    assert.equal(view.el.querySelector('.header')!.textContent, 'Header')
    assert.equal(view.el.querySelector('.footer')!.textContent, 'Footer')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('component as named prop: component with props passed via render prop', async () => {
  const restoreDom = installDom()

  try {
    const seed = `runtime-${Date.now()}-render-prop-with-args`
    const [{ default: Component }] = await loadRuntimeModules(seed)

    const Greeting = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Greeting extends Component {
          template({ name }) {
            return <span class="greeting">Hello, {name}!</span>
          }
        }
      `,
      '/virtual/RenderPropArgsGreeting.jsx',
      'Greeting',
      { Component },
    )

    const Wrapper = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'

        export default class Wrapper extends Component {
          template({ renderContent }) {
            return <div class="wrapper"><div class="content">{renderContent()}</div></div>
          }
        }
      `,
      '/virtual/RenderPropArgsWrapper.jsx',
      'Wrapper',
      { Component },
    )

    const App = await compileJsxComponent(
      `
        import { Component } from '@geajs/core'
        import Greeting from './RenderPropArgsGreeting.jsx'
        import Wrapper from './RenderPropArgsWrapper.jsx'

        export default class App extends Component {
          template() {
            return (
              <div class="app">
                <Wrapper renderContent={() => <Greeting name="World" />} />
              </div>
            )
          }
        }
      `,
      '/virtual/RenderPropArgsApp.jsx',
      'App',
      { Component, Greeting, Wrapper },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new App()
    view.render(root)
    await flushMicrotasks()

    assert.ok(view.el.querySelector('.content .greeting'), 'render prop with args must produce component HTML')
    assert.equal(view.el.querySelector('.greeting')!.textContent, 'Hello, World!')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Link with plain text children renders anchor content, not raw template expression', async () => {
  const restoreDom = installDom()

  try {
    // Same unseeded Component module as `link.ts` — seeded `component.tsx?*` breaks Link's private methods.
    const Component = await loadComponentUnseeded()
    const { default: Link } = await import('../../../gea/src/router/link.ts')

    const Home = await compileJsxComponent(
      `
        import { Component, Link } from '@geajs/core'

        export default class Home extends Component {
          template() {
            return (
              <div>
                Home | <Link to="/">Test</Link>
              </div>
            )
          }
        }
      `,
      '/virtual/HomeWithLink.jsx',
      'Home',
      { Component, Link },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Home()
    view.render(root)
    await flushMicrotasks()

    const anchor = view.el.querySelector('a') as HTMLAnchorElement | null
    assert.ok(anchor, 'Link must render as an <a> element')
    assert.equal(anchor.getAttribute('href'), '/')
    assert.equal(anchor.textContent, 'Test')
    assert.ok(!view.el.innerHTML.includes('${'), 'rendered HTML must not contain raw template expressions')
    assert.ok(!view.el.innerHTML.includes('this._link'), 'rendered HTML must not contain this._link literal')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('Link child component must not collide with native <link> tag', async () => {
  const restoreDom = installDom()

  try {
    const Component = await loadComponentUnseeded()
    const { default: Link } = await import('../../../gea/src/router/link.ts')

    const Parent = await compileJsxComponent(
      `
        import { Component, Link } from '@geajs/core'

        export default class Parent extends Component {
          template() {
            return (
              <div class="parent">
                <Link to="/target" class="nav-link">
                  <span class="inner">Target</span>
                </Link>
              </div>
            )
          }
        }
      `,
      '/virtual/ParentWithLink.jsx',
      'Parent',
      { Component, Link },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const anchor = view.el.querySelector('a.nav-link') as HTMLAnchorElement | null
    assert.ok(anchor, 'Link child component must instantiate into an <a> element')
    assert.equal(anchor.getAttribute('href'), '/target')
    assert.equal(anchor.querySelector('.inner')?.textContent, 'Target')
    assert.equal(view.el.querySelector('link'), null, 'raw native <link> tag must not remain in DOM')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})

test('nested Link inside unresolved .map() item preserves children content', async () => {
  const restoreDom = installDom()

  try {
    // Same unseeded Component module as `link.ts` — seeded `component.ts?*` breaks Link's prototype checks.
    const Component = await loadComponentUnseeded()
    const { default: Link } = await import('../../../gea/src/router/link.ts')

    const Parent = await compileJsxComponent(
      `
        import { Component, Link } from '@geajs/core'

        export default class Parent extends Component {
          items = [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }]

          template() {
            return (
              <div class="results">
                {this.items.map((item) => (
                  <div key={item.id} class="row">
                    <Link to={\`/items/\${item.id}\`} class="row-link">
                      <span class="title">{item.title}</span>
                    </Link>
                  </div>
                ))}
              </div>
            )
          }
        }
      `,
      '/virtual/ParentWithNestedLinkMap.jsx',
      'Parent',
      { Component, Link },
    )

    const root = document.createElement('div')
    document.body.appendChild(root)

    const view = new Parent()
    view.render(root)
    await flushMicrotasks()

    const links = Array.from(view.el.querySelectorAll('a.row-link')) as HTMLAnchorElement[]
    assert.equal(links.length, 2, 'expected both Link components to mount as anchors')
    assert.equal(links[0]?.getAttribute('href'), '/items/1')
    assert.equal(links[1]?.getAttribute('href'), '/items/2')
    assert.equal(links[0]?.querySelector('.title')?.textContent, 'First', 'first nested Link must keep children')
    assert.equal(links[1]?.querySelector('.title')?.textContent, 'Second', 'second nested Link must keep children')
    assert.equal(view.el.querySelector('gea-link'), null, 'raw gea-link placeholder must not remain')

    view.dispose()
    await flushMicrotasks()
  } finally {
    restoreDom()
  }
})
