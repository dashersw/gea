import { Component } from '@geajs/core'

interface IconProps {
  name?: string
}

export default class Icon extends Component<IconProps> {
  template(props: IconProps) {
    return <span class="a2ui-icon" data-icon={props.name} aria-hidden="true"></span>
  }
}
