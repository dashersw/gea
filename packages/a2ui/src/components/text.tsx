import { Component } from '@geajs/core'

interface TextProps {
  text?: string
  variant?: string
}

/** A2UI `Text`. `variant` (heading/caption/body) maps to a class. */
export default class Text extends Component<TextProps> {
  template(props: TextProps) {
    return <span class={`a2ui-text a2ui-text-${props.variant ?? 'body'}`}>{props.text}</span>
  }
}
