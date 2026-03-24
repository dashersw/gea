import * as datepicker from '@zag-js/date-picker'
import { normalizeProps, spreadProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

const CHEVRON_LEFT = `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M13.293 6.293 7.586 12l5.707 5.707 1.414-1.414L10.414 12l4.293-4.293z"></path></svg>`
const CHEVRON_RIGHT = `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M10.707 17.707 16.414 12l-5.707-5.707-1.414 1.414L13.586 12l-4.293 4.293z"></path></svg>`

export interface DatePickerProps extends datepicker.Props {
  class?: string
  label?: string
}

export default class DatePicker extends ZagComponent<DatePickerProps> {
  declare open: boolean
  declare value: datepicker.DateValue[]
  declare valueAsString: string[]
  declare _gridCleanups: Array<() => void>

  createMachine(_props: DatePickerProps): datepicker.Machine {
    return datepicker.machine
  }

  getMachineProps(props: DatePickerProps): datepicker.Props {
    const { class: _class, label: _label, ...machineProps } = props

    return {
      ...machineProps,
      id: this.id,
      closeOnSelect: props.closeOnSelect ?? true,
      onValueChange: (details: datepicker.ValueChangeDetails) => {
        this.value = details.value
        this.valueAsString = details.valueAsString
        props.onValueChange?.(details)
      },
      onOpenChange: (details: datepicker.OpenChangeDetails) => {
        this.open = details.open
        props.onOpenChange?.(details)
      },
      onViewChange: props.onViewChange,
      onFocusChange: props.onFocusChange,
      onVisibleRangeChange: props.onVisibleRangeChange,
    }
  }

  connectApi(service: datepicker.Service): datepicker.Api {
    return datepicker.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="input"]': 'getInputProps',
      '[data-part="trigger"]': 'getTriggerProps',

      '[data-part="positioner"]': 'getPositionerProps',
      '[data-part="content"]': 'getContentProps',
    }
  }

  syncState(api: datepicker.Api): void {
    this.open = api.open
    this.value = api.value
    this.valueAsString = api.valueAsString
  }

  _applyAllSpreads() {
    if (this._api) {
      this.syncState(this._api)
      this._renderGrid(this._api)
    }
    super._applyAllSpreads()
  }

  _renderViewControl(api: datepicker.Api, view: datepicker.DateView, label: string): HTMLElement {
    const vc = document.createElement('div')
    vc.className = 'date-picker-view-control flex items-center justify-between mb-2'
    vc.setAttribute('data-part', 'view-control')
    this._gridCleanups.push(spreadProps(vc, api.getViewControlProps({ view })))

    const prev = document.createElement('button')
    prev.className = 'date-picker-prev-trigger inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent'
    prev.innerHTML = CHEVRON_LEFT
    this._gridCleanups.push(spreadProps(prev, api.getPrevTriggerProps({ view })))

    const labelEl = document.createElement('button')
    labelEl.className = 'date-picker-view-trigger text-sm font-medium hover:bg-accent rounded-md px-2 py-1'
    labelEl.textContent = label
    this._gridCleanups.push(spreadProps(labelEl, api.getViewTriggerProps({ view })))

    const next = document.createElement('button')
    next.className = 'date-picker-next-trigger inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent'
    next.innerHTML = CHEVRON_RIGHT
    this._gridCleanups.push(spreadProps(next, api.getNextTriggerProps({ view })))

    vc.appendChild(prev)
    vc.appendChild(labelEl)
    vc.appendChild(next)
    return vc
  }

  _renderDayView(api: datepicker.Api): HTMLElement {
    const wrap = document.createElement('div')

    wrap.appendChild(this._renderViewControl(api, 'day', api.visibleRangeText?.start ?? ''))

    const table = document.createElement('table')
    table.className = 'date-picker-table w-full border-collapse'
    this._gridCleanups.push(spreadProps(table, api.getTableProps({ view: 'day' })))

    const thead = document.createElement('thead')
    this._gridCleanups.push(spreadProps(thead, api.getTableHeaderProps({ view: 'day' })))
    const headerRow = document.createElement('tr')
    this._gridCleanups.push(spreadProps(headerRow, api.getTableRowProps({ view: 'day' })))
    for (const day of api.weekDays) {
      const th = document.createElement('th')
      th.scope = 'col'
      th.className = 'date-picker-weekday text-muted-foreground text-xs font-normal h-8 w-8 text-center'
      th.setAttribute('aria-label', day.long)
      th.textContent = day.narrow
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')
    this._gridCleanups.push(spreadProps(tbody, api.getTableBodyProps({ view: 'day' })))
    for (const week of api.weeks) {
      const tr = document.createElement('tr')
      this._gridCleanups.push(spreadProps(tr, api.getTableRowProps({ view: 'day' })))
      for (const day of week) {
        const td = document.createElement('td')
        td.className = 'date-picker-day-cell text-center p-0'
        this._gridCleanups.push(spreadProps(td, api.getDayTableCellProps({ value: day })))

        const div = document.createElement('div')
        div.className = 'date-picker-day-cell-trigger inline-flex h-8 w-8 items-center justify-center rounded-md text-sm cursor-pointer hover:bg-accent data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[today]:border data-[today]:border-input data-[outside-range]:text-muted-foreground data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
        div.textContent = String(day.day)
        this._gridCleanups.push(spreadProps(div, api.getDayTableCellTriggerProps({ value: day })))

        td.appendChild(div)
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    wrap.appendChild(table)
    return wrap
  }

  _renderGridView(api: datepicker.Api, view: 'month' | 'year'): HTMLElement {
    const isMonth = view === 'month'
    const wrap = document.createElement('div')
    let viewLabel: string
    if (isMonth) {
      viewLabel = String(api.visibleRange?.start?.year ?? '')
    } else {
      const decade = api.getDecade()
      viewLabel = `${decade.start} – ${decade.end}`
    }

    wrap.appendChild(this._renderViewControl(api, view, viewLabel))

    const table = document.createElement('table')
    table.className = 'date-picker-table w-full border-collapse'
    this._gridCleanups.push(spreadProps(table, api.getTableProps({ view, columns: 4 })))

    const tbody = document.createElement('tbody')
    this._gridCleanups.push(spreadProps(tbody, api.getTableBodyProps({ view })))
    const grid = isMonth
      ? api.getMonthsGrid({ columns: 4, format: 'short' })
      : api.getYearsGrid({ columns: 4 })
    for (const row of grid) {
      const tr = document.createElement('tr')
      this._gridCleanups.push(spreadProps(tr, api.getTableRowProps({ view })))
      for (const cell of row) {
        const td = document.createElement('td')
        td.className = `date-picker-${view}-cell text-center p-0`
        const cellProps = isMonth
          ? api.getMonthTableCellProps({ ...cell, columns: 4 })
          : api.getYearTableCellProps({ ...cell, columns: 4 })
        this._gridCleanups.push(spreadProps(td, cellProps))

        const div = document.createElement('div')
        div.className = `date-picker-${view}-cell-trigger inline-flex items-center justify-center rounded-md text-sm py-1.5 px-2 w-full cursor-pointer hover:bg-accent data-[selected]:bg-primary data-[selected]:text-primary-foreground`
        div.textContent = cell.label
        const triggerProps = isMonth
          ? api.getMonthTableCellTriggerProps({ ...cell, columns: 4 })
          : api.getYearTableCellTriggerProps({ ...cell, columns: 4 })
        this._gridCleanups.push(spreadProps(div, triggerProps))

        td.appendChild(div)
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    wrap.appendChild(table)
    return wrap
  }

  _renderGrid(api: datepicker.Api): void {
    const content = this.$$('[data-part="content"]')[0] as HTMLElement | undefined
    if (!content) return

    if (!this._gridCleanups) this._gridCleanups = []
    for (const cleanup of this._gridCleanups) cleanup()
    this._gridCleanups = []

    content.innerHTML = ''

    if (api.view === 'day') {
      content.appendChild(this._renderDayView(api))
    } else if (api.view === 'month') {
      content.appendChild(this._renderGridView(api, 'month'))
    } else {
      content.appendChild(this._renderGridView(api, 'year'))
    }
  }

  dispose() {
    if (this._gridCleanups) {
      for (const cleanup of this._gridCleanups) cleanup()
      this._gridCleanups = []
    }
    super.dispose()
  }

  template(props: DatePickerProps) {
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="date-picker-label text-sm font-medium mb-1 block">
            {props.label}
          </label>
        )}
        <div data-part="control" class="date-picker-control flex">
          <input
            data-part="input"
            class="date-picker-input flex h-9 w-full rounded-l-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            data-part="trigger"
            class="date-picker-trigger inline-flex h-9 items-center justify-center rounded-r-md border border-l-0 border-input px-2 hover:bg-accent"
          >
            <svg
              stroke="currentColor"
              fill="currentColor"
              stroke-width="0"
              viewBox="0 0 24 24"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M7 11h2v2H7zm0 4h2v2H7zm4-4h2v2h-2zm0 4h2v2h-2zm4-4h2v2h-2zm0 4h2v2h-2z" />
              <path d="M5 22h14c1.103 0 2-.897 2-2V6c0-1.103-.897-2-2-2h-2V2h-2v2H9V2H7v2H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2zM19 8l.001 12H5V8h14z" />
            </svg>
          </button>
        </div>
        <div data-part="positioner" class="date-picker-positioner">
          <div data-part="content" class="date-picker-content z-50 min-w-[280px] rounded-md border bg-popover p-3 text-popover-foreground shadow-md" />
        </div>
      </div>
    )
  }
}
