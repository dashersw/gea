import { Component } from '@geajs/core'
import { cn } from '../utils/cn'

export default class Textarea extends Component {
  template(props: any) {
    return (
      <textarea
        class={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          props.class,
        )}
        placeholder={props.placeholder}
        disabled={props.disabled}
        name={props.name}
        rows={props.rows}
        onInput={props.onInput}
      >
        {props.value || ''}
      </textarea>
    )
  }
}
