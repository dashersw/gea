import { Component } from '@geajs/core'

interface ImageProps {
  url?: string
  alt?: string
}

export default class Image extends Component<ImageProps> {
  template(props: ImageProps) {
    return <img class="a2ui-image" src={props.url} alt={props.alt ?? ''} />
  }
}
