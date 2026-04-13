import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { installDom, flushMicrotasks } from '../../../../tests/helpers/jsdom-setup'
import { compileJsxComponent, loadComponentUnseeded } from '../helpers/compile'
import { readExampleFile } from '../helpers/example-paths'

/** Unseeded Component matches example stores (`Store` from `@geajs/core`); seeded runtime breaks observer/prototype pairing. */
async function mountFlightCheckin() {
  const Component = await loadComponentUnseeded()
  const { default: store } = await import('../../../../examples/flight-checkin/src/flight-store.ts')
  const { default: optionsStore } = await import('../../../../examples/flight-checkin/src/options-store.ts')
  const { default: paymentStore } = await import('../../../../examples/flight-checkin/src/payment-store.ts')
  const { BASE_TICKET_PRICE, FLIGHT_INFO, LUGGAGE_OPTIONS, MEAL_OPTIONS, SEAT_OPTIONS } =
    await import('../../../../examples/flight-checkin/src/shared/flight-data.ts')

  const StepHeader = await compileJsxComponent(
    readExampleFile('flight-checkin/src/components/StepHeader.tsx'),
    '/virtual/examples/flight-checkin/StepHeader.jsx',
    'StepHeader',
    { Component },
  )
  const OptionItem = await compileJsxComponent(
    readExampleFile('flight-checkin/src/components/OptionItem.tsx'),
    '/virtual/examples/flight-checkin/OptionItem.jsx',
    'OptionItem',
    { Component },
  )
  const OptionStep = await compileJsxComponent(
    readExampleFile('flight-checkin/src/components/OptionStep.tsx'),
    '/virtual/examples/flight-checkin/OptionStep.jsx',
    'OptionStep',
    { Component, OptionItem, StepHeader },
  )
  const PaymentForm = await compileJsxComponent(
    readExampleFile('flight-checkin/src/components/PaymentForm.tsx'),
    '/virtual/examples/flight-checkin/PaymentForm.jsx',
    'PaymentForm',
    { Component },
  )
  const SummaryStep = await compileJsxComponent(
    readExampleFile('flight-checkin/src/components/SummaryStep.tsx'),
    '/virtual/examples/flight-checkin/SummaryStep.jsx',
    'SummaryStep',
    { Component, PaymentForm, StepHeader },
  )
  const BoardingPass = await compileJsxComponent(
    readExampleFile('flight-checkin/src/components/BoardingPass.tsx'),
    '/virtual/examples/flight-checkin/BoardingPass.jsx',
    'BoardingPass',
    { Component },
  )

  const FlightCheckin = await compileJsxComponent(
    readExampleFile('flight-checkin/src/flight-checkin.tsx'),
    '/virtual/examples/flight-checkin/FlightCheckin.jsx',
    'FlightCheckin',
    {
      Component,
      BoardingPass,
      OptionStep,
      SummaryStep,
      store,
      optionsStore,
      paymentStore,
      BASE_TICKET_PRICE,
      FLIGHT_INFO,
      LUGGAGE_OPTIONS,
      MEAL_OPTIONS,
      SEAT_OPTIONS,
    },
  )

  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = new FlightCheckin()
  app.render(root)
  await flushMicrotasks()
  return { app, root }
}

function optionByLabel(root: HTMLElement, labelSubstring: string): HTMLElement | null {
  for (const el of root.querySelectorAll('.option-item')) {
    if (el.textContent?.includes(labelSubstring)) return el as HTMLElement
  }
  return null
}

/** Multiple macrotask rounds so nested Gea renders finish (reduces flakiness under full-suite load). */
async function settleUi(): Promise<void> {
  await flushMicrotasks()
  await flushMicrotasks()
  await flushMicrotasks()
}

/** Wait until an option row appears or timeout (JSDOM can lag behind multi-step store updates). */
async function waitForOption(root: HTMLElement, labelSubstring: string, timeoutMs = 3000): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const el = optionByLabel(root, labelSubstring)
    if (el) return el
    await settleUi()
    await new Promise<void>((r) => setTimeout(r, 5))
  }
  const el = optionByLabel(root, labelSubstring)
  assert.ok(el, `expected .option-item containing ${JSON.stringify(labelSubstring)}`)
  return el
}

