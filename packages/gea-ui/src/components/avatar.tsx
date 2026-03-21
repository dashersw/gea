import * as avatar from '@zag-js/avatar'
import { normalizeProps } from '@zag-js/vanilla'
import ZagComponent from '../primitives/zag-component'

export default class Avatar extends ZagComponent {
  loaded = false

  createMachine(_props: any): any {
    return avatar.machine
  }

  getMachineProps(props: any) {
    return {
      id: this.id,
      onStatusChange: props.onStatusChange,
    }
  }

  connectApi(service: any) {
    return avatar.connect(service, normalizeProps)
  }

  getSpreadMap() {
    return {
      '[data-part="root"]': 'getRootProps',
      '[data-part="image"]': 'getImageProps',
      '[data-part="fallback"]': 'getFallbackProps',
    }
  }

  syncState(api: any) {
    this.loaded = api.loaded
  }

  template(props: any) {
    const initials = props.fallback || (props.name ? props.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : '?')
    return (
      <div data-part="root" class={`avatar-root relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${props.class || ''}`}>
        {props.src
          ? <img data-part="image" src={props.src} alt={props.name || ''} class="avatar-image absolute inset-0 h-full w-full object-cover" />
          : ''}
        <div data-part="fallback" class={`avatar-fallback flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium ${props.src ? 'absolute inset-0' : ''}`}>
          {initials}
        </div>
      </div>
    )
  }
}
