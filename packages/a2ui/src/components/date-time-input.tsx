import { Component } from '@geajs/core'

interface DateTimeInputProps {
  value?: string
  onInput?: (e: Event) => void
}

/**
 * The DOM event is wired with `input=`, Gea's delegated-event attribute —
 * `onInput=` would compile to a plain DOM attribute and never fire. Same
 * convention as gea-ui's `Input` (input.tsx:19).
 */
export default class DateTimeInput extends Component<DateTimeInputProps> {
  template(props: DateTimeInputProps) {
    return (
      <input
        class="a2ui-datetime"
        type="datetime-local"
        value={props.value}
        input={(e: Event) => props.onInput?.(e)}
      />
    )
  }
}