function setInputValue(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function typeInputValue(el: HTMLInputElement, value: string) {
  for (const char of value) {
    el.value += char
    el.dispatchEvent(new Event('input', { bubbles: true }))
    await settleUi()
  }
}

describe('examples/flight-checkin in JSDOM (ported from flight-checkin.spec)', { concurrency: false }, () => {
  let restoreDom: () => void
  let root: HTMLElement
  let app: { dispose: () => void }

  beforeEach(async () => {
    restoreDom = installDom()
    const { default: store } = await import('../../../../examples/flight-checkin/src/flight-store.ts')
    store.startOver()
    const m = await mountFlightCheckin()
    app = m.app
    root = m.root
  })

  afterEach(async () => {
    app.dispose()
    await flushMicrotasks()
    root.remove()
    restoreDom()
  })

  it('step 1 luggage options', () => {
    assert.ok(root.querySelector('.flight-checkin'))
    assert.equal(root.querySelector('.step-header h2')?.textContent, 'Select Luggage')
    assert.equal(root.querySelectorAll('.option-item').length, 4)
  })

  it('advance to seat step', async () => {
    ;(root.querySelector('.nav-buttons .btn-primary') as HTMLButtonElement).click()
    await settleUi()
    assert.equal(root.querySelector('.step-header h2')?.textContent, 'Select Seat')
  })

  it('full flow reaches boarding pass', { timeout: 15_000 }, async () => {
    const checked = await waitForOption(root, '1 checked bag')
    checked.click()
    await settleUi()
    ;(root.querySelector('.nav-buttons .btn-primary') as HTMLButtonElement).click()
    await settleUi()

    const economyPlus = await waitForOption(root, 'Economy Plus')
    economyPlus.click()
    await settleUi()
    ;(root.querySelector('.nav-buttons .btn-primary') as HTMLButtonElement).click()
    await settleUi()

    const chicken = await waitForOption(root, 'Chicken')
    chicken.click()
    await settleUi()
    ;(root.querySelector('.nav-buttons .btn-primary') as HTMLButtonElement).click()
    await settleUi()

    assert.equal(root.querySelector('.step-header h2')?.textContent, 'Review & Payment')

    const nameInput = root.querySelector('input[placeholder="Passenger name"]') as HTMLInputElement
    const cardInput = root.querySelector('input[placeholder^="Card number"]') as HTMLInputElement
    const expiryInput = root.querySelector('input[placeholder="MM/YY"]') as HTMLInputElement
    setInputValue(nameInput, 'Jane Smith')
    await typeInputValue(cardInput, '4242 4242 4242 424242')
    await typeInputValue(expiryInput, '12/22')
    await settleUi()

    assert.equal(cardInput.value, '4242 4242 4242 4242')
    assert.equal(expiryInput.value, '12/22')

    const payBtn = [...root.querySelectorAll('.payment-form .btn-primary')].find((b) =>
      b.textContent?.includes('Pay'),
    ) as HTMLButtonElement
    assert.ok(payBtn)
    assert.equal(payBtn.disabled, false)
    payBtn.click()
    await settleUi()

    const viewPass = [...root.querySelectorAll('.nav-buttons .btn-primary')].find((b) =>
      b.textContent?.includes('View Boarding Pass'),
    ) as HTMLButtonElement
    assert.ok(viewPass)
    viewPass.click()
    await settleUi()

    assert.ok(root.querySelector('.boarding-pass'))
    const copySvg = root.querySelector('.confirmation-copy-button svg')
    const copyPath = root.querySelector('.confirmation-copy-button svg path')
    assert.ok(copySvg)
    assert.ok(copyPath)
    assert.equal(copySvg.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(copyPath.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.match(copyPath.getAttribute('d') ?? '', /^M16/)
  })
})
