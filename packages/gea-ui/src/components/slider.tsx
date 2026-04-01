import * as slider from '@zag-js/slider'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

const THUMB_CLASS =
  'slider-thumb block h-5 w-5 rounded-full border-2 border-primary bg-background shadow ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default class Slider extends ZagComponent {
  declare value: number[]

  createMachine(_props: any): any {
    return slider.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue ?? [50],
      min: props.min ?? 0,
      max: props.max ?? 100,
      step: props.step ?? 1,
      orientation: props.orientation ?? 'horizontal',
      thumbAlignment: props.thumbAlignment ?? 'center',
      disabled: props.disabled,
      readOnly: props.readOnly,
      name: props.name,
      'aria-label': props['aria-label'],
      onValueChange: (details: slider.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
      onValueChangeEnd: props.onValueChangeEnd,
    }
  }

  connectApi(service: any) {
    return slider.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="track"]': 'getTrackProps',
      '[data-part="range"]': 'getRangeProps',
      '[data-part="thumb"]': (api, el) => {
        const index = parseInt((el as HTMLElement).dataset.index || '0', 10)
        return api.getThumbProps({ index })
      },
      '[data-part="hidden-input"]': (api, el) => {
        const index = parseInt((el as HTMLElement).dataset.index || '0', 10)
        return api.getHiddenInputProps({ index })
      },
    }
  }

  _syncThumbs() {
    if (!this._api || !this.el) return
    const control = this.el.querySelector('[data-part="control"]')
    if (!control) return

    const thumbCount = this._api.value.length
    const existing = control.querySelectorAll(':scope > [data-part="thumb"]')

    if (existing.length === thumbCount) return

    if (existing.length < thumbCount) {
      for (let i = existing.length; i < thumbCount; i++) {
        const thumb = document.createElement('div')
        thumb.setAttribute('data-part', 'thumb')
        thumb.setAttribute('data-index', String(i))
        thumb.className = THUMB_CLASS

        const input = document.createElement('input')
        input.setAttribute('data-part', 'hidden-input')
        input.setAttribute('data-index', String(i))
        input.type = 'hidden'
        thumb.appendChild(input)

        control.appendChild(thumb)
      }
    } else {
      for (let i = existing.length - 1; i >= thumbCount; i--) {
        existing[i].remove()
      }
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  _applyAllSpreads() {
    this._syncThumbs()
    this._elementCache?.clear()
    super._applyAllSpreads()
  }

  template(props: any) {
    return (
      <div data-part="root" class={'w-full ' + (props.class || '')}>
        {props.label && (
          <div class="flex justify-between mb-2">
            <label data-part="label" class="slider-label text-sm font-medium">
              {props.label}
            </label>
          </div>
        )}
        <div data-part="control" class="slider-control relative flex items-center">
          <div
            data-part="track"
            class="slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20"
          >
            <div data-part="range" class="slider-range absolute h-full bg-primary"></div>
          </div>
          <div data-part="thumb" data-index="0" class={THUMB_CLASS}>
            <input data-part="hidden-input" data-index="0" type="hidden" />
          </div>
        </div>
      </div>
    )
  }
}
