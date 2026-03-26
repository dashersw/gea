import * as ratingGroup from '@zag-js/rating-group'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class RatingGroup extends ZagComponent {
  declare value: number
  declare _allowHalf: boolean

  createMachine(_props: any): any {
    return ratingGroup.machine
  }

  getMachineProps(props: any) {
    this._allowHalf = !!props.allowHalf
    return {
      id: this.id,
      value: props.value,
      defaultValue: props.defaultValue,
      count: props.count ?? 5,
      allowHalf: !!props.allowHalf,
      readOnly: props.readOnly,
      disabled: props.disabled,
      name: props.name,
      form: props.form,
      onValueChange: (details: ratingGroup.ValueChangeDetails) => {
        this.value = details.value
        props.onValueChange?.(details)
      },
    }
  }

  connectApi(service: any) {
    return ratingGroup.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="label"]': 'getLabelProps',
      '[data-part="control"]': 'getControlProps',
      '[data-part="hidden-input"]': 'getHiddenInputProps',
      '[data-part="item"]': (api, el) => {
        const htmlEl = el as HTMLElement
        const index = parseInt(htmlEl.dataset.index || '0', 10)
        const props = api.getItemProps({ index })
        if (this._allowHalf) {
          props.onpointerdown = (e: PointerEvent) => {
            const rect = htmlEl.getBoundingClientRect()
            const isLeftHalf = e.clientX - rect.left < rect.width / 2
            api.setValue(isLeftHalf ? index - 0.5 : index)
          }
        }
        return props
      },
    }
  }

  syncState(api: any) {
    this.value = api.value
  }

  _applyAllSpreads() {
    super._applyAllSpreads()
    if (!this._api || !this.el) return
    const items = this.el.querySelectorAll('[data-part="item"]')
    for (let i = 0; i < items.length; i++) {
      const el = items[i] as HTMLElement
      const index = parseInt(el.dataset.index || '0', 10)
      const state = this._api.getItemState({ index })
      if (state.half) {
        el.style.background = 'linear-gradient(90deg, #facc15 50%, hsl(var(--muted-foreground)) 50%)'
        el.style.backgroundClip = 'text'
        el.style.setProperty('-webkit-background-clip', 'text')
        el.style.setProperty('-webkit-text-fill-color', 'transparent')
      } else {
        el.style.background = ''
        el.style.backgroundClip = ''
        el.style.setProperty('-webkit-background-clip', '')
        el.style.setProperty('-webkit-text-fill-color', '')
      }
    }
  }

  template(props: any) {
    const count = props.count ?? 5
    const items = Array.from({ length: count }, (_, i) => i + 1)
    return (
      <div data-part="root" class={props.class || ''}>
        {props.label && (
          <label data-part="label" class="rating-group-label text-sm font-medium mb-1 block">
            {props.label}
          </label>
        )}
        <div data-part="control" class="rating-group-control flex gap-0.5">
          {items.map((i: number) => (
            <span
              key={i}
              data-part="item"
              data-index={String(i)}
              class="rating-group-item cursor-pointer text-2xl text-muted-foreground data-[highlighted]:text-yellow-400 data-[checked]:text-yellow-400"
              style={{ lineHeight: 1 }}
            >
              &#x2605;
            </span>
          ))}
        </div>
        <input data-part="hidden-input" type="hidden" />
      </div>
    )
  }
}
