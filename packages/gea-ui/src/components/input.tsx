import { Component } from '@geajs/core'
import { cn } from '../utils/cn'

export default class Input extends Component {
  template(props: any) {
    return (
      <input
        class={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          props.class,
        )}
        type={props.type || 'text'}
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        name={props.name}
        id={props.inputId}
        input={(e: Event) => props.onInput?.(e)}
      />
    )
  }
}
