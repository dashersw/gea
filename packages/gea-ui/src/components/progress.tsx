import * as progress from '@zag-js/progress'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Progress extends ZagComponent {
  declare value: number | null
  percent = 0

  createMachine(_props: any): any {
    return progress.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue ?? 0,
      min: props.min ?? 0,
      max: props.max ?? 100,
      orientation: props.orientation,
      onValueChange: props.onValueChange,
    }
  }

  connectApi(service: any) {
    return progress.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="track"]': 'getTrackProps',
      '[data-part="range"]': 'getRangeProps',
      '[data-part="value-text"]': 'getValueTextProps',
    }
  }

  syncState(api: any) {
    this.value = api.value
    this.percent = api.percent
  }

  template(props: any) {
    return (
      <div data-part="root" class={props.class || ''}>
        <div class="flex justify-between mb-1">
          {props.label && (
            <label data-part="label" class="progress-label text-sm font-medium">
              {props.label}
            </label>
          )}
          <span data-part="value-text" class="progress-value-text text-sm text-muted-foreground">
            {this.percent}%
          </span>
        </div>
        <div data-part="track" class="progress-track relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
          <div
            data-part="range"
            class="progress-range h-full w-full flex-1 bg-primary transition-all"
            style={{ width: `${this.percent}%` }}
          ></div>
        </div>
      </div>
    )
  }
}
